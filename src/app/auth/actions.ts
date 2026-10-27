'use server';

import type { AuthError } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { requireAuthUser } from '@/lib/auth';
import {
  checkNicknameAvailable,
  ensureAppProfile,
  saveProfileNickname,
} from '@/lib/auth-profile';
import {
  loginSchema,
  nicknameChangeSchema,
  passwordChangeSchema,
  signupSchema,
} from '@/lib/auth-validation';
import type { AuthResult } from '@/lib/auth-result';
import { createSupabaseActionClient } from '@/lib/supabase/server';

function authFailure(
  operation: string,
  error: AuthError,
  message: string,
): AuthResult {
  console.error(operation, {
    code: error.code ?? error.name,
    status: error.status ?? null,
  });
  return { ok: false, message };
}

async function runAction(
  operation: string,
  action: () => Promise<AuthResult>,
): Promise<AuthResult> {
  try {
    return await action();
  } catch (error) {
    unstable_rethrow(error);
    console.error(operation, { code: 'UNEXPECTED' });
    return {
      ok: false,
      message: '요청을 처리할 수 없습니다. 잠시 후 다시 시도해 주세요.',
    };
  }
}

export async function signup(formData: FormData): Promise<AuthResult> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0].message };

  return runAction('auth.signup', async () => {
    const availability = await checkNicknameAvailable(parsed.data.nickname);
    if (!availability.ok) return availability;

    const supabase = await createSupabaseActionClient();
    const current = await supabase.auth.getUser();
    if (current.data.user)
      return {
        ok: false,
        message: '새 계정으로 가입하려면 먼저 로그아웃해 주세요.',
      };
    if (
      current.error &&
      current.error.name !== 'AuthSessionMissingError' &&
      ![400, 401, 403].includes(current.error.status ?? 0)
    ) {
      return authFailure(
        'auth.signup-session',
        current.error,
        '로그인 상태를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.',
      );
    }

    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: { data: { nickname: parsed.data.nickname } },
    });
    if (error)
      return authFailure(
        'auth.signup',
        error,
        '가입할 수 없습니다. 이미 가입했다면 로그인해 주세요.',
      );
    if (!data.session || !data.user) {
      return {
        ok: false,
        message:
          '즉시 가입을 완료하지 못했습니다. 관리자에게 가입 설정을 문의해 주세요.',
      };
    }

    const verified = await supabase.auth.getUser();
    if (verified.error)
      return authFailure(
        'auth.signup-verify',
        verified.error,
        '가입 요청 후 로그인 확인에 실패했습니다. 다시 로그인해 주세요.',
      );
    if (!verified.data.user || verified.data.user.id !== data.user.id)
      return {
        ok: false,
        message: '가입 계정을 확인할 수 없습니다. 다시 로그인해 주세요.',
      };

    const profile = await ensureAppProfile(verified.data.user);
    revalidatePath('/', 'layout');
    return {
      ok: true,
      message: profile.ok
        ? '회원가입이 완료되었습니다.'
        : '계정이 생성되었습니다. 내 정보에서 사용자 정보 등록을 마쳐 주세요.',
      redirectTo: profile.ok ? '/account' : '/account?reason=profile-required',
    };
  });
}

export async function login(formData: FormData): Promise<AuthResult> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0].message };

  return runAction('auth.login', async () => {
    const supabase = await createSupabaseActionClient();
    const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error)
      return authFailure(
        'auth.login',
        error,
        '이메일과 비밀번호를 확인해 주세요.',
      );
    if (!data.user || !data.session)
      return {
        ok: false,
        message: '로그인에 실패했습니다. 다시 시도해 주세요.',
      };
    const profile = await ensureAppProfile(data.user);
    revalidatePath('/', 'layout');
    return {
      ok: true,
      message: '로그인했습니다.',
      redirectTo: profile.ok ? '/account' : '/account?reason=profile-required',
    };
  });
}

export async function logout(): Promise<AuthResult> {
  return runAction('auth.logout', async () => {
    const supabase = await createSupabaseActionClient();
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error)
      return authFailure(
        'auth.logout',
        error,
        '로그아웃하지 못했습니다. 다시 시도해 주세요.',
      );
    revalidatePath('/', 'layout');
    return { ok: true, message: '로그아웃했습니다.', redirectTo: '/login' };
  });
}

export async function changeNickname(formData: FormData): Promise<AuthResult> {
  const parsed = nicknameChangeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0].message };

  return runAction('auth.nickname', async () => {
    const authUser = await requireAuthUser();
    const result = await saveProfileNickname(authUser, parsed.data.nickname);
    if (result.ok) revalidatePath('/', 'layout');
    return result;
  });
}

export async function changePassword(formData: FormData): Promise<AuthResult> {
  const parsed = passwordChangeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0].message };

  return runAction('auth.password', async () => {
    const authUser = await requireAuthUser();
    if (!authUser.email)
      return { ok: false, message: '계정 이메일을 확인할 수 없습니다.' };
    const supabase = await createSupabaseActionClient();
    const current = await supabase.auth.signInWithPassword({
      email: authUser.email,
      password: parsed.data.currentPassword,
    });
    if (current.error)
      return authFailure(
        'auth.password-check',
        current.error,
        '현재 비밀번호를 확인해 주세요.',
      );
    if (current.data.user?.id !== authUser.id)
      return { ok: false, message: '비밀번호 변경 계정을 확인할 수 없습니다.' };
    const { error } = await supabase.auth.updateUser({
      current_password: parsed.data.currentPassword,
      password: parsed.data.newPassword,
    });
    if (error)
      return authFailure(
        'auth.password-change',
        error,
        '비밀번호를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      );
    const signedOut = await supabase.auth.signOut({ scope: 'local' });
    if (signedOut.error)
      return authFailure(
        'auth.password-signout',
        signedOut.error,
        '비밀번호는 변경되었지만 로그아웃에 실패했습니다. 새 비밀번호를 사용하고 로그아웃을 다시 시도해 주세요.',
      );
    revalidatePath('/', 'layout');
    return {
      ok: true,
      message: '비밀번호를 변경했습니다.',
      redirectTo: '/login?reason=password-changed',
    };
  });
}
