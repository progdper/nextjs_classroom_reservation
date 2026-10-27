import { Suspense } from 'react';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { ClassroomForm } from './classroom-form';

async function ClassroomManagement({
  searchParams,
}: PageProps<'/admin/classrooms'>) {
  await requireAdmin();
  const params = await searchParams;
  const requestedPage =
    typeof params.page === 'string' ? Number(params.page) : 1;
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, 100000)
      : 1;
  const pageSize = 10;
  const classrooms = await getDb().classroom.findMany({
    skip: (page - 1) * pageSize,
    take: pageSize + 1,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      name: true,
      location: true,
      updatedAt: true,
      operatingHours: {
        orderBy: { weekday: 'asc' },
        select: { weekday: true, startMinute: true, endMinute: true },
      },
    },
  });

  return (
    <main className="mx-auto w-full max-w-4xl space-y-10 px-5 py-10">
      <header>
        <h1 className="text-3xl font-semibold">강의실 관리</h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          강의실을 등록하고 요일별 운영 시간과 휴무를 설정하세요.
        </p>
      </header>
      <section
        aria-labelledby="new-classroom-heading"
        className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800"
      >
        <h2 id="new-classroom-heading" className="mb-6 text-xl font-semibold">
          새 강의실
        </h2>
        <ClassroomForm />
      </section>
      <section aria-labelledby="classrooms-heading" className="space-y-4">
        <h2 id="classrooms-heading" className="text-xl font-semibold">
          등록된 강의실
        </h2>
        {!classrooms.length && (
          <p
            role="status"
            className="rounded-lg bg-zinc-50 p-5 text-sm dark:bg-zinc-900"
          >
            {page === 1
              ? '등록된 강의실이 없습니다. 위에서 첫 강의실을 등록해 주세요.'
              : '이 페이지에 표시할 강의실이 없습니다.'}
          </p>
        )}
        {classrooms.slice(0, pageSize).map((classroom) => (
          <details
            key={classroom.id}
            className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800"
          >
            <summary className="cursor-pointer break-words font-medium">
              {classroom.name} · {classroom.location}
            </summary>
            <div className="mt-6">
              <ClassroomForm
                key={classroom.updatedAt.toISOString()}
                initial={{
                  id: classroom.id,
                  name: classroom.name,
                  location: classroom.location,
                  hours: classroom.operatingHours,
                }}
              />
            </div>
          </details>
        ))}
        <nav aria-label="강의실 목록 페이지" className="flex gap-5 text-sm">
          {page > 1 && (
            <Link
              className="text-indigo-600 underline dark:text-indigo-400"
              href={`/admin/classrooms?page=${page - 1}`}
            >
              이전
            </Link>
          )}
          {classrooms.length > pageSize && (
            <Link
              className="text-indigo-600 underline dark:text-indigo-400"
              href={`/admin/classrooms?page=${page + 1}`}
            >
              다음
            </Link>
          )}
        </nav>
      </section>
    </main>
  );
}

export default function AdminClassroomsPage(
  props: PageProps<'/admin/classrooms'>,
) {
  return (
    <Suspense
      fallback={
        <p role="status" className="p-8">
          강의실 정보를 불러오는 중…
        </p>
      }
    >
      <ClassroomManagement {...props} />
    </Suspense>
  );
}
