import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
function load(path, mocks = {}, logs = []) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(path, root), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
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
const validation = load('src/lib/classroom-validation.ts');
const valid = {
  name: '강의실 A',
  location: '본관 2층',
  hours: [{ weekday: 1, start: '09:00', end: '18:00' }],
};
const roomId = 'a5be52ae-4ded-4f8b-8154-43b9df972f68';
class DbError extends Error {
  constructor(code) {
    super('SECRET_DATABASE_DETAILS');
    this.code = code;
  }
}
class ReservationError extends Error {}
function fixture(options = {}) {
  const calls = [];
  const logs = [];
  const transaction = {
    classroom: {
      update: async (args) => {
        calls.push(['update', args]);
        if (options.missing) throw new DbError('P2025');
      },
    },
    classroomOperatingHour: {
      deleteMany: async (args) => calls.push(['replaceHours', args]),
      createMany: async (args) => {
        calls.push(['createHours', args]);
        if (options.failHours) throw new DbError('P2003');
      },
    },
  };
  const db = {
    classroom: {
      create: async (args) => {
        calls.push(['create', args]);
        if (options.failCreate) throw new DbError('P2021');
      },
    },
    $transaction: async (action) => {
      calls.push(['transaction']);
      const result = await action(transaction);
      calls.push(['transactionCompleted']);
      return result;
    },
  };
  const actions = load(
    'src/app/admin/classrooms/actions.ts',
    {
      '@/lib/classroom-validation': validation,
      '@/lib/reservations': {
        ReservationError,
        lockClassroom: async () => calls.push(['lockClassroom']),
        assertScheduleFitsReservations: async () => {
          calls.push(['checkReservations']);
          if (options.reservationConflict)
            throw new ReservationError('기존 예약 충돌');
        },
      },
      '@/lib/auth': {
        requireAdmin: async () => {
          calls.push(['requireAdmin']);
          if (options.denied) throw new Error('NOT_FOUND');
        },
      },
      '@/lib/db': {
        getDb: () => {
          calls.push(['getDb']);
          return db;
        },
      },
      '@/generated_prisma/client': {
        Prisma: { PrismaClientKnownRequestError: DbError },
      },
      'next/cache': {
        revalidatePath: (path) => calls.push(['revalidate', path]),
      },
      'next/navigation': {
        unstable_rethrow: (error) => {
          if (error.message === 'NOT_FOUND') throw error;
        },
      },
    },
    logs,
  );
  return { ...actions, calls, logs };
}

test('operating hours convert local time to minutes including midnight end', () => {
  const result = validation.classroomSchema.parse({
    ...valid,
    name: '  강의실 A  ',
    hours: [{ weekday: 0, start: '09:30', end: '24:00' }],
  });
  assert.equal(result.name, valid.name);
  assert.equal(result.hours[0].startMinute, 570);
  assert.equal(result.hours[0].endMinute, 1440);
  assert.equal(validation.minutesToTime(1440), '24:00');
});

test('closed days are represented by absent hours and full closure is allowed', () => {
  assert.equal(
    validation.classroomSchema.safeParse({ ...valid, hours: [] }).success,
    true,
  );
  assert.equal(
    validation.classroomSchema.safeParse({
      ...valid,
      hours: Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        start: '00:00',
        end: '24:00',
      })),
    }).success,
    true,
  );
});

test('invalid days, duplicate weekdays and excessive rows are rejected', () => {
  for (const hours of [
    [{ weekday: -1, start: '09:00', end: '18:00' }],
    [{ weekday: 7, start: '09:00', end: '18:00' }],
    [{ weekday: 1.5, start: '09:00', end: '18:00' }],
    [valid.hours[0], valid.hours[0]],
    Array.from({ length: 8 }, () => valid.hours[0]),
  ])
    assert.equal(
      validation.classroomSchema.safeParse({ ...valid, hours }).success,
      false,
    );
});

test('bad time format, reversed, zero length, overnight and 24-hour start fail', () => {
  for (const [start, end] of [
    ['9:00', '18:00'],
    ['09:60', '18:00'],
    ['09:00', '25:00'],
    ['18:00', '09:00'],
    ['09:00', '09:00'],
    ['23:00', '01:00'],
    ['24:00', '24:00'],
  ]) {
    assert.equal(
      validation.classroomSchema.safeParse({
        ...valid,
        hours: [{ weekday: 1, start, end }],
      }).success,
      false,
    );
  }
});

test('blank, oversized names and forged room identifiers fail', () => {
  for (const changes of [
    { name: ' ' },
    { location: '' },
    { name: 'a'.repeat(101) },
    { location: 'a'.repeat(201) },
    { id: 'forged' },
  ]) {
    assert.equal(
      validation.classroomSchema.safeParse({ ...valid, ...changes }).success,
      false,
    );
  }
});

test('non-admin cannot reach database even with otherwise invalid input', async () => {
  const f = fixture({ denied: true });
  await assert.rejects(() => f.saveClassroom(null), /NOT_FOUND/);
  assert.deepEqual(
    f.calls.map(([name]) => name),
    ['requireAdmin'],
  );
});

test('server validation stops malformed input before database mutation', async () => {
  const f = fixture();
  assert.equal(
    (
      await f.saveClassroom({
        ...valid,
        hours: [valid.hours[0], valid.hours[0]],
      })
    ).ok,
    false,
  );
  assert.deepEqual(
    f.calls.map(([name]) => name),
    ['requireAdmin'],
  );
});

test('new room and schedule use one nested create after administrator check', async () => {
  const f = fixture();
  assert.equal((await f.saveClassroom({ ...valid, role: 'ADMIN' })).ok, true);
  const data = f.calls.find(([name]) => name === 'create')[1].data;
  assert.equal(data.name, valid.name);
  assert.equal(data.operatingHours.create[0].startMinute, 540);
  assert.equal(data.role, undefined);
  assert.equal(f.calls.at(-1)[0], 'revalidate');
});

test('room update and replacement schedule are within one transaction', async () => {
  const f = fixture();
  assert.equal((await f.saveClassroom({ ...valid, id: roomId })).ok, true);
  assert.deepEqual(
    f.calls.map(([name]) => name),
    [
      'requireAdmin',
      'getDb',
      'transaction',
      'lockClassroom',
      'checkReservations',
      'update',
      'replaceHours',
      'createHours',
      'transactionCompleted',
      'revalidate',
      'revalidate',
      'revalidate',
    ],
  );
  assert.equal(f.calls.find(([name]) => name === 'update')[1].where.id, roomId);
  assert.equal(
    f.calls.find(([name]) => name === 'createHours')[1].data[0].classroomId,
    roomId,
  );
});

test('schedule conflict prevents changing room and operating hours', async () => {
  const f = fixture({ reservationConflict: true });
  assert.equal((await f.saveClassroom({ ...valid, id: roomId })).ok, false);
  assert.equal(
    f.calls.some(([name]) =>
      ['update', 'replaceHours', 'revalidate'].includes(name),
    ),
    false,
  );
});

test('all closed schedule removes hours without creating invalid empty batch', async () => {
  const f = fixture();
  assert.equal(
    (await f.saveClassroom({ ...valid, id: roomId, hours: [] })).ok,
    true,
  );
  assert.equal(
    f.calls.some(([name]) => name === 'replaceHours'),
    true,
  );
  assert.equal(
    f.calls.some(([name]) => name === 'createHours'),
    false,
  );
});

test('missing room is reported without replacement or cache invalidation', async () => {
  const f = fixture({ missing: true });
  assert.equal((await f.saveClassroom({ ...valid, id: roomId })).ok, false);
  assert.equal(
    f.calls.some(([name]) => name === 'replaceHours' || name === 'revalidate'),
    false,
  );
});

test('database failure is not reported as success and exposes no raw detail', async () => {
  for (const options of [{ failCreate: true }, { failHours: true }]) {
    const f = fixture(options);
    const result = await f.saveClassroom({
      ...valid,
      ...(options.failHours ? { id: roomId } : {}),
    });
    assert.equal(result.ok, false);
    assert.equal(
      JSON.stringify([result, f.logs]).includes('SECRET_DATABASE_DETAILS'),
      false,
    );
    assert.equal(
      f.calls.some(([name]) => name === 'revalidate'),
      false,
    );
  }
});
