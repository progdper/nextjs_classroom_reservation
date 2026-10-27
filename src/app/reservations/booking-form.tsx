'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { createReservation } from './actions';
import { bookingSchema, type ReservationResult } from '@/lib/reservation-rules';

type Props = {
  classroomId: string;
  date: string;
  slots: { startMinute: number; label: string; available: boolean }[];
};

export function BookingForm({ classroomId, date, slots }: Props) {
  const router = useRouter();
  const [result, setResult] = useState<ReservationResult | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { isSubmitting },
  } = useForm({ defaultValues: { startMinute: '' } });
  const selected = useWatch({ control, name: 'startMinute' });
  const available = slots.some(
    (slot) => String(slot.startMinute) === selected && slot.available,
  );
  const pending = isSubmitting || refreshing;

  const submit = handleSubmit(async (values) => {
    setResult(null);
    if (!values.startMinute || !available) {
      setResult({ ok: false, message: '예약 가능한 시간을 선택해 주세요.' });
      return;
    }
    const input = bookingSchema.safeParse({
      classroomId,
      date,
      startMinute: Number(values.startMinute),
    });
    if (!input.success) {
      setResult({ ok: false, message: input.error.issues[0].message });
      return;
    }
    try {
      const response = await createReservation(input.data);
      setResult(response);
      if (response.ok) reset();
      startRefresh(() => router.refresh());
    } catch {
      setResult({
        ok: false,
        message:
          '예약 결과를 확인하지 못했습니다. 내 예약을 확인한 뒤 다시 시도해 주세요.',
      });
    }
  });

  return (
    <form onSubmit={submit} className="space-y-5">
      <fieldset disabled={pending} className="space-y-3">
        <legend className="mb-3 font-medium">예약 시간 선택</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {slots.map((slot) => (
            <label
              key={slot.startMinute}
              className={`flex items-center gap-3 rounded-lg border p-4 ${slot.available ? 'cursor-pointer border-zinc-300 dark:border-zinc-700' : 'border-zinc-200 text-zinc-500 dark:border-zinc-800'}`}
            >
              <input
                type="radio"
                value={String(slot.startMinute)}
                disabled={!slot.available}
                {...register('startMinute')}
              />
              <span>
                {slot.label}
                <span className="ml-2 text-sm">
                  {slot.available ? '예약 가능' : '예약 불가'}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {!slots.length && (
        <p role="status">
          이 날짜에는 운영 시간에 맞는 예약 시간대가 없습니다.
        </p>
      )}
      {!!slots.length && !slots.some((slot) => slot.available) && (
        <p role="status">
          예약 가능한 시간이 없습니다. 다른 날짜나 강의실을 선택해 주세요.
        </p>
      )}
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        시간을 선택한 뒤 예약하기를 누르면 즉시 확정됩니다. 최종 저장 시 예약
        가능 여부를 다시 확인합니다.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending || !available}
          className="rounded-lg bg-indigo-600 px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
        >
          {isSubmitting ? '예약 중…' : '예약하기'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => startRefresh(() => router.refresh())}
          className="text-sm underline disabled:opacity-50"
        >
          {refreshing ? '불러오는 중…' : '최신 시간 확인'}
        </button>
        <Link
          href="/reservations/mine"
          className="text-sm text-indigo-600 underline dark:text-indigo-400"
        >
          내 예약 확인
        </Link>
      </div>
      {result && (
        <p role={result.ok ? 'status' : 'alert'} className="text-sm leading-6">
          {result.message}
        </p>
      )}
    </form>
  );
}
