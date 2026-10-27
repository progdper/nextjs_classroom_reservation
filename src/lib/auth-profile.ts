import 'server-only';

import type { User } from '@supabase/supabase-js';
import { Prisma } from '@/generated_prisma/client';
import { UserRole } from '@/generated_prisma/enums';
import { getDb } from '@/lib/db';
import { getNicknameKey, nicknameSchema } from '@/lib/auth-validation';
import type { AuthResult } from '@/lib/auth-result';

function profileFailure(error: unknown): AuthResult {
  const code =
    error instanceof Prisma.PrismaClientKnownRequestError
      ? error.code
      : 'UNKNOWN';

  if (code === 'P2002') {
    return {
      ok: false,
      message:
        '이미 사용 중인 닉네임이거나 계정 정보가 충돌합니다. 다른 닉네임을 입력하거나 관리자에게 문의해 주세요.',
    };
  }

  console.error('auth.profile', { code });
  return {
    ok: false,
    message: '사용자 정보를 저장할 수 없습니다. 잠시 후 다시 시도해 주세요.',
  };
}

export async function checkNicknameAvailable(
  nickname: string,
): Promise<AuthResult> {
  try {
    const existing = await getDb().user.findUnique({
      where: { nicknameKey: getNicknameKey(nickname) },
      select: { id: true },
    });
    return {
      ok: !existing,
      message: existing ? '이미 사용 중인 닉네임입니다.' : '',
    };
  } catch (error) {
    return profileFailure(error);
  }
}

export async function saveProfileNickname(
  authUser: User,
  input: unknown,
): Promise<AuthResult> {
  const parsed = nicknameSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0].message };
  if (!authUser.email)
    return { ok: false, message: '계정 이메일을 확인할 수 없습니다.' };

  const nickname = parsed.data;
  const nicknameKey = getNicknameKey(nickname);
  try {
    await getDb().user.upsert({
      where: { authUserId: authUser.id },
      create: {
        authUserId: authUser.id,
        email: authUser.email,
        nickname,
        nicknameKey,
        role: UserRole.USER,
      },
      update: { nickname, nicknameKey },
    });
    return { ok: true, message: '닉네임을 저장했습니다.' };
  } catch (error) {
    return profileFailure(error);
  }
}

export async function ensureAppProfile(authUser: User): Promise<AuthResult> {
  try {
    const existing = await getDb().user.findUnique({
      where: { authUserId: authUser.id },
      select: { nickname: true, nicknameKey: true },
    });
    if (existing?.nickname && existing.nicknameKey)
      return { ok: true, message: '' };
    if (existing)
      return { ok: false, message: '내 정보에서 닉네임 등록을 마쳐 주세요.' };

    const nickname = nicknameSchema.safeParse(authUser.user_metadata.nickname);
    if (!nickname.success || !authUser.email)
      return { ok: false, message: '내 정보에서 닉네임 등록을 마쳐 주세요.' };

    await getDb().user.create({
      data: {
        authUserId: authUser.id,
        email: authUser.email,
        nickname: nickname.data,
        nicknameKey: getNicknameKey(nickname.data),
        role: UserRole.USER,
      },
    });
    return { ok: true, message: '' };
  } catch (error) {
    // Concurrent login may already have created this same account.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      try {
        const existing = await getDb().user.findUnique({
          where: { authUserId: authUser.id },
          select: { nickname: true, nicknameKey: true },
        });
        if (existing?.nickname && existing.nicknameKey)
          return { ok: true, message: '' };
      } catch (lookupError) {
        return profileFailure(lookupError);
      }
    }
    return profileFailure(error);
  }
}
