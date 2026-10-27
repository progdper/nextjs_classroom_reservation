import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function load(path, mocks = {}, logs = []) {
  const exports = {};
  const code = ts.transpileModule(
    readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  vm.runInNewContext(code, {
    exports,
    Date,
    console: { error: (...args) => logs.push(args) },
    require: (name) =>
      name === 'server-only'
        ? {}
        : Object.hasOwn(mocks, name)
          ? mocks[name]
          : require(name),
  });
  return exports;
}
const rules = load('src/lib/reservation-rules.ts');
const display = load('src/lib/reservation-display.ts');
const roomId = 'a5be52ae-4ded-4f8b-8154-43b9df972f68';
const reservationId = 'bc0633ce-aefb-4c3b-a23a-43fefb560a2e';
const date = '2030-01-07';
const booking = { classroomId: roomId, date, startMinute: 540 };
const hour = { weekday: 1, startMinute: 540, endMinute: 720 };
class DbError extends Error {
  constructor() {
    super('SECRET_DATABASE_DETAILS');
    this.code = 'P2028';
  }
}

function fixture(options = {}) {
  const calls = [];
  const logs = [];
  const state = options.rows ?? [];
  const timing = { now: new Date('2030-01-06T15:00:00Z') };
  let queue = Promise.resolve();
  const userId = 'owner';
  const matches = (row, where) =>
    (!where.id || row.id === where.id) &&
    (!where.userId || row.userId === where.userId) &&
    (!where.classroomId || row.classroomId === where.classroomId) &&
    (!where.status || row.status === where.status) &&
    (!where.startAt?.lt || row.startAt < where.startAt.lt) &&
    (!where.startAt?.gt || row.startAt > where.startAt.gt) &&
    (!where.endAt?.gt || row.endAt > where.endAt.gt);
  const reservation = {
    findFirst: async ({ where }) => {
      calls.push(['findReservation', where]);
      return state.find((row) => matches(row, where)) ?? null;
    },
    findMany: async (args) => {
      calls.push(['findMany', args]);
      return state;
    },
    create: async ({ data }) => {
      calls.push(['create', data]);
      if (options.failCreate) throw new DbError();
      state.push({
        id: reservationId,
        status: 'CONFIRMED',
        cancelledAt: null,
        ...data,
      });
      return { id: reservationId };
    },
    updateMany: async ({ where, data }) => {
      calls.push(['cancel', { where, data }]);
      const row = state.find((entry) => matches(entry, where));
      if (!row || options.updateLost) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    },
  };
  const db = {
    reservation,
    $transaction: async (action, config) => {
      calls.push(['transaction', config]);
      let release;
      const tx = {
        reservation,
        classroomOperatingHour: {
          findUnique: async () => {
            calls.push(['hours']);
            return options.closed ? null : (options.hour ?? hour);
          },
        },
        classroom: {
          findUnique: async () =>
            options.missing
              ? null
              : {
                  id: roomId,
                  name: '강의실',
                  location: '본관',
                  operatingHours: options.closed ? [] : [hour],
                },
        },
        $queryRaw: async (strings, ...values) => {
          const sql = strings.join('?');
          if (sql.includes('FOR UPDATE')) {
            calls.push(['lockRequested', values[0]]);
            const previous = queue;
            queue = new Promise((resolve) => {
              release = resolve;
            });
            await previous;
            calls.push(['locked']);
            if (options.afterLock) await options.afterLock(timing);
            return options.missing ? [] : [{ id: roomId }];
          }
          if (sql.includes('clock_timestamp')) return [{ now: timing.now }];
          calls.push(['scheduleSQL', { sql, values }]);
          return [{ conflict: !!options.scheduleConflict }];
        },
      };
      try {
        return await action(tx);
      } finally {
        release?.();
      }
    },
  };
  const mocks = {
    '@/lib/auth': {
      requireAppUser: async () => {
        calls.push(['auth']);
        if (options.denied) throw new Error('LOGIN_REDIRECT');
        return { id: userId };
      },
    },
    '@/lib/db': {
      getDb: () => {
        calls.push(['getDb']);
        return db;
      },
    },
    '@/lib/reservation-rules': rules,
    '@/generated_prisma/client': {
      Prisma: { PrismaClientKnownRequestError: DbError },
    },
    'next/cache': {
      revalidatePath: (path) => calls.push(['revalidate', path]),
    },
    'next/navigation': {
      unstable_rethrow: (error) => {
        if (error.message === 'LOGIN_REDIRECT') throw error;
      },
    },
  };
  const queries = load('src/lib/reservations.ts', mocks, logs);
  const actions = load(
    'src/app/reservations/actions.ts',
    { ...mocks, '@/lib/reservations': queries },
    logs,
  );
  return { ...actions, ...queries, db, state, calls, logs, timing };
}

function existing(changes = {}) {
  return {
    id: reservationId,
    userId: 'owner',
    classroomId: roomId,
    status: 'CONFIRMED',
    cancelledAt: null,
    startAt: new Date('2030-01-07T00:00:00Z'),
    endAt: new Date('2030-01-07T01:00:00Z'),
    classroom: { id: roomId, name: '강의실', location: '본관' },
    ...changes,
  };
}

test('date validation rejects rollover and malformed dates, accepting leap day', () => {
  for (const value of [
    '2030-02-29',
    '2030-04-31',
    '2030-1-07',
    'invalid',
    '2030-01-07T00:00:00Z',
  ]) {
    assert.equal(rules.reservationDateSchema.safeParse(value).success, false);
  }
  assert.equal(
    rules.reservationDateSchema.safeParse('2032-02-29').success,
    true,
  );
});

test('display keeps KST dates at UTC year boundaries and shows next-day midnight', () => {
  assert.equal(
    display.kstDateInput(new Date('2026-12-31T14:59:59Z')),
    '2026-12-31',
  );
  assert.equal(
    display.kstDateInput(new Date('2026-12-31T15:00:00Z')),
    '2027-01-01',
  );
  const range = display.formatReservationRange(
    '2026-12-31T14:00:00Z',
    '2026-12-31T15:00:00Z',
  );
  assert.match(range, /2026/);
  assert.match(range, /2027/);
  assert.match(range, /23:00/);
  assert.match(range, /00:00/);
});

test('KST day boundaries cross UTC date, month and year without local timezone parsing', () => {
  for (const [day, utcStart, weekday] of [
    ['2030-01-01', '2029-12-31T15:00:00.000Z', 2],
    ['2030-02-01', '2030-01-31T15:00:00.000Z', 5],
    ['2030-01-07', '2030-01-06T15:00:00.000Z', 1],
  ]) {
    const range = rules.getKstDay(day);
    assert.equal(range.start.toISOString(), utcStart);
    assert.equal(range.end - range.start, 86400000);
    assert.equal(range.weekday, weekday);
  }
});

test('slots start at opening, omit incomplete final slot and allow 24:00 end', () => {
  const slots = rules.makeSlots(date, {
    weekday: 1,
    startMinute: 570,
    endMinute: 720,
  });
  assert.deepEqual(
    Array.from(slots, (s) => s.startMinute),
    [570, 630],
  );
  assert.equal(slots[0].startAt.toISOString(), '2030-01-07T00:30:00.000Z');
  assert.equal(rules.makeSlots(date, undefined).length, 0);
  const last = rules.makeSlots(date, {
    weekday: 1,
    startMinute: 1380,
    endMinute: 1440,
  })[0];
  assert.equal(last.endAt.toISOString(), '2030-01-07T15:00:00.000Z');
});

test('overlap is half-open and does not depend on equal start times or duration', () => {
  const at = (h) => new Date(`2030-01-07T${h}:00:00Z`);
  assert.equal(rules.overlaps(at('00'), at('01'), at('01'), at('02')), false);
  assert.equal(rules.overlaps(at('00'), at('02'), at('01'), at('03')), true);
});

test('reservation phase boundaries keep cancelled history and reject cancellation at start', () => {
  const row = existing();
  assert.equal(
    rules.reservationPhase(
      'CONFIRMED',
      row.startAt,
      row.endAt,
      new Date(row.startAt - 1),
    ),
    'UPCOMING',
  );
  assert.equal(
    rules.reservationPhase('CONFIRMED', row.startAt, row.endAt, row.startAt),
    'IN_PROGRESS',
  );
  assert.equal(
    rules.reservationPhase('CONFIRMED', row.startAt, row.endAt, row.endAt),
    'ENDED',
  );
  assert.equal(
    rules.reservationPhase('CANCELLED', row.startAt, row.endAt, row.endAt),
    'CANCELLED',
  );
});

test('authentication precedes validation and all data access', async () => {
  for (const operation of [
    'createReservation',
    'cancelReservation',
    'getAvailableSlots',
    'getMyReservations',
  ]) {
    const f = fixture({ denied: true });
    await assert.rejects(() => f[operation](null), /LOGIN_REDIRECT/);
    assert.deepEqual(f.calls, [['auth']]);
  }
});

test('malformed input is rejected before data access', async () => {
  const f = fixture();
  for (const input of [
    { ...booking, date: '2030-02-30' },
    { ...booking, startMinute: '540' },
    { ...booking, startMinute: 1440 },
    { ...booking, classroomId: 'forged' },
  ]) {
    assert.equal((await f.createReservation(input)).ok, false);
  }
  assert.equal(
    (await f.cancelReservation({ reservationId: 'forged' })).ok,
    false,
  );
  assert.equal(
    f.calls.some(([name]) => name === 'getDb'),
    false,
  );
});

test('booking uses session owner, locks before checks and recomputes end time', async () => {
  const f = fixture();
  assert.equal(
    (
      await f.createReservation({
        ...booking,
        userId: 'attacker',
        endAt: 'forged',
      })
    ).ok,
    true,
  );
  assert.equal(f.state[0].userId, 'owner');
  assert.equal(f.state[0].endAt.toISOString(), '2030-01-07T01:00:00.000Z');
  assert.ok(
    f.calls.findIndex(([n]) => n === 'locked') <
      f.calls.findIndex(([n]) => n === 'hours'),
  );
  assert.equal(
    f.calls.find(([n]) => n === 'transaction')[1].isolationLevel,
    'ReadCommitted',
  );
});

test('closed, misaligned, missing and overlapping slots cannot be booked', async () => {
  for (const [options, input] of [
    [{ closed: true }, booking],
    [{ missing: true }, booking],
    [{}, { ...booking, startMinute: 541 }],
    [
      { rows: [existing({ startAt: new Date('2030-01-06T23:30:00Z') })] },
      booking,
    ],
  ]) {
    const f = fixture(options);
    assert.equal((await f.createReservation(input)).ok, false);
    assert.equal(
      f.calls.some(([n]) => n === 'create'),
      false,
    );
  }
});

test('booking checks fresh database time after waiting for lock', async () => {
  const f = fixture({
    afterLock: (timing) => {
      timing.now = existing().startAt;
    },
  });
  assert.equal((await f.createReservation(booking)).ok, false);
  assert.equal(f.state.length, 0);
});

test('two concurrent requests sharing a classroom lock produce exactly one reservation', async () => {
  const f = fixture();
  const results = await Promise.all([
    f.createReservation(booking),
    f.createReservation(booking),
  ]);
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(f.state.length, 1);
  assert.equal(f.calls.filter(([n]) => n === 'lockRequested').length, 2);
});

test('cancellation uses owner filter twice and records status without deleting history', async () => {
  const f = fixture({ rows: [existing()] });
  assert.equal(
    (await f.cancelReservation({ reservationId, userId: 'attacker' })).ok,
    true,
  );
  assert.equal(f.state.length, 1);
  assert.equal(f.state[0].status, 'CANCELLED');
  assert.equal(f.state[0].cancelledAt, f.timing.now);
  assert.ok(
    f.calls
      .filter(([n]) => n === 'findReservation')
      .every(([, where]) => where.userId === 'owner'),
  );
  assert.equal((await f.createReservation(booking)).ok, true);
  assert.equal(f.state.length, 2);
});

test('other owner, already cancelled, started and ended reservations cannot be cancelled', async () => {
  for (const [row, now] of [
    [existing({ userId: 'other' })],
    [existing({ status: 'CANCELLED' })],
    [existing(), existing().startAt],
    [existing(), existing().endAt],
  ]) {
    const f = fixture({ rows: [row] });
    if (now) f.timing.now = now;
    assert.equal((await f.cancelReservation({ reservationId })).ok, false);
    assert.equal(
      f.calls.some(([n]) => n === 'cancel'),
      false,
    );
  }
});

test('cancellation rechecks time after locking and detects lost conditional update', async () => {
  const f = fixture({
    rows: [existing()],
    afterLock: (timing) => {
      timing.now = existing().startAt;
    },
  });
  assert.equal((await f.cancelReservation({ reservationId })).ok, false);
  const lost = fixture({ rows: [existing()], updateLost: true });
  assert.equal((await lost.cancelReservation({ reservationId })).ok, false);
});

test('storage errors are safe and never invalidate cache as success', async () => {
  const f = fixture({ failCreate: true });
  const result = await f.createReservation(booking);
  assert.equal(result.ok, false);
  assert.equal(
    JSON.stringify([result, f.logs]).includes('SECRET_DATABASE_DETAILS'),
    false,
  );
  assert.equal(
    f.calls.some(([n]) => n === 'revalidate'),
    false,
  );
});

test('availability exposes times only, respects overlap and excludes started slots', async () => {
  const f = fixture({ rows: [existing()] });
  f.timing.now = new Date('2030-01-07T01:00:00Z');
  const result = await f.getAvailableSlots({ classroomId: roomId, date });
  assert.deepEqual(
    Array.from(result.slots, (s) => s.available),
    [false, false, true],
  );
  assert.equal(JSON.stringify(result).includes('owner'), false);
  assert.equal(JSON.stringify(result).includes(reservationId), false);
  const closed = fixture({ closed: true });
  assert.equal(
    (await closed.getAvailableSlots({ classroomId: roomId, date })).slots
      .length,
    0,
  );
});

test('my reservations scope both views to owner and bound pagination', async () => {
  const f = fixture({ rows: Array.from({ length: 21 }, () => existing()) });
  for (const view of ['upcoming', 'history']) {
    const result = await f.getMyReservations({ view, page: 2 });
    const query = f.calls.filter(([n]) => n === 'findMany').at(-1)[1];
    assert.equal(query.where.userId, 'owner');
    assert.equal(query.skip, 20);
    assert.equal(query.take, 21);
    assert.equal(result.reservations.length, 20);
    assert.equal(result.hasNext, true);
    assert.equal(Object.hasOwn(result.reservations[0], 'userId'), false);
  }
  await assert.rejects(() => f.getMyReservations({ page: -1 }));
});

test('schedule guard uses parameterized KST SQL and rejects conflicts including all-closed hours', async () => {
  const f = fixture({ scheduleConflict: true });
  await assert.rejects(
    () =>
      f.db.$transaction((tx) =>
        f.assertScheduleFitsReservations(tx, roomId, []),
      ),
    /기존 예약/,
  );
  const sql = f.calls.find(([n]) => n === 'scheduleSQL')[1];
  assert.ok(sql.sql.includes("AT TIME ZONE 'Asia/Seoul'"));
  assert.ok(sql.sql.includes('r."endAt" >'));
  assert.equal(sql.values[0], roomId);
  assert.equal(sql.values[2], '[]');
});
