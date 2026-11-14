import { SystemRoles } from 'librechat-data-provider';
import { createSuperAdminUserHandlers } from './users';
import type { SuperAdminUserMethods } from './users';

const ADMIN_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const TARGET_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';

function mockResponse() {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

function mockRequest(overrides: Record<string, unknown> = {}) {
  return {
    body: {},
    params: {},
    user: { id: ADMIN_ID, role: SystemRoles.ADMIN },
    ...overrides,
  } as never;
}

function createDeps(overrides: Partial<SuperAdminUserMethods> = {}): SuperAdminUserMethods {
  return {
    findUser: jest.fn().mockResolvedValue(null),
    countUsers: jest.fn().mockResolvedValue(1),
    updateUser: jest.fn().mockResolvedValue(null),
    createUser: jest.fn().mockResolvedValue({
      _id: TARGET_ID,
      name: 'New Person',
      email: 'new@example.com',
      role: SystemRoles.USER,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    }),
    hashPassword: jest.fn().mockResolvedValue('hashed-password'),
    ...overrides,
  };
}

const validBody = {
  name: 'New Person',
  email: 'new@example.com',
  password: 'correct-horse',
  role: SystemRoles.USER,
};

describe('superadmin user creation', () => {
  it('rejects a caller without the ADMIN role', async () => {
    const res = mockResponse();
    const handlers = createSuperAdminUserHandlers(createDeps());

    await handlers.createUser(
      mockRequest({ user: { id: ADMIN_ID, role: SystemRoles.USER } }),
      res as never,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'admin_role_required' });
  });

  it('rejects a body outside the two managed roles', async () => {
    const res = mockResponse();
    const handlers = createSuperAdminUserHandlers(createDeps());

    await handlers.createUser(
      mockRequest({ body: { ...validBody, role: 'SUPERUSER' } }),
      res as never,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'invalid_body' });
  });

  it('rejects a password below the minimum length', async () => {
    const res = mockResponse();
    const handlers = createSuperAdminUserHandlers(createDeps());

    await handlers.createUser(
      mockRequest({ body: { ...validBody, password: 'short' } }),
      res as never,
    );

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 409 when the email is already registered', async () => {
    const res = mockResponse();
    const deps = createDeps({
      findUser: jest.fn().mockResolvedValue({ _id: TARGET_ID, email: 'new@example.com' }),
    });
    const handlers = createSuperAdminUserHandlers(deps);

    await handlers.createUser(mockRequest({ body: validBody }), res as never);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'email_in_use' });
    expect(deps.createUser).not.toHaveBeenCalled();
  });

  it('creates a verified local account with a hashed password', async () => {
    const res = mockResponse();
    const deps = createDeps();
    const handlers = createSuperAdminUserHandlers(deps);

    await handlers.createUser(mockRequest({ body: validBody }), res as never);

    expect(deps.hashPassword).toHaveBeenCalledWith('correct-horse');
    expect(deps.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'local',
        email: 'new@example.com',
        emailVerified: true,
        role: SystemRoles.USER,
        password: 'hashed-password',
      }),
      undefined,
      true,
      true,
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      user: {
        id: TARGET_ID,
        name: 'New Person',
        email: 'new@example.com',
        role: SystemRoles.USER,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
  });

  it('never returns credentials in the response', async () => {
    const res = mockResponse();
    const handlers = createSuperAdminUserHandlers(createDeps());

    await handlers.createUser(mockRequest({ body: validBody }), res as never);

    const payload = JSON.stringify(res.json.mock.calls[0][0]);
    expect(payload).not.toContain('hashed-password');
    expect(payload).not.toContain('password');
  });
});

describe('superadmin role changes', () => {
  const target = {
    _id: TARGET_ID,
    email: 'target@example.com',
    name: 'Target',
    role: SystemRoles.USER,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };

  it('refuses to change the caller’s own role', async () => {
    const res = mockResponse();
    const handlers = createSuperAdminUserHandlers(createDeps());

    await handlers.updateUserRole(
      mockRequest({ params: { userId: ADMIN_ID }, body: { role: SystemRoles.USER } }),
      res as never,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'cannot_change_own_role' });
  });

  it('rejects a malformed user id', async () => {
    const res = mockResponse();
    const handlers = createSuperAdminUserHandlers(createDeps());

    await handlers.updateUserRole(
      mockRequest({ params: { userId: 'nope' }, body: { role: SystemRoles.ADMIN } }),
      res as never,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'invalid_user' });
  });

  it('returns 404 for an unknown user', async () => {
    const res = mockResponse();
    const handlers = createSuperAdminUserHandlers(createDeps());

    await handlers.updateUserRole(
      mockRequest({ params: { userId: TARGET_ID }, body: { role: SystemRoles.ADMIN } }),
      res as never,
    );

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('promotes a general user to admin', async () => {
    const res = mockResponse();
    const deps = createDeps({
      findUser: jest.fn().mockResolvedValue(target),
      updateUser: jest.fn().mockResolvedValue({ ...target, role: SystemRoles.ADMIN }),
    });
    const handlers = createSuperAdminUserHandlers(deps);

    await handlers.updateUserRole(
      mockRequest({ params: { userId: TARGET_ID }, body: { role: SystemRoles.ADMIN } }),
      res as never,
    );

    expect(deps.updateUser).toHaveBeenCalledWith(TARGET_ID, { role: SystemRoles.ADMIN });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('is idempotent when the role already matches', async () => {
    const res = mockResponse();
    const deps = createDeps({ findUser: jest.fn().mockResolvedValue(target) });
    const handlers = createSuperAdminUserHandlers(deps);

    await handlers.updateUserRole(
      mockRequest({ params: { userId: TARGET_ID }, body: { role: SystemRoles.USER } }),
      res as never,
    );

    expect(deps.updateUser).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('refuses to demote the last remaining admin', async () => {
    const res = mockResponse();
    const deps = createDeps({
      findUser: jest.fn().mockResolvedValue({ ...target, role: SystemRoles.ADMIN }),
      countUsers: jest.fn().mockResolvedValue(0),
    });
    const handlers = createSuperAdminUserHandlers(deps);

    await handlers.updateUserRole(
      mockRequest({ params: { userId: TARGET_ID }, body: { role: SystemRoles.USER } }),
      res as never,
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'last_admin' });
    expect(deps.updateUser).not.toHaveBeenCalled();
  });

  it('demotes an admin when another admin remains', async () => {
    const res = mockResponse();
    const deps = createDeps({
      findUser: jest.fn().mockResolvedValue({ ...target, role: SystemRoles.ADMIN }),
      countUsers: jest.fn().mockResolvedValue(1),
      updateUser: jest.fn().mockResolvedValue({ ...target, role: SystemRoles.USER }),
    });
    const handlers = createSuperAdminUserHandlers(deps);

    await handlers.updateUserRole(
      mockRequest({ params: { userId: TARGET_ID }, body: { role: SystemRoles.USER } }),
      res as never,
    );

    expect(deps.updateUser).toHaveBeenCalledWith(TARGET_ID, { role: SystemRoles.USER });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
