'use server';

import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { Prisma } from '@/generated_prisma/client';
import { requireAppUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import {
  bookingSchema,
  cancellationSchema,
  getKstDay,
  makeSlots,
  type ReservationResult,
} from '@/lib/reservation-rules';
import {
  databaseNow,
  lockClassroom,
  ReservationError,
} from '@/lib/reservations';

async function runMutation(
  operation: string,
  action: () => Promise<string>,
): Promise<ReservationResult> {
  try {
    const message = await action();
    revalidatePath('/reservations');
    revalidatePath('/reservations/mine');
    return { ok: true, message };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ReservationError)
      return { ok: false, message: error.message };
    const code =
      error instanceof Prisma.PrismaClientKnownRequestError
        ? error.code
        : 'UNKNOWN';
    console.error(operation, { code });
    return {
      ok: false,
      message: '예약 요청을 처리할 수 없습니다. 잠시 후 다시 시도해 주세요.',
    };
  }
}

export async function createReservation(
  input: unknown,
): Promise<ReservationResult> {
  const user = await requireAppUser();
  const parsed = bookingSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0].message };
  const { classroomId, date, startMinute } = parsed.data;
  return runMutation('reservation.create', () =>
    getDb().$transaction(
      async (transaction) => {
        await lockClassroom(transaction, classroomId);
        const hour = await transaction.classroomOperatingHour.findUnique({
          where: {
            classroomId_weekday: {
              classroomId,
              weekday: getKstDay(date).weekday,
            },
          },
          select: { weekday: true, startMinute: true, endMinute: true },
        });
        const slot = makeSlots(date, hour ?? undefined).find(
          (entry) => entry.startMinute === startMinute,
        );
        if (!slot)
          throw new ReservationError(
            '운영 시간에 포함된 예약 시간을 선택해 주세요.',
          );
        const occupied = await transaction.reservation.findFirst({
          where: {
            classroomId,
            status: 'CONFIRMED',
            startAt: { lt: slot.endAt },
            endAt: { gt: slot.startAt },
          },
          select: { id: true },
        });
        if (occupied)
          throw new ReservationError(
            '이미 예약된 시간입니다. 다른 시간을 선택해 주세요.',
          );
        const now = await databaseNow(transaction);
        if (slot.startAt <= now)
          throw new ReservationError(
            '예약 시작 시간이 지났습니다. 다른 시간을 선택해 주세요.',
          );
        await transaction.reservation.create({
          data: {
            userId: user.id,
            classroomId,
            startAt: slot.startAt,
            endAt: slot.endAt,
          },
          select: { id: true },
        });
        return '예약이 완료되었습니다.';
      },
      { isolationLevel: 'ReadCommitted' },
    ),
  );
}

export async function cancelReservation(
  input: unknown,
): Promise<ReservationResult> {
  const user = await requireAppUser();
  const parsed = cancellationSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0].message };
  const { reservationId } = parsed.data;
  return runMutation('reservation.cancel', async () => {
    const db = getDb();
    const initial = await db.reservation.findFirst({
      where: { id: reservationId, userId: user.id },
      select: { classroomId: true },
    });
    if (!initial) throw new ReservationError('취소할 예약을 찾을 수 없습니다.');
    return db.$transaction(
      async (transaction) => {
        await lockClassroom(transaction, initial.classroomId);
        const current = await transaction.reservation.findFirst({
          where: {
            id: reservationId,
            userId: user.id,
            classroomId: initial.classroomId,
          },
          select: { status: true, startAt: true },
        });
        if (!current)
          throw new ReservationError('취소할 예약을 찾을 수 없습니다.');
        if (current.status === 'CANCELLED')
          throw new ReservationError('이미 취소된 예약입니다.');
        const now = await databaseNow(transaction);
        if (current.startAt <= now)
          throw new ReservationError(
            '시작 시간이 지난 예약은 취소할 수 없습니다.',
          );
        const result = await transaction.reservation.updateMany({
          where: {
            id: reservationId,
            userId: user.id,
            status: 'CONFIRMED',
            startAt: { gt: now },
          },
          data: { status: 'CANCELLED', cancelledAt: now },
        });
        if (result.count !== 1)
          throw new ReservationError(
            '예약 상태가 변경되었습니다. 새로고침 후 확인해 주세요.',
          );
        return '예약을 취소했습니다.';
      },
      { isolationLevel: 'ReadCommitted' },
    );
  });
}
