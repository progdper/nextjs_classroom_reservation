'use server';

import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { Prisma } from '@/generated_prisma/client';
import { requireAdmin } from '@/lib/auth';
import { getDb } from '@/lib/db';
import {
  assertScheduleFitsReservations,
  lockClassroom,
  ReservationError,
} from '@/lib/reservations';
import {
  classroomSchema,
  type ClassroomResult,
} from '@/lib/classroom-validation';

export async function saveClassroom(input: unknown): Promise<ClassroomResult> {
  await requireAdmin();
  const parsed = classroomSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0].message };

  const { id, name, location, hours } = parsed.data;
  try {
    const db = getDb();
    if (id) {
      await db.$transaction(async (transaction) => {
        await lockClassroom(transaction, id);
        await assertScheduleFitsReservations(transaction, id, hours);
        await transaction.classroom.update({
          where: { id },
          data: { name, location },
        });
        await transaction.classroomOperatingHour.deleteMany({
          where: { classroomId: id },
        });
        if (hours.length) {
          await transaction.classroomOperatingHour.createMany({
            data: hours.map((hour) => ({ ...hour, classroomId: id })),
          });
        }
      });
    } else {
      await db.classroom.create({
        data: { name, location, operatingHours: { create: hours } },
      });
    }
    revalidatePath('/admin/classrooms');
    revalidatePath('/reservations');
    revalidatePath('/reservations/mine');
    return {
      ok: true,
      message: id ? '강의실 정보를 저장했습니다.' : '강의실을 등록했습니다.',
    };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ReservationError)
      return { ok: false, message: error.message };
    const code =
      error instanceof Prisma.PrismaClientKnownRequestError
        ? error.code
        : 'UNKNOWN';
    if (code === 'P2025')
      return {
        ok: false,
        message: '강의실을 찾을 수 없습니다. 새로고침 후 다시 확인해 주세요.',
      };
    console.error('classroom.save', { code });
    return {
      ok: false,
      message: '강의실을 저장할 수 없습니다. 잠시 후 다시 시도해 주세요.',
    };
  }
}
