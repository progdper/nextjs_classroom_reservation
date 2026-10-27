'use client';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-lg space-y-5 px-5 py-12">
      <h1 className="text-2xl font-semibold">요청을 처리하지 못했습니다</h1>
      <p role="alert">
        잠시 후 다시 시도해 주세요. 문제가 계속되면 관리자에게 문의해 주세요.
      </p>
      <button
        onClick={reset}
        className="rounded-lg bg-indigo-600 px-5 py-2.5 text-white"
      >
        다시 시도
      </button>
    </main>
  );
}
