import { Suspense } from 'react';
import Link from 'next/link';
import { unstable_rethrow } from 'next/navigation';
import { requireAppUser } from '@/lib/auth';
import { getMyReservations, ReservationError } from '@/lib/reservations';
import { formatReservationRange } from '@/lib/reservation-display';
import { CancellationForm } from './cancellation-form';

const phaseLabels = {
  UPCOMING: '예약 예정',
  IN_PROGRESS: '이용 중',
  ENDED: '이용 종료',
  CANCELLED: '취소됨',
} as const;

async function MyReservations({
  searchParams,
}: PageProps<'/reservations/mine'>) {
  await requireAppUser();
  const params = await searchParams;
  const view = params.view === 'history' ? 'history' : 'upcoming';
  const requestedPage =
    typeof params.page === 'string' ? Number(params.page) : 1;
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, 100000)
      : 1;
  let data: Awaited<ReturnType<typeof getMyReservations>> | null = null;
  let error = '';
  try {
    data = await getMyReservations({ view, page });
  } catch (caught) {
    unstable_rethrow(caught);
    if (caught instanceof ReservationError) error = caught.message;
    else {
      console.error('reservation.mine-read', { code: 'READ_FAILED' });
      error = '예약 목록을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.';
    }
  }
  const href = (nextPage: number) =>
    `/reservations/mine?view=${view}&page=${nextPage}`;
  return (
    <main className="mx-auto w-full max-w-4xl space-y-7 px-5 py-10">
      <header>
        <h1 className="text-3xl font-semibold">내 예약</h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          예약 시작 전까지 취소할 수 있습니다. 모든 시간은 한국 시간(KST)입니다.
        </p>
      </header>
      <nav
        aria-label="예약 목록 구분"
        className="flex flex-wrap gap-5 text-sm underline"
      >
        <Link
          href="/reservations/mine"
          aria-current={view === 'upcoming' ? 'page' : undefined}
        >
          예정·이용 중
        </Link>
        <Link
          href="/reservations/mine?view=history"
          aria-current={view === 'history' ? 'page' : undefined}
        >
          지난 예약·취소 이력
        </Link>
        <Link href="/reservations">강의실 예약하기</Link>
      </nav>
      {params.result === 'cancelled' && view === 'history' && (
        <p role="status">
          취소 요청이 처리되었습니다. 아래 이력에서 결과를 확인하세요.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {data && !data.reservations.length && (
        <p role="status">
          {page > 1
            ? '이 페이지에 표시할 예약이 없습니다.'
            : view === 'history'
              ? '지난 예약·취소 이력이 없습니다.'
              : '예정되거나 이용 중인 예약이 없습니다.'}
        </p>
      )}
      {data && (
        <ul className="space-y-4">
          {data.reservations.map((reservation) => (
            <li
              key={reservation.id}
              className="space-y-4 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="break-words text-lg font-semibold">
                  {reservation.classroom.name}
                </h2>
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm dark:bg-zinc-900">
                  {phaseLabels[reservation.phase]}
                </span>
              </div>
              <p className="break-words text-sm">
                {reservation.classroom.location}
              </p>
              <p className="text-sm leading-6">
                {formatReservationRange(reservation.startAt, reservation.endAt)}
              </p>
              {reservation.canCancel && (
                <CancellationForm reservationId={reservation.id} />
              )}
            </li>
          ))}
        </ul>
      )}
      {data && (
        <nav
          aria-label="내 예약 목록 페이지"
          className="flex gap-5 text-sm underline"
        >
          {page > 1 && <Link href={href(page - 1)}>이전</Link>}
          {data.hasNext && <Link href={href(page + 1)}>다음</Link>}
        </nav>
      )}
    </main>
  );
}

export default function MyReservationsPage(
  props: PageProps<'/reservations/mine'>,
) {
  return (
    <Suspense
      fallback={
        <p role="status" className="p-8">
          내 예약을 불러오는 중…
        </p>
      }
    >
      <MyReservations {...props} />
    </Suspense>
  );
}
