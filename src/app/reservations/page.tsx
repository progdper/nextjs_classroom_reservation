import { Suspense } from 'react';
import Link from 'next/link';
import { unstable_rethrow } from 'next/navigation';
import { requireAppUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import {
  availabilitySchema,
  reservationDateSchema,
} from '@/lib/reservation-rules';
import { kstDateInput } from '@/lib/reservation-display';
import { minutesToTime } from '@/lib/classroom-validation';
import { getAvailableSlots, ReservationError } from '@/lib/reservations';
import { BookingForm } from './booking-form';

async function BookingContent({ searchParams }: PageProps<'/reservations'>) {
  await requireAppUser();
  const params = await searchParams;
  const today = kstDateInput(new Date());
  const dateInput = params.date ?? today;
  const dateResult = reservationDateSchema.safeParse(dateInput);
  const date = dateResult.success ? dateResult.data : today;
  const requestedPage =
    typeof params.roomsPage === 'string' ? Number(params.roomsPage) : 1;
  const roomsPage =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, 100000)
      : 1;
  const selection = availabilitySchema.safeParse({
    classroomId: params.classroomId,
    date: dateInput,
  });
  let error = !dateResult.success
    ? '올바른 날짜를 선택해 주세요.'
    : params.classroomId && !selection.success
      ? '올바른 강의실을 선택해 주세요.'
      : '';
  let classrooms: { id: string; name: string; location: string }[] = [];
  let availability: Awaited<ReturnType<typeof getAvailableSlots>> | null = null;
  try {
    classrooms = await getDb().classroom.findMany({
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (roomsPage - 1) * 10,
      take: 11,
      select: { id: true, name: true, location: true },
    });
    if (selection.success)
      availability = await getAvailableSlots(selection.data);
  } catch (caught) {
    unstable_rethrow(caught);
    if (caught instanceof ReservationError) error = caught.message;
    else {
      console.error('reservation.page-read', { code: 'READ_FAILED' });
      error = '예약 정보를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.';
    }
  }
  const href = (
    page: number,
    id = selection.success ? selection.data.classroomId : '',
  ) => {
    const query = new URLSearchParams({ date, roomsPage: String(page) });
    if (id) query.set('classroomId', id);
    return `/reservations?${query}`;
  };

  return (
    <main className="mx-auto w-full max-w-4xl space-y-8 px-5 py-10">
      <header>
        <h1 className="text-3xl font-semibold">강의실 예약</h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          강의실과 날짜를 선택해 빈 시간을 예약하세요. 모든 시간은 한국
          시간(KST)입니다.
        </p>
      </header>
      {error && (
        <p role="alert" className="rounded-lg border border-amber-300 p-4">
          {error}
        </p>
      )}
      <form
        action="/reservations"
        method="get"
        className="flex flex-wrap items-end gap-4"
      >
        {selection.success && (
          <input
            type="hidden"
            name="classroomId"
            value={selection.data.classroomId}
          />
        )}
        <input type="hidden" name="roomsPage" value={roomsPage} />
        <label className="space-y-2 text-sm">
          <span className="block font-medium">예약 날짜</span>
          <input
            key={date}
            type="date"
            name="date"
            defaultValue={date}
            min={today}
            required
            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
        >
          날짜 조회
        </button>
      </form>
      <section aria-labelledby="room-selection-heading" className="space-y-4">
        <h2 id="room-selection-heading" className="text-xl font-semibold">
          강의실 선택
        </h2>
        {!classrooms.length && !error && (
          <p role="status">
            {roomsPage === 1
              ? '등록된 강의실이 없습니다.'
              : '이 페이지에 표시할 강의실이 없습니다.'}
          </p>
        )}
        <ul className="grid gap-3 sm:grid-cols-2">
          {classrooms.slice(0, 10).map((room) => (
            <li key={room.id}>
              <Link
                href={href(roomsPage, room.id)}
                aria-current={
                  availability?.classroom.id === room.id ? 'true' : undefined
                }
                className="block break-words rounded-lg border border-zinc-300 p-4 hover:border-indigo-500 aria-[current=true]:border-indigo-600 aria-[current=true]:bg-indigo-50 dark:border-zinc-700 dark:aria-[current=true]:bg-indigo-950"
              >
                <span className="font-medium">{room.name}</span>
                <span className="mt-1 block text-sm">{room.location}</span>
              </Link>
            </li>
          ))}
        </ul>
        <nav
          aria-label="강의실 선택 페이지"
          className="flex gap-5 text-sm underline"
        >
          {roomsPage > 1 && <Link href={href(roomsPage - 1)}>이전</Link>}
          {classrooms.length > 10 && (
            <Link href={href(roomsPage + 1)}>다음</Link>
          )}
        </nav>
      </section>
      {availability ? (
        <section
          aria-labelledby="slot-heading"
          className="space-y-5 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800"
        >
          <h2 id="slot-heading" className="break-words text-xl font-semibold">
            {availability.classroom.name} · {date}
          </h2>
          <p className="text-sm">{availability.classroom.location}</p>
          <BookingForm
            key={`${availability.classroom.id}:${date}`}
            classroomId={availability.classroom.id}
            date={date}
            slots={availability.slots.map((slot) => ({
              startMinute: slot.startMinute,
              available: slot.available,
              label: `${minutesToTime(slot.startMinute)} ~ ${minutesToTime(slot.startMinute + (new Date(slot.endAt).getTime() - new Date(slot.startAt).getTime()) / 60000)}`,
            }))}
          />
        </section>
      ) : (
        !error &&
        !!classrooms.length && (
          <p role="status">위에서 강의실을 선택해 주세요.</p>
        )
      )}
    </main>
  );
}

export default function ReservationsPage(props: PageProps<'/reservations'>) {
  return (
    <Suspense
      fallback={
        <p role="status" className="p-8">
          예약 정보를 불러오는 중…
        </p>
      }
    >
      <BookingContent {...props} />
    </Suspense>
  );
}
