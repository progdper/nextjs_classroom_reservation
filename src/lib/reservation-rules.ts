import { z } from 'zod';

export const RESERVATION_INTERVAL_MINUTES = 60;
const minuteMs = 60_000;

export const reservationDateSchema = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}, '올바른 날짜를 선택해 주세요.');

export const availabilitySchema = z.object({
  classroomId: z.uuid('올바른 강의실을 선택해 주세요.'),
  date: reservationDateSchema,
});
export const bookingSchema = availabilitySchema.extend({
  startMinute: z.number().int().min(0).max(1439),
});
export const cancellationSchema = z.object({
  reservationId: z.uuid('올바른 예약을 선택해 주세요.'),
});
export const reservationListSchema = z.object({
  view: z.enum(['upcoming', 'history']).default('upcoming'),
  page: z.number().int().min(1).max(100000).default(1),
});

export type OperatingHour = {
  weekday: number;
  startMinute: number;
  endMinute: number;
};
export type ReservationResult = { ok: boolean; message: string };

export function getKstDay(date: string) {
  const start = new Date(`${date}T00:00:00+09:00`);
  return {
    start,
    end: new Date(start.getTime() + 1440 * minuteMs),
    weekday: new Date(`${date}T00:00:00Z`).getUTCDay(),
  };
}

export function makeSlots(date: string, hour: OperatingHour | undefined) {
  const slots: { startMinute: number; startAt: Date; endAt: Date }[] = [];
  if (!hour) return slots;
  const { start } = getKstDay(date);
  for (
    let minute = hour.startMinute;
    minute + RESERVATION_INTERVAL_MINUTES <= hour.endMinute;
    minute += RESERVATION_INTERVAL_MINUTES
  ) {
    slots.push({
      startMinute: minute,
      startAt: new Date(start.getTime() + minute * minuteMs),
      endAt: new Date(
        start.getTime() + (minute + RESERVATION_INTERVAL_MINUTES) * minuteMs,
      ),
    });
  }
  return slots;
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && aEnd > bStart;
}

export function reservationPhase(
  status: string,
  startAt: Date,
  endAt: Date,
  now: Date,
): 'CANCELLED' | 'ENDED' | 'IN_PROGRESS' | 'UPCOMING' {
  if (status === 'CANCELLED') return 'CANCELLED';
  if (now >= endAt) return 'ENDED';
  return now >= startAt ? 'IN_PROGRESS' : 'UPCOMING';
}
