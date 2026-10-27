import 'server-only';

import type { Prisma } from '@/generated_prisma/client';
import { requireAppUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import {
  availabilitySchema,
  getKstDay,
  makeSlots,
  overlaps,
  reservationListSchema,
  reservationPhase,
  type OperatingHour,
} from '@/lib/reservation-rules';

export class ReservationError extends Error {}

export async function lockClassroom(
  transaction: Prisma.TransactionClient,
  id: string,
) {
  const rows = await transaction.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "public"."classrooms" WHERE "id" = ${id}::uuid FOR UPDATE
  `;
  if (!rows.length) throw new ReservationError('강의실을 찾을 수 없습니다.');
}

export async function databaseNow(transaction: Prisma.TransactionClient) {
  const [row] = await transaction.$queryRaw<{ now: Date }[]>`
    SELECT clock_timestamp() AS "now"
  `;
  return row.now;
}

// Caller must hold the same classroom row lock used by booking and cancellation.
export async function assertScheduleFitsReservations(
  transaction: Prisma.TransactionClient,
  classroomId: string,
  hours: OperatingHour[],
) {
  const now = await databaseNow(transaction);
  // Keep schedule checking in SQL so the number of future reservations is unbounded.
  const validHours = JSON.stringify(hours);
  const conflicts = await transaction.$queryRaw<{ conflict: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM "public"."reservations" r
      WHERE r."classroomId" = ${classroomId}::uuid
        AND r."status" = 'CONFIRMED' AND r."endAt" > ${now}
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_to_recordset(${validHours}::jsonb)
            AS h("weekday" integer, "startMinute" integer, "endMinute" integer)
          WHERE h."weekday" = EXTRACT(DOW FROM r."startAt" AT TIME ZONE 'Asia/Seoul')::integer
            AND r."startAt" >= (
              date_trunc('day', r."startAt" AT TIME ZONE 'Asia/Seoul')
              + h."startMinute" * interval '1 minute'
            ) AT TIME ZONE 'Asia/Seoul'
            AND r."endAt" <= (
              date_trunc('day', r."startAt" AT TIME ZONE 'Asia/Seoul')
              + h."endMinute" * interval '1 minute'
            ) AT TIME ZONE 'Asia/Seoul'
        )
    ) AS "conflict"
  `;
  if (conflicts[0].conflict) {
    throw new ReservationError(
      '기존 예약과 겹치는 운영 시간 변경은 할 수 없습니다.',
    );
  }
}

export async function getAvailableSlots(input: unknown) {
  await requireAppUser();
  const parsed = availabilitySchema.safeParse(input);
  if (!parsed.success)
    throw new ReservationError(parsed.error.issues[0].message);
  const { classroomId, date } = parsed.data;
  const day = getKstDay(date);
  return getDb().$transaction(
    async (transaction) => {
      const classroom = await transaction.classroom.findUnique({
        where: { id: classroomId },
        select: {
          id: true,
          name: true,
          location: true,
          operatingHours: {
            where: { weekday: day.weekday },
            select: { weekday: true, startMinute: true, endMinute: true },
          },
        },
      });
      if (!classroom) throw new ReservationError('강의실을 찾을 수 없습니다.');
      const occupied = await transaction.reservation.findMany({
        where: {
          classroomId,
          status: 'CONFIRMED',
          startAt: { lt: day.end },
          endAt: { gt: day.start },
        },
        select: { startAt: true, endAt: true },
      });
      const now = await databaseNow(transaction);
      return {
        classroom: {
          id: classroom.id,
          name: classroom.name,
          location: classroom.location,
        },
        date,
        slots: makeSlots(date, classroom.operatingHours[0]).map((slot) => ({
          startMinute: slot.startMinute,
          startAt: slot.startAt.toISOString(),
          endAt: slot.endAt.toISOString(),
          available:
            slot.startAt > now &&
            !occupied.some((entry) =>
              overlaps(slot.startAt, slot.endAt, entry.startAt, entry.endAt),
            ),
        })),
      };
    },
    { isolationLevel: 'RepeatableRead' },
  );
}

export async function getMyReservations(input: unknown = {}) {
  const user = await requireAppUser();
  const parsed = reservationListSchema.safeParse(input);
  if (!parsed.success)
    throw new ReservationError('올바른 예약 목록을 선택해 주세요.');
  const { view, page } = parsed.data;
  return getDb().$transaction(
    async (transaction) => {
      const now = await databaseNow(transaction);
      const rows = await transaction.reservation.findMany({
        where: {
          userId: user.id,
          ...(view === 'upcoming'
            ? { status: 'CONFIRMED' as const, endAt: { gt: now } }
            : {
                OR: [{ status: 'CANCELLED' as const }, { endAt: { lte: now } }],
              }),
        },
        orderBy: [
          { startAt: view === 'upcoming' ? 'asc' : 'desc' },
          { id: 'asc' },
        ],
        skip: (page - 1) * 20,
        take: 21,
        select: {
          id: true,
          startAt: true,
          endAt: true,
          status: true,
          cancelledAt: true,
          classroom: { select: { id: true, name: true, location: true } },
        },
      });
      return {
        page,
        hasNext: rows.length > 20,
        reservations: rows.slice(0, 20).map((row) => ({
          id: row.id,
          classroom: row.classroom,
          startAt: row.startAt.toISOString(),
          endAt: row.endAt.toISOString(),
          cancelledAt: row.cancelledAt?.toISOString() ?? null,
          phase: reservationPhase(row.status, row.startAt, row.endAt, now),
          canCancel: row.status === 'CONFIRMED' && row.startAt > now,
        })),
      };
    },
    { isolationLevel: 'RepeatableRead' },
  );
}
