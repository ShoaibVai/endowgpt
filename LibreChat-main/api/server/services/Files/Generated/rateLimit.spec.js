jest.mock('@librechat/data-schemas', () => ({
  logger: { warn: jest.fn() },
}));

jest.mock('~/cache/getLogStores', () => jest.fn());

const { createFileToolRateLimiter } = require('./rateLimit');

function fakeCache() {
  const values = new Map();
  return {
    get: jest.fn(async (key) => values.get(key)),
    set: jest.fn(async (key, value) => {
      values.set(key, value);
    }),
  };
}

describe('file generation rate limiter', () => {
  it('allows calls up to the window limit and then rejects', async () => {
    const cache = fakeCache();
    let now = 1_000;
    const limiter = createFileToolRateLimiter({
      getCache: () => cache,
      limit: 2,
      windowMs: 60_000,
      now: () => now,
    });
    const req = { user: { id: 'user-1', tenantId: 'tenant-1' } };

    await limiter(req);
    await limiter(req);
    await expect(limiter(req)).rejects.toMatchObject({
      code: 'FILE_TOOL_RATE_LIMIT',
    });

    now += 60_001;
    await expect(limiter(req)).resolves.toBeUndefined();
  });

  it('scopes the window by tenant and user', async () => {
    const cache = fakeCache();
    const limiter = createFileToolRateLimiter({
      getCache: () => cache,
      limit: 1,
      now: () => 1_000,
    });

    await limiter({ user: { id: 'user-1', tenantId: 'tenant-a' } });
    await expect(
      limiter({ user: { id: 'user-1', tenantId: 'tenant-b' } }),
    ).resolves.toBeUndefined();
    await expect(
      limiter({ user: { id: 'user-2', tenantId: 'tenant-a' } }),
    ).resolves.toBeUndefined();
  });

  it('can be disabled with a zero limit', async () => {
    const cache = fakeCache();
    const limiter = createFileToolRateLimiter({
      getCache: () => cache,
      limit: 0,
    });

    await limiter({ user: { id: 'user-1' } });
    expect(cache.get).not.toHaveBeenCalled();
  });

  it('fails open when the cache is unavailable', async () => {
    const limiter = createFileToolRateLimiter({
      getCache: () => {
        throw new Error('cache down');
      },
      limit: 1,
    });

    await expect(limiter({ user: { id: 'user-1' } })).resolves.toBeUndefined();
  });
});
