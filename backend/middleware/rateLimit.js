"use strict";

function createRateLimiter({ windowMs, max, message }) {
    const buckets = new Map();

    const cleanup = setInterval(() => {
        const now = Date.now();
        for (const [key, bucket] of buckets) {
            if (now - bucket.startedAt >= windowMs) {
                buckets.delete(key);
            }
        }
    }, Math.min(windowMs, 60_000));

    cleanup.unref?.();

    return function rateLimit(req, res, next) {
        const key = `${req.ip || "unknown"}:${req.path}`;
        const now = Date.now();
        let bucket = buckets.get(key);

        if (!bucket || now - bucket.startedAt >= windowMs) {
            bucket = { startedAt: now, count: 0 };
            buckets.set(key, bucket);
        }

        bucket.count += 1;

        if (bucket.count > max) {
            const retryAfter = Math.max(1, Math.ceil((windowMs - (now - bucket.startedAt)) / 1000));
            res.setHeader("Retry-After", String(retryAfter));
            return res.status(429).json({
                message: message || "Too many requests. Please try again later."
            });
        }

        return next();
    };
}

const authLoginLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 12,
    message: "Too many login attempts. Please try again later."
});

const authRegisterLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    max: 8,
    message: "Too many registration attempts. Please try again later."
});

const apiWriteLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 120,
    message: "Too many write requests. Please slow down and try again."
});

module.exports = { authLoginLimiter, authRegisterLimiter, apiWriteLimiter };
