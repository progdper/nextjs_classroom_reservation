const timeZone = 'Asia/Seoul';
const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
});
const timeFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function kstDateInput(instant: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function formatReservationRange(startAt: string, endAt: string) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const endDate =
    kstDateInput(start) === kstDateInput(end)
      ? ''
      : `${dateFormatter.format(end)} `;
  return `${dateFormatter.format(start)} ${timeFormatter.format(start)} ~ ${endDate}${timeFormatter.format(end)}`;
}
