import 'server-only';

import { z } from 'zod';

const databaseEnvSchema = z.object({
  DATABASE_URL: z
    .url('올바른 PostgreSQL 연결 주소를 입력해 주세요.')
    .refine(
      (value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol),
      'postgres:// 또는 postgresql://로 시작하는 연결 주소를 입력해 주세요.',
    ),
});

export function getDatabaseEnv() {
  const result = databaseEnvSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
  });

  if (!result.success) {
    throw new Error(
      '.env 파일의 DATABASE_URL에 실제 Supabase PostgreSQL 연결 주소를 입력한 뒤 서버를 재시작해 주세요.',
    );
  }

  return result.data;
}

const supabaseAuthEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .url()
    .refine(
      (value) => URL.canParse(value) && new URL(value).protocol === 'https:',
    )
    .refine(
      (value) =>
        URL.canParse(value) &&
        !new URL(value).hostname.toLowerCase().includes('your_project_ref'),
    ),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .trim()
    .startsWith('sb_publishable_')
    .refine((value) => !value.toLowerCase().includes('replace_me')),
});

export function getSupabaseAuthEnv() {
  const result = supabaseAuthEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });

  if (!result.success) {
    throw new Error(
      'Supabase Auth의 Project URL과 publishable key를 설정하고 서버를 재시작해 주세요.',
    );
  }

  return result.data;
}
