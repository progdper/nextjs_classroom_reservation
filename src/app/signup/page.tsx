import Link from 'next/link';
import { AuthForm } from '@/app/auth/auth-form';

export default function SignupPage() {
  return (
    <main className="mx-auto w-full max-w-md px-5 py-12">
      <h1 className="mb-3 text-3xl font-semibold">회원가입</h1>
      <p className="mb-8 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        이메일과 닉네임으로 가입하세요. 별도의 이메일 인증은 진행하지 않습니다.
      </p>
      <AuthForm mode="signup" />
      <p className="mt-8 text-sm">
        이미 계정이 있으신가요?{' '}
        <Link
          href="/login"
          className="text-indigo-600 underline dark:text-indigo-400"
        >
          로그인
        </Link>
      </p>
    </main>
  );
}
