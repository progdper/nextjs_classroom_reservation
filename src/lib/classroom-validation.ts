import { z } from 'zod';

export const weekdays = [
  { value: 1, label: '월요일' },
  { value: 2, label: '화요일' },
  { value: 3, label: '수요일' },
  { value: 4, label: '목요일' },
  { value: 5, label: '금요일' },
  { value: 6, label: '토요일' },
  { value: 0, label: '일요일' },
] as const;

export function timeToMinutes(value: string): number {
  if (value === '24:00') return 1440;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return -1;
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

export function minutesToTime(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

const operatingHourSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    start: z.string().refine((value) => {
      const minutes = timeToMinutes(value);
      return minutes >= 0 && minutes < 1440;
    }, '올바른 운영 시작 시간을 선택해 주세요.'),
    end: z
      .string()
      .refine(
        (value) => timeToMinutes(value) >= 0,
        '올바른 운영 종료 시간을 선택해 주세요.',
      ),
  })
  .superRefine((value, context) => {
    const start = timeToMinutes(value.start);
    const end = timeToMinutes(value.end);
    if (start >= 0 && end >= 0 && start >= end) {
      context.addIssue({
        code: 'custom',
        path: ['end'],
        message: '종료 시간은 시작 시간보다 늦어야 합니다.',
      });
    }
  })
  .transform((value) => ({
    weekday: value.weekday,
    startMinute: timeToMinutes(value.start),
    endMinute: timeToMinutes(value.end),
  }));

export const classroomSchema = z
  .object({
    id: z.uuid('올바른 강의실을 선택해 주세요.').optional(),
    name: z
      .string()
      .trim()
      .min(1, '강의실 이름을 입력해 주세요.')
      .max(100, '강의실 이름은 100자 이하로 입력해 주세요.'),
    location: z
      .string()
      .trim()
      .min(1, '위치를 입력해 주세요.')
      .max(200, '위치는 200자 이하로 입력해 주세요.'),
    hours: z
      .array(operatingHourSchema)
      .max(7, '운영 시간은 요일별로 한 번만 설정할 수 있습니다.'),
  })
  .superRefine((value, context) => {
    if (
      new Set(value.hours.map((hour) => hour.weekday)).size !==
      value.hours.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['hours'],
        message: '같은 요일의 운영 시간을 중복 설정할 수 없습니다.',
      });
    }
  });

export type ClassroomInput = z.input<typeof classroomSchema>;
export type ClassroomResult = { ok: boolean; message: string };
export type ClassroomFormValues = {
  id?: string;
  name: string;
  location: string;
  hours: { weekday: number; startMinute: number; endMinute: number }[];
};
