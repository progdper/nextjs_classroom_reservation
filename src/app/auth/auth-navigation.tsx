import Link from 'next/link';
import { getAuthUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { AuthForm } from './auth-form';

export async function AuthNavigation() {
  const user = await getAuthUser();
  const profile = user
    ? await getDb().user.findUnique({
        where: { authUserId: user.id },
        select: { role: true, nickname: true, nicknameKey: true },
      })
    : null;
  const isAdmin =
    profile?.role === 'ADMIN' && !!profile.nickname && !!profile.nicknameKey;

  return (
    <nav
      aria-label="주 메뉴"
      className="flex flex-wrap items-center gap-5 border-b border-zinc-200 px-5 py-4 text-sm dark:border-zinc-800"
    >
      <Link href="/" className="font-semibold">
        홈
      </Link>
      {user ? (
        <>
          <Link href="/reservations">강의실 예약</Link>
          <Link href="/reservations/mine">내 예약</Link>
          <Link href="/account">내 정보</Link>
          {isAdmin && <Link href="/admin/classrooms">강의실 관리</Link>}
          <AuthForm mode="logout" />
        </>
      ) : (
        <>
          <Link href="/login">로그인</Link>
          <Link href="/signup">회원가입</Link>
        </>
      )}
    </nav>
  );
}
