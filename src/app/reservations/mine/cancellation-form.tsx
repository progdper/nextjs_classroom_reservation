'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { cancelReservation } from '../actions';
import type { ReservationResult } from '@/lib/reservation-rules';

export function CancellationForm({ reservationId }: { reservationId: string }) {
  const router = useRouter();
  const [result, setResult] = useState<ReservationResult | null>(null);
  const {
    handleSubmit,
    formState: { isSubmitting },
  } = useForm();
  const submit = handleSubmit(async () => {
    setResult(null);
    try {
      const response = await cancelReservation({ reservationId });
      setResult(response);
      if (response.ok)
        router.push('/reservations/mine?view=history&result=cancelled');
      else router.refresh();
    } catch {
      setResult({
        ok: false,
        message:
          '취소 결과를 확인하지 못했습니다. 목록을 새로고침해 상태를 확인해 주세요.',
      });
    }
  });
  return (
    <form onSubmit={submit} className="space-y-3">
      <button
        type="submit"
        disabled={isSubmitting || result?.ok}
        className="rounded-lg border border-zinc-300 px-4 py-2 text-sm disabled:opacity-50 dark:border-zinc-700"
      >
        {isSubmitting ? '취소 중…' : '예약 취소'}
      </button>
      {result && (
        <p role={result.ok ? 'status' : 'alert'} className="text-sm">
          {result.message}
        </p>
      )}
    </form>
  );
}
