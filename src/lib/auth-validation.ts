import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('올바른 이메일을 입력해 주세요.'));

export const nicknameSchema = z
  .string()
  .transform((value) => value.normalize('NFC').trim())
  .pipe(
    z
      .string()
      .min(2, '닉네임은 2자 이상 입력해 주세요.')
      .max(20, '닉네임은 20자 이하로 입력해 주세요.')
      .regex(
        /^[가-힣A-Za-z0-9_]+$/,
        '닉네임은 한글, 영문, 숫자, 밑줄만 사용할 수 있습니다.',
      ),
  );

export function getNicknameKey(nickname: string) {
  return nicknameSchema.parse(nickname).toLowerCase();
}

const newPasswordSchema = z
  .string()
  .min(12, '비밀번호는 12자 이상 입력해 주세요.')
  .regex(/[A-Za-z]/, '비밀번호에 영문을 포함해 주세요.')
  .regex(/[0-9]/, '비밀번호에 숫자를 포함해 주세요.')
  .refine(
    (value) => new TextEncoder().encode(value).length <= 72,
    '비밀번호는 UTF-8 기준 72바이트 이하로 입력해 주세요.',
  );

export const signupSchema = z
  .object({
    email: emailSchema,
    nickname: nicknameSchema,
    password: newPasswordSchema,
    passwordConfirm: z.string(),
  })
  .refine((value) => value.password === value.passwordConfirm, {
    path: ['passwordConfirm'],
    message: '비밀번호가 일치하지 않습니다.',
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, '비밀번호를 입력해 주세요.'),
});

export const nicknameChangeSchema = z.object({
  nickname: nicknameSchema,
});

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, '현재 비밀번호를 입력해 주세요.'),
    newPassword: newPasswordSchema,
    newPasswordConfirm: z.string(),
  })
  .refine((value) => value.newPassword === value.newPasswordConfirm, {
    path: ['newPasswordConfirm'],
    message: '새 비밀번호가 일치하지 않습니다.',
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ['newPassword'],
    message: '현재 비밀번호와 다른 비밀번호를 입력해 주세요.',
  });
