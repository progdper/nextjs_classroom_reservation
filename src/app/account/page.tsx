import { Suspense } from 'react';
import { AuthForm } from '@/app/auth/auth-form';
import { requireAuthUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

async function AccountContent() {
  const authUser = await requireAuthUser();
  let profile;
  try {
    profile = await getDb().user.findUnique({
      where: { authUserId: authUser.id },
      select: { nickname: true, nicknameKey: true, role: true },
    });
  } catch {
    console.error('auth.account-read', { code: 'PROFILE_READ_FAILED' });
    return (
      <main className="mx-auto w-full max-w-2xl space-y-6 px-5 py-12">
        <h1 className="text-3xl font-semibold">내 정보</h1>
        <p role="alert">
          사용자 정보를 불러오지 못했습니다. 잠시 후 새로고침하거나 관리자에게
          문의해 주세요.
        </p>
        <AuthForm mode="logout" />
      </main>
    );
  }

  const incomplete = !profile?.nickname || !profile.nicknameKey;
  return (
    <main className="mx-auto w-full max-w-2xl space-y-8 px-5 py-12">
      <header>
        <h1 className="text-3xl font-semibold">내 정보</h1>
        <p className="mt-3 break-all text-sm text-zinc-600 dark:text-zinc-400">
          {authUser.email}
        </p>
        {profile?.role === 'ADMIN' && (
          <p className="mt-2 text-sm font-medium text-indigo-600 dark:text-indigo-400">
            관리자 계정
          </p>
        )}
      </header>
      {incomplete && (
        <p
          role="status"
          className="rounded-lg border border-amber-300 p-4 text-sm leading-6"
        >
          계정은 생성되었지만 사용자 정보 등록이 완료되지 않았습니다. 닉네임을
          저장해 등록을 마쳐 주세요.
        </p>
      )}
      <section
        className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800"
        aria-labelledby="nickname-heading"
      >
        <h2 id="nickname-heading" className="mb-5 text-xl font-semibold">
          닉네임 {incomplete ? '등록' : '변경'}
        </h2>
        <AuthForm mode="nickname" initialNickname={profile?.nickname ?? ''} />
      </section>
      <section
        className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800"
        aria-labelledby="password-heading"
      >
        <h2 id="password-heading" className="mb-5 text-xl font-semibold">
          비밀번호 변경
        </h2>
        <AuthForm mode="password" />
      </section>
      <AuthForm mode="logout" />
    </main>
  );
}

export default function AccountPage() {
  return (
    <Suspense
      fallback={
        <p role="status" className="p-8">
          사용자 정보를 불러오는 중…
        </p>
      }
    >
      <AccountContent />
    </Suspense>
  );
}
