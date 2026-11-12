const { logger } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
const getLogStores = require('~/cache/getLogStores');

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 20;

function readLimit(value) {
  if (value == null || value.trim() === '') {
    return DEFAULT_LIMIT;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_LIMIT;
}

function readEntry(raw) {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw != null && typeof raw === 'object' ? raw : null;
}

/**
 * Builds the per-user sliding-window limiter used by the native file tools.
 * A cache failure fails open: losing an abuse guard must not make file
 * generation unavailable for everyone.
 */
function createFileToolRateLimiter({
  getCache = () => getLogStores(CacheKeys.FILE_TOOL_RATE_LIMIT),
  limit = readLimit(process.env.FILE_TOOL_RATE_LIMIT_PER_MINUTE),
  windowMs = DEFAULT_WINDOW_MS,
  now = () => Date.now(),
} = {}) {
  return async function assertFileToolRateLimit(req) {
    if (limit === 0) {
      return;
    }
    const userId = req?.user?.id;
    if (!userId) {
      throw new Error('A signed-in user is required to create a file');
    }

    try {
      const cache = getCache();
      const key = `${req.user.tenantId ?? ''}:${userId}`;
      const currentTime = now();
      const existing = readEntry(await cache.get(key));
      if (existing == null || !Number.isFinite(existing.resetAt) || existing.resetAt <= currentTime) {
        await cache.set(key, { count: 1, resetAt: currentTime + windowMs }, windowMs);
        return;
      }
      if (existing.count >= limit) {
        const error = new Error(
          'File generation rate limit reached. Try again after the current minute.',
        );
        error.code = 'FILE_TOOL_RATE_LIMIT';
        error.retryAfterMs = existing.resetAt - currentTime;
        throw error;
      }
      await cache.set(
        key,
        { count: existing.count + 1, resetAt: existing.resetAt },
        Math.max(1_000, existing.resetAt - currentTime),
      );
    } catch (error) {
      if (error?.code === 'FILE_TOOL_RATE_LIMIT') {
        throw error;
      }
      logger.warn('[fileGeneration] Rate limiter unavailable; allowing the call', error);
    }
  };
}

module.exports = {
  createFileToolRateLimiter,
  DEFAULT_WINDOW_MS,
  DEFAULT_LIMIT,
};
