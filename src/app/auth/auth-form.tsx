'use client';

import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter, unstable_rethrow } from 'next/navigation';
import {
  signup,
  login,
  logout,
  changeNickname,
  changePassword,
} from './actions';
import {
  signupSchema,
  loginSchema,
  nicknameChangeSchema,
  passwordChangeSchema,
} from '@/lib/auth-validation';
import type { AuthResult } from '@/lib/auth-result';

type Mode = 'signup' | 'login' | 'nickname' | 'password' | 'logout';
type Field = {
  name: string;
  label: string;
  type: 'text' | 'email' | 'password';
  autoComplete: string;
};

const email: Field = {
  name: 'email',
  label: '이메일',
  type: 'email',
  autoComplete: 'email',
};
const nickname: Field = {
  name: 'nickname',
  label: '닉네임',
  type: 'text',
  autoComplete: 'nickname',
};
const modes = {
  signup: {
    action: signup,
    schema: signupSchema,
    label: '회원가입',
    fields: [
      email,
      nickname,
      {
        name: 'password',
        label: '비밀번호',
        type: 'password',
        autoComplete: 'new-password',
      },
      {
        name: 'passwordConfirm',
        label: '비밀번호 확인',
        type: 'password',
        autoComplete: 'new-password',
      },
    ],
  },
  login: {
    action: login,
    schema: loginSchema,
    label: '로그인',
    fields: [
      email,
      {
        name: 'password',
        label: '비밀번호',
        type: 'password',
        autoComplete: 'current-password',
      },
    ],
  },
  nickname: {
    action: changeNickname,
    schema: nicknameChangeSchema,
    label: '닉네임 저장',
    fields: [nickname],
  },
  password: {
    action: changePassword,
    schema: passwordChangeSchema,
    label: '비밀번호 변경',
    fields: [
      {
        name: 'currentPassword',
        label: '현재 비밀번호',
        type: 'password',
        autoComplete: 'current-password',
      },
      {
        name: 'newPassword',
        label: '새 비밀번호',
        type: 'password',
        autoComplete: 'new-password',
      },
      {
        name: 'newPasswordConfirm',
        label: '새 비밀번호 확인',
        type: 'password',
        autoComplete: 'new-password',
      },
    ],
  },
  logout: { action: logout, schema: null, label: '로그아웃', fields: [] },
} satisfies Record<
  Mode,
  {
    action: (formData: FormData) => Promise<AuthResult>;
    schema: unknown;
    label: string;
    fields: Field[];
  }
>;

export function AuthForm({
  mode,
  initialNickname = '',
}: {
  mode: Mode;
  initialNickname?: string;
}) {
  const id = useId();
  const router = useRouter();
  const config = modes[mode];
  const fields: Field[] = config.fields;
  const [result, setResult] = useState<AuthResult | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm<Record<string, string>>({
    defaultValues: { nickname: initialNickname },
  });

  const submit = handleSubmit(async (values) => {
    setResult(null);
    clearErrors();
    if (config.schema) {
      const parsed = config.schema.safeParse(values);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const name = String(issue.path[0]);
          setError(name, { message: issue.message }, { shouldFocus: true });
        }
        return;
      }
    }
    const formData = new FormData();
    for (const field of fields)
      formData.set(field.name, values[field.name] ?? '');
    try {
      const response = await config.action(formData);
      setResult(response);
      if (response.ok && response.redirectTo) {
        router.replace(response.redirectTo);
        router.refresh();
      } else if (response.ok) {
        router.refresh();
      }
    } catch (error) {
      unstable_rethrow(error);
      setResult({
        ok: false,
        message: '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      });
    } finally {
      for (const field of fields)
        if (field.type === 'password')
          resetField(field.name, { defaultValue: '' });
    }
  });

  return (
    <form
      onSubmit={submit}
      noValidate
      className="space-y-5"
      aria-busy={isSubmitting}
    >
      <fieldset
        disabled={isSubmitting}
        className="space-y-5 disabled:opacity-60"
      >
        {fields.map((field) => (
          <div key={field.name}>
            <label
              htmlFor={`${id}-${field.name}`}
              className="mb-2 block text-sm font-medium"
            >
              {field.label}
            </label>
            <input
              {...register(field.name)}
              id={`${id}-${field.name}`}
              type={field.type}
              autoComplete={field.autoComplete}
              required
              aria-invalid={!!errors[field.name]}
              aria-describedby={
                errors[field.name] ? `${id}-${field.name}-error` : undefined
              }
              className="block w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:border-zinc-700"
            />
            {errors[field.name] && (
              <p
                id={`${id}-${field.name}-error`}
                role="alert"
                className="mt-2 text-sm text-red-600 dark:text-red-400"
              >
                {errors[field.name]?.message}
              </p>
            )}
          </div>
        ))}
        {mode === 'signup' && (
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            닉네임은 2~20자의 한글·영문·숫자·밑줄을 사용할 수 있습니다.
            비밀번호는 영문과 숫자를 포함한 12자 이상, UTF-8 기준 72바이트
            이하로 입력해 주세요.
          </p>
        )}
        {mode === 'password' && (
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            새 비밀번호는 영문과 숫자를 포함한 12자 이상, UTF-8 기준 72바이트
            이하입니다. 변경 후 현재 브라우저에서 로그아웃됩니다.
          </p>
        )}
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          {isSubmitting ? '처리 중…' : config.label}
        </button>
      </fieldset>
      {result && (
        <p
          role={result.ok ? 'status' : 'alert'}
          className={
            result.ok
              ? 'text-sm text-emerald-700 dark:text-emerald-400'
              : 'text-sm text-red-600 dark:text-red-400'
          }
        >
          {result.message}
        </p>
      )}
    </form>
  );
}
