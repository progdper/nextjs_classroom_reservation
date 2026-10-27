import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '강의실 예약',
  description:
    '강의실별 예약 가능 시간을 확인하고 예약하세요. 내 예약 조회와 시작 전 취소를 지원합니다.',
};

const steps = [
  {
    title: '회원가입하고 로그인하세요',
    description:
      '이메일·닉네임·비밀번호로 가입하고 로그인하세요. 닉네임은 다른 회원과 중복되지 않아야 합니다.',
  },
  {
    title: '강의실과 날짜를 선택하세요',
    description:
      '이용할 강의실과 날짜를 선택하면, 요일별 운영 시간 안에서 예약할 수 있는 시간을 확인할 수 있습니다.',
  },
  {
    title: '빈 시간을 선택해 예약하세요',
    description:
      '원하는 시간을 선택하고 예약하면 바로 확정됩니다. 완료된 예약은 내 예약에서 확인하세요.',
  },
] as const;

const features = [
  {
    title: '강의실 예약',
    description:
      '강의실별로 비어 있는 시간을 확인하고, 원하는 시간에 예약하세요.',
    href: '/reservations',
    linkLabel: '예약 가능 시간 보기',
  },
  {
    title: '내 예약 확인',
    description:
      '예정된 예약과 이용·취소 이력을 확인하세요. 예약 시작 전에는 직접 취소할 수 있습니다.',
    href: '/reservations/mine',
    linkLabel: '내 예약 보기',
  },
  {
    title: '내 정보 관리',
    description: '내 정보 화면에서 닉네임과 비밀번호를 변경할 수 있습니다.',
    href: '/account',
    linkLabel: '내 정보 보기',
  },
] as const;

const linkFocus =
  'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600 dark:focus-visible:outline-indigo-400';

export default function Home() {
  return (
    <main className="flex-1 bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-20">
        <header className="rounded-3xl border border-indigo-100 bg-indigo-50 p-6 sm:p-10 dark:border-indigo-900 dark:bg-indigo-950/40">
          <p className="text-sm font-semibold tracking-wide text-indigo-700 dark:text-indigo-300">
            강의실 예약
          </p>
          <h1 className="mt-5 text-3xl font-semibold leading-tight tracking-tight break-keep sm:text-5xl">
            필요한 강의실을,
            <br />
            원하는 시간에.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 break-keep text-zinc-600 dark:text-zinc-300">
            강의실과 날짜를 고르고, 비어 있는 시간을 선택하세요. 예약부터 내역
            확인과 취소까지 한곳에서 간편하게 이용할 수 있습니다.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/reservations"
              className={`inline-flex min-h-11 items-center justify-center rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 ${linkFocus}`}
            >
              강의실 예약하기
            </Link>
            <Link
              href="/reservations/mine"
              className={`inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800 ${linkFocus}`}
            >
              내 예약 확인
            </Link>
          </div>
          <p className="mt-4 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            예약 기능은 로그인 후 이용할 수 있습니다.
          </p>
        </header>

        <section aria-labelledby="how-to-title" className="mt-14">
          <h2
            id="how-to-title"
            className="text-2xl font-semibold tracking-tight"
          >
            세 단계로 간편하게 예약하세요
          </h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            {steps.map((step, index) => (
              <li
                key={step.title}
                className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <span
                  aria-hidden="true"
                  className="inline-flex size-9 items-center justify-center rounded-full bg-indigo-50 text-sm font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                >
                  {index + 1}
                </span>
                <h3 className="mt-4 text-base font-semibold break-keep">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm leading-7 break-keep text-zinc-600 dark:text-zinc-400">
                  {step.description}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="features-title" className="mt-14">
          <h2
            id="features-title"
            className="text-2xl font-semibold tracking-tight"
          >
            필요한 기능을 한곳에서
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {features.map((feature) => (
              <article
                key={feature.href}
                className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <h3 className="text-lg font-semibold">{feature.title}</h3>
                <p className="mt-3 mb-6 text-sm leading-7 break-keep text-zinc-600 dark:text-zinc-400">
                  {feature.description}
                </p>
                <Link
                  href={feature.href}
                  className={`mt-auto inline-flex min-h-11 items-center self-start rounded text-sm font-semibold text-indigo-700 hover:underline dark:text-indigo-300 ${linkFocus}`}
                >
                  {feature.linkLabel}
                  <span aria-hidden="true" className="ml-2">
                    →
                  </span>
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="rules-title"
          className="mt-14 rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <h2 id="rules-title" className="text-xl font-semibold">
            예약 전에 확인해 주세요
          </h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-zinc-600 dark:text-zinc-400">
            <li>
              예약은 현재 1시간 단위이며, 모든 시간은 한국 시간(KST) 기준입니다.
            </li>
            <li>
              강의실마다 요일별 운영 시간과 휴무일이 다릅니다. 운영 시간 안에서
              아직 예약되지 않은 미래 시간만 선택할 수 있습니다.
            </li>
            <li>
              예약 시작 전까지만 취소할 수 있습니다. 시작된 예약은 취소할 수
              없으며, 지난 예약과 취소한 예약은 이력에서 확인할 수 있습니다.
            </li>
          </ul>
        </section>

        <aside className="mt-6 rounded-2xl bg-zinc-100 p-6 sm:p-8 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold">관리자를 위한 강의실 관리</h2>
          <p className="mt-3 text-sm leading-7 break-keep text-zinc-600 dark:text-zinc-400">
            관리자는 강의실을 등록하고 요일별 운영 시간과 휴무를 설정할 수
            있습니다. 관리자 계정으로 로그인하면 상단 메뉴에 강의실 관리가
            표시됩니다.
          </p>
        </aside>
      </div>
    </main>
  );
}
