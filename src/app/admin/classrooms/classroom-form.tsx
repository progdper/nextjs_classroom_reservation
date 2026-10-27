'use client';

import { useId, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useRouter, unstable_rethrow } from 'next/navigation';
import {
  classroomSchema,
  weekdays,
  minutesToTime,
  type ClassroomInput,
  type ClassroomResult,
  type ClassroomFormValues,
} from '@/lib/classroom-validation';
import { saveClassroom } from './actions';

type FormValues = {
  name: string;
  location: string;
  days: { weekday: number; open: boolean; start: string; end: string }[];
};
const baseTimes = Array.from({ length: 25 }, (_, hour) =>
  minutesToTime(hour * 60),
);

export function ClassroomForm({ initial }: { initial?: ClassroomFormValues }) {
  const id = useId();
  const router = useRouter();
  const [result, setResult] = useState<ClassroomResult | null>(null);
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      name: initial?.name ?? '',
      location: initial?.location ?? '',
      days: weekdays.map((day) => {
        const existing = initial?.hours.find(
          (hour) => hour.weekday === day.value,
        );
        return {
          weekday: day.value,
          open: !!existing,
          start: existing ? minutesToTime(existing.startMinute) : '09:00',
          end: existing ? minutesToTime(existing.endMinute) : '18:00',
        };
      }),
    },
  });
  const days = useWatch({ control, name: 'days' });

  const submit = handleSubmit(async (values) => {
    setResult(null);
    const input: ClassroomInput = {
      id: initial?.id,
      name: values.name,
      location: values.location,
      hours: values.days
        .filter((day) => day.open)
        .map((day) => ({
          weekday: day.weekday,
          start: day.start,
          end: day.end,
        })),
    };
    const parsed = classroomSchema.safeParse(input);
    if (!parsed.success) {
      setResult({ ok: false, message: parsed.error.issues[0].message });
      return;
    }
    try {
      const response = await saveClassroom(input);
      setResult(response);
      if (response.ok) {
        if (!initial) reset();
        router.refresh();
      }
    } catch (error) {
      unstable_rethrow(error);
      setResult({
        ok: false,
        message: '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      });
    }
  });

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-busy={isSubmitting}
      className="space-y-5"
    >
      <fieldset
        disabled={isSubmitting}
        className="space-y-5 disabled:opacity-60"
      >
        <div>
          <label
            htmlFor={`${id}-name`}
            className="mb-2 block text-sm font-medium"
          >
            강의실 이름
          </label>
          <input
            id={`${id}-name`}
            {...register('name')}
            required
            maxLength={100}
            className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
          />
        </div>
        <div>
          <label
            htmlFor={`${id}-location`}
            className="mb-2 block text-sm font-medium"
          >
            위치
          </label>
          <input
            id={`${id}-location`}
            {...register('location')}
            required
            maxLength={200}
            className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
          />
        </div>
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-semibold">
            요일별 운영 시간 · 한국 시간
          </legend>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            운영하지 않는 요일은 체크를 해제하세요. 전체 해제 시 모든 요일이
            휴무입니다.
          </p>
          {weekdays.map((day, index) => {
            const open = days?.[index]?.open ?? false;
            const startValue = days?.[index]?.start ?? '09:00';
            const endValue = days?.[index]?.end ?? '18:00';
            const options = [
              ...new Set([...baseTimes, startValue, endValue]),
            ].sort();
            return (
              <div
                key={day.value}
                className="flex flex-wrap items-center gap-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900"
              >
                <label className="flex w-24 items-center gap-2 text-sm">
                  <input type="checkbox" {...register(`days.${index}.open`)} />
                  {day.label}
                </label>
                <label className="text-sm">
                  <span className="sr-only">{day.label} 시작</span>
                  <select
                    {...register(`days.${index}.start`)}
                    aria-label={`${day.label} 시작`}
                    disabled={!open || isSubmitting}
                    className="rounded border border-zinc-300 bg-white px-2 py-2 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    {options
                      .filter((time) => time !== '24:00')
                      .map((time) => (
                        <option key={time}>{time}</option>
                      ))}
                  </select>
                </label>
                <span aria-hidden="true">~</span>
                <label className="text-sm">
                  <span className="sr-only">{day.label} 종료</span>
                  <select
                    {...register(`days.${index}.end`)}
                    aria-label={`${day.label} 종료`}
                    disabled={!open || isSubmitting}
                    className="rounded border border-zinc-300 bg-white px-2 py-2 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    {options.map((time) => (
                      <option key={time}>{time}</option>
                    ))}
                  </select>
                </label>
                {!open && <span className="text-sm text-zinc-500">휴무</span>}
              </div>
            );
          })}
        </fieldset>
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          {isSubmitting ? '저장 중…' : initial ? '변경 저장' : '강의실 등록'}
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
