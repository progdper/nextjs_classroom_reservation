import Link from 'next/link';
import { Suspense } from 'react';
import { AuthForm } from '@/app/auth/auth-form';

async function LoginContent({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams;
  return (
    <main className="mx-auto w-full max-w-md px-5 py-12">
      <h1 className="mb-3 text-3xl font-semibold">로그인</h1>
      <p className="mb-8 text-sm text-zinc-600 dark:text-zinc-400">
        가입한 이메일과 비밀번호로 로그인하세요.
      </p>
      {params.reason === 'password-changed' && (
        <p
          role="status"
          className="mb-6 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.
        </p>
      )}
      <AuthForm mode="login" />
      <p className="mt-8 text-sm">
        아직 계정이 없으신가요?{' '}
        <Link
          href="/signup"
          className="text-indigo-600 underline dark:text-indigo-400"
        >
          회원가입
        </Link>
      </p>
    </main>
  );
}

export default function LoginPage(props: PageProps<'/login'>) {
  return (
    <Suspense
      fallback={
        <p role="status" className="p-8">
          로그인 화면을 불러오는 중…
        </p>
      }
    >
      <LoginContent {...props} />
    </Suspense>
  );
}
