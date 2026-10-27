import 'server-only';

import { notFound, redirect } from 'next/navigation';
import { UserRole } from '@/generated_prisma/enums';
import { getDb } from '@/lib/db';
import { createSupabaseReadClient } from '@/lib/supabase/server';

export async function getAuthUser() {
  const supabase = await createSupabaseReadClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    const unauthenticated =
      error.name === 'AuthSessionMissingError' ||
      [400, 401, 403].includes(error.status ?? 0);

    if (unauthenticated) {
      return null;
    }

    console.error('auth.require-user', {
      code: error.code ?? error.name,
      status: error.status ?? null,
    });

    throw new Error(
      '로그인 상태를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.',
    );
  }

  return data.user;
}

export async function requireAuthUser() {
  const user = await getAuthUser();
  if (!user) {
    redirect('/login');
  }

  return user;
}

export async function requireAppUser() {
  const authUser = await requireAuthUser();

  const user = await getDb().user.findUnique({
    where: {
      authUserId: authUser.id,
    },
    select: {
      id: true,
      email: true,
      nickname: true,
      nicknameKey: true,
      role: true,
    },
  });

  if (!user || !user.nickname || !user.nicknameKey) {
    redirect('/account');
  }

  return user;
}

export async function requireAdmin() {
  const user = await requireAppUser();

  if (user.role !== UserRole.ADMIN) {
    notFound();
  }

  return user;
}
