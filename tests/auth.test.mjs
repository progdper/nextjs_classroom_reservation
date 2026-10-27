import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
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
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: path,
  }).outputText;
  vm.runInNewContext(
    code,
    {
      exports,
      FormData,
      TextEncoder,
      console: { error: (...args) => logs.push(args) },
      require: (name) =>
        name === 'server-only'
          ? {}
          : Object.hasOwn(mocks, name)
            ? mocks[name]
            : require(name),
    },
    { filename: fileURLToPath(new URL(path, root)) },
  );
  return exports;
}

const validation = load('src/lib/auth-validation.ts');
const user = {
  id: 'auth-one',
  email: 'member@example.test',
  user_metadata: { nickname: 'Test1', role: 'ADMIN' },
};
const form = (values) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
const signupInput = {
  email: user.email,
  nickname: 'Test1',
  password: 'Abcdefghij12',
  passwordConfirm: 'Abcdefghij12',
};
const passwordInput = {
  currentPassword: 'old-password',
  newPassword: 'Abcdefghij12',
  newPasswordConfirm: 'Abcdefghij12',
};

class DbError extends Error {
  constructor(code) {
    super('SENSITIVE_DATABASE_DETAILS');
    this.code = code;
  }
}

function profileFixture(overrides = {}) {
  const calls = [];
  const logs = [];
  const db = Object.fromEntries(
    ['findUnique', 'create', 'upsert'].map((name) => [
      name,
      async (args) => {
        calls.push([name, args]);
        return overrides[name] ? overrides[name](args) : null;
      },
    ]),
  );
  const profile = load(
    'src/lib/auth-profile.ts',
    {
      '@/generated_prisma/client': {
        Prisma: { PrismaClientKnownRequestError: DbError },
      },
      '@/generated_prisma/enums': {
        UserRole: { USER: 'USER', ADMIN: 'ADMIN' },
      },
      '@/lib/db': { getDb: () => ({ user: db }) },
      '@/lib/auth-validation': validation,
    },
    logs,
  );
  return { profile, calls, logs };
}

function actionFixture(overrides = {}) {
  const calls = [];
  const logs = [];
  const auth = {};
  const defaults = {
    getUser: { data: { user }, error: null },
    signUp: { data: { user, session: { synthetic: true } }, error: null },
    signInWithPassword: {
      data: { user, session: { synthetic: true } },
      error: null,
    },
    updateUser: { error: null },
    signOut: { error: null },
  };
  for (const name of Object.keys(defaults))
    auth[name] = async (args) => {
      calls.push([name, args]);
      return overrides[name] ? overrides[name](args) : defaults[name];
    };
  const profile = {};
  for (const name of [
    'checkNicknameAvailable',
    'ensureAppProfile',
    'saveProfileNickname',
  ])
    profile[name] = async (...args) => {
      calls.push([name, ...args]);
      return overrides[name]
        ? overrides[name](...args)
        : { ok: true, message: '' };
    };
  const actions = load(
    'src/app/auth/actions.ts',
    {
      '@/lib/auth-validation': validation,
      '@/lib/auth-profile': profile,
      '@/lib/auth': {
        requireAuthUser: async () => {
          calls.push(['requireAuthUser']);
          if (overrides.requireAuthUser) return overrides.requireAuthUser();
          return user;
        },
      },
      '@/lib/supabase/server': {
        createSupabaseActionClient: async () => ({ auth }),
      },
      'next/cache': {
        revalidatePath: (...args) => calls.push(['revalidatePath', ...args]),
      },
      'next/navigation': {
        unstable_rethrow: (error) => {
          if (error.message === 'NEXT_REDIRECT') throw error;
        },
      },
    },
    logs,
  );
  return { actions, calls, logs };
}

test('nickname normalization, duplicate comparison and password byte boundaries', () => {
  assert.equal(
    validation.getNicknameKey(' Test1 '),
    validation.getNicknameKey('test1'),
  );
  assert.equal(
    validation.nicknameSchema.parse('가나'.normalize('NFD')),
    '가나',
  );
  for (const nickname of ['a', 'a'.repeat(21), 'a b', 'ab!', 'ㄱㄴ'])
    assert.equal(validation.nicknameSchema.safeParse(nickname).success, false);
  for (const [password, valid] of [
    ['A1' + 'a'.repeat(70), true],
    ['A1' + 'a'.repeat(71), false],
    ['가'.repeat(22) + 'Ab1234', true],
    ['가'.repeat(23) + 'Ab1234', false],
  ]) {
    assert.equal(
      validation.signupSchema.safeParse({
        ...signupInput,
        password,
        passwordConfirm: password,
      }).success,
      valid,
    );
  }
  assert.equal(
    validation.loginSchema.safeParse({ email: user.email, password: '1' })
      .success,
    true,
  );
});

test('profile creation uses authenticated ID and never trusts metadata role', async () => {
  const { profile, calls } = profileFixture();
  assert.equal((await profile.ensureAppProfile(user)).ok, true);
  const data = calls.find(([name]) => name === 'create')[1].data;
  assert.equal(data.authUserId, user.id);
  assert.equal(data.nicknameKey, 'test1');
  assert.equal(data.role, 'USER');
});

test('existing nickname and administrator role are preserved on login', async () => {
  const { profile, calls } = profileFixture({
    findUnique: () => ({
      nickname: 'Changed',
      nicknameKey: 'changed',
      role: 'ADMIN',
    }),
  });
  assert.equal((await profile.ensureAppProfile(user)).ok, true);
  assert.equal(calls.length, 1);
});

test('concurrent profile creation recovers same account without overwriting it', async () => {
  let reads = 0;
  const { profile, calls } = profileFixture({
    findUnique: () =>
      ++reads === 1 ? null : { nickname: 'Winner', nicknameKey: 'winner' },
    create: () => {
      throw new DbError('P2002');
    },
  });
  assert.equal((await profile.ensureAppProfile(user)).ok, true);
  assert.equal(
    calls.some(([name]) => name === 'upsert'),
    false,
  );
});

test('nickname or email collision never links another account by email', async () => {
  const { profile, calls } = profileFixture({
    create: () => {
      throw new DbError('P2002');
    },
  });
  assert.equal((await profile.ensureAppProfile(user)).ok, false);
  for (const [name, args] of calls)
    if (name === 'findUnique')
      assert.deepEqual(Object.keys(args.where), ['authUserId']);
});

test('nickname change updates only nickname fields and targets authenticated ID', async () => {
  const { profile, calls } = profileFixture();
  assert.equal((await profile.saveProfileNickname(user, ' NewName ')).ok, true);
  const args = calls[0][1];
  assert.equal(args.where.authUserId, user.id);
  assert.deepEqual(Object.keys(args.update).sort(), [
    'nickname',
    'nicknameKey',
  ]);
  assert.equal(args.update.nicknameKey, 'newname');
});

test('profile storage failure exposes no database detail', async () => {
  const { profile, logs } = profileFixture({
    findUnique: () => {
      throw new DbError('P2021');
    },
  });
  const result = await profile.ensureAppProfile(user);
  assert.equal(result.ok, false);
  assert.equal(
    JSON.stringify([logs, result]).includes('SENSITIVE_DATABASE_DETAILS'),
    false,
  );
});

test('signup validation or nickname conflict prevents auth account creation', async () => {
  const invalid = actionFixture();
  assert.equal(
    (await invalid.actions.signup(form({ ...signupInput, nickname: '!' }))).ok,
    false,
  );
  assert.equal(invalid.calls.length, 0);
  const conflict = actionFixture({
    checkNicknameAvailable: () => ({ ok: false, message: 'duplicate' }),
  });
  assert.equal((await conflict.actions.signup(form(signupInput))).ok, false);
  assert.equal(
    conflict.calls.some(([name]) => name === 'signUp'),
    false,
  );
});

test('signup requires session and server-verified matching identity', async () => {
  const sessionless = actionFixture({
    getUser: () => ({ data: { user: null }, error: null }),
    signUp: () => ({ data: { user, session: null }, error: null }),
  });
  assert.equal((await sessionless.actions.signup(form(signupInput))).ok, false);
  assert.equal(
    sessionless.calls.some(([name]) => name === 'ensureAppProfile'),
    false,
  );
  let reads = 0;
  const mismatch = actionFixture({
    getUser: () => ({
      data: { user: ++reads === 1 ? null : { ...user, id: 'another' } },
      error: null,
    }),
  });
  assert.equal((await mismatch.actions.signup(form(signupInput))).ok, false);
  assert.equal(
    mismatch.calls.some(([name]) => name === 'ensureAppProfile'),
    false,
  );
});

test('signup creates profile only after authenticated session, partial failure is recoverable', async () => {
  for (const complete of [true, false]) {
    let reads = 0;
    const { actions, calls } = actionFixture({
      getUser: () => ({
        data: { user: ++reads === 1 ? null : user },
        error: null,
      }),
      ensureAppProfile: () => ({ ok: complete, message: 'synthetic' }),
    });
    const result = await actions.signup(
      form({ ...signupInput, role: 'ADMIN', authUserId: 'attacker' }),
    );
    assert.equal(result.ok, true);
    assert.equal(
      result.redirectTo,
      complete ? '/account' : '/account?reason=profile-required',
    );
    assert.equal(
      calls.find(([name]) => name === 'ensureAppProfile')[1].id,
      user.id,
    );
    assert.deepEqual(
      Object.keys(calls.find(([name]) => name === 'signUp')[1].options.data),
      ['nickname'],
    );
  }
});

test('login rejects bad credentials and recovers incomplete profiles', async () => {
  const bad = actionFixture({
    signInWithPassword: () => ({
      data: {},
      error: {
        name: 'AuthApiError',
        code: 'invalid_credentials',
        status: 400,
        message: 'SENSITIVE_AUTH_DETAILS',
      },
    }),
  });
  assert.equal(
    (await bad.actions.login(form({ email: user.email, password: 'bad' }))).ok,
    false,
  );
  assert.equal(
    bad.calls.some(([name]) => name === 'ensureAppProfile'),
    false,
  );
  assert.equal(
    JSON.stringify(bad.logs).includes('SENSITIVE_AUTH_DETAILS'),
    false,
  );
  const recovery = actionFixture({
    ensureAppProfile: () => ({ ok: false, message: '' }),
  });
  assert.equal(
    (await recovery.actions.login(form({ email: user.email, password: 'old' })))
      .redirectTo,
    '/account?reason=profile-required',
  );
});

test('password verification failure or identity mismatch prevents password update', async () => {
  for (const signInWithPassword of [
    () => ({ data: {}, error: { name: 'AuthApiError', status: 400 } }),
    () => ({ data: { user: { id: 'another' } }, error: null }),
  ]) {
    const { actions, calls } = actionFixture({ signInWithPassword });
    assert.equal((await actions.changePassword(form(passwordInput))).ok, false);
    assert.equal(
      calls.some(([name]) => name === 'updateUser'),
      false,
    );
  }
});

test('password update logs out locally and distinguishes post-update logout failure', async () => {
  for (const failLogout of [false, true]) {
    const { actions, calls } = actionFixture({
      signOut: () => ({
        error: failLogout ? { name: 'AuthApiError', status: 503 } : null,
      }),
    });
    const result = await actions.changePassword(form(passwordInput));
    const updated = calls.find(([name]) => name === 'updateUser')[1];
    assert.equal(updated.current_password, passwordInput.currentPassword);
    assert.equal(updated.password, passwordInput.newPassword);
    assert.equal(calls.find(([name]) => name === 'signOut')[1].scope, 'local');
    assert.equal(result.ok, !failLogout);
    if (failLogout) assert.match(result.message, /비밀번호는 변경되었지만/);
    else assert.equal(result.redirectTo, '/login?reason=password-changed');
  }
});

test('nickname action ignores forged owner and rethrows framework redirects', async () => {
  const { actions, calls } = actionFixture();
  assert.equal(
    (
      await actions.changeNickname(
        form({ nickname: 'NewName', authUserId: 'attacker' }),
      )
    ).ok,
    true,
  );
  assert.equal(
    calls.find(([name]) => name === 'saveProfileNickname')[1].id,
    user.id,
  );
  const unauthenticated = actionFixture({
    requireAuthUser: () => {
      throw new Error('NEXT_REDIRECT');
    },
  });
  await assert.rejects(
    () => unauthenticated.actions.changeNickname(form({ nickname: 'NewName' })),
    /NEXT_REDIRECT/,
  );
});

test('logout uses local scope and never reports failed logout as success', async () => {
  const { actions, calls } = actionFixture();
  assert.equal((await actions.logout()).redirectTo, '/login');
  assert.equal(calls[0][1].scope, 'local');
  const failure = actionFixture({
    signOut: () => ({ error: { name: 'AuthApiError', status: 503 } }),
  });
  assert.equal((await failure.actions.logout()).ok, false);
});

test('authenticated signup is rejected without creating another account', async () => {
  const { actions, calls } = actionFixture();
  assert.equal((await actions.signup(form(signupInput))).ok, false);
  assert.equal(
    calls.some(([name]) => name === 'signUp'),
    false,
  );
});

test('transport failure returns safe failure and preserves no sensitive details', async () => {
  const { actions, logs } = actionFixture({
    signInWithPassword: () => {
      throw new Error('SECRET_TRANSPORT_DETAILS');
    },
  });
  const result = await actions.login(
    form({ email: user.email, password: 'old' }),
  );
  assert.equal(result.ok, false);
  assert.equal(
    JSON.stringify([result, logs]).includes('SECRET_TRANSPORT_DETAILS'),
    false,
  );
});

test('optional user lookup, required profile and administrator guards remain distinct', async () => {
  let authResult = { data: { user: null }, error: null };
  let profile;
  let queries = 0;
  const guards = load('src/lib/auth.ts', {
    'next/navigation': {
      redirect: (path) => {
        throw new Error('REDIRECT:' + path);
      },
      notFound: () => {
        throw new Error('NOT_FOUND');
      },
    },
    '@/generated_prisma/enums': { UserRole: { USER: 'USER', ADMIN: 'ADMIN' } },
    '@/lib/supabase/server': {
      createSupabaseReadClient: async () => ({
        auth: { getUser: async () => authResult },
      }),
    },
    '@/lib/db': {
      getDb: () => ({
        user: {
          findUnique: async (args) => {
            queries++;
            assert.equal(args.where.authUserId, user.id);
            return profile;
          },
        },
      }),
    },
  });
  assert.equal(await guards.getAuthUser(), null);
  await assert.rejects(() => guards.requireAuthUser(), /REDIRECT:\/login$/);
  assert.equal(queries, 0);
  authResult = { data: { user }, error: null };
  assert.equal((await guards.requireAuthUser()).id, user.id);
  await assert.rejects(() => guards.requireAppUser(), /REDIRECT:\/account$/);
  profile = { nickname: 'Test1', nicknameKey: 'test1', role: 'USER' };
  await assert.rejects(() => guards.requireAdmin(), /NOT_FOUND/);
  profile.role = 'ADMIN';
  assert.equal((await guards.requireAdmin()).role, 'ADMIN');
  authResult = {
    data: { user: null },
    error: { name: 'AuthApiError', status: 503 },
  };
  await assert.rejects(
    () => guards.getAuthUser(),
    /로그인 상태를 확인할 수 없습니다/,
  );
});

test('read client waits for request before creating auth SDK', async () => {
  const calls = [];
  let release = () => {};
  const requestReady = new Promise((resolve) => {
    release = resolve;
  });

  const clients = load('src/lib/supabase/server.ts', {
    'next/server': {
      connection: () => {
        calls.push('connection');
        return requestReady;
      },
    },
    'next/headers': {
      cookies: async () => {
        calls.push('cookies');
        return { getAll: () => [] };
      },
    },
    '@/lib/env': {
      getSupabaseAuthEnv: () => ({
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
      }),
    },
    '@supabase/ssr': {
      createServerClient: () => {
        calls.push('client');
        return {};
      },
    },
  });

  const pending = clients.createSupabaseReadClient();
  assert.deepEqual(calls, ['connection']);

  release();
  await pending;
  assert.deepEqual(calls, ['connection', 'cookies', 'client']);
});
