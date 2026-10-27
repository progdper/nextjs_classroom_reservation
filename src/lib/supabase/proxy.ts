import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseAuthEnv } from '@/lib/env';

export async function updateSession(request: NextRequest) {
  const env = getSupabaseAuthEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }

          const previousResponse = response;
          response = NextResponse.next({ request });

          for (const cookie of previousResponse.cookies.getAll()) {
            response.cookies.set(cookie);
          }

          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }

          response.headers.set('Cache-Control', 'private, no-store, max-age=0');
          response.headers.set('Pragma', 'no-cache');
          response.headers.set('Expires', '0');
        },
      },
    },
  );

  const { error } = await supabase.auth.getClaims();

  if (
    error &&
    error.name !== 'AuthSessionMissingError' &&
    ![400, 401, 403].includes(error.status ?? 0)
  ) {
    throw new Error(
      '로그인 상태를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.',
    );
  }

  return response;
}
