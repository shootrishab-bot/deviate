// ─── In-memory rate limiting ─────────────────────────────────────────────────
//
// Fixed-window counter held in module scope. Two caveats, both acceptable for
// the current traffic but neither of them small:
//
//   1. The window resets on every cold start, so a caller can get a fresh
//      allowance by waiting for the instance to be recycled.
//   2. Each serverless instance counts on its own, so the effective limit is
//      roughly (limit x number of live instances).
//
// It stops casual abuse of the DeepSeek key and nothing more. If abuse becomes
// a real concern, move the counter to Upstash Redis (or any shared store) so
// the window is global — the call signature here is meant to survive that swap.

const buckets = new Map()
const MAX_TRACKED_KEYS = 5000

function sweep(now) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

/**
 * @returns {{ok: boolean, remaining: number, retryAfterSeconds: number}}
 */
export function rateLimit({ key, limit, windowMs }) {
  const now = Date.now()
  if (buckets.size > MAX_TRACKED_KEYS) sweep(now)

  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 }
  }

  existing.count += 1
  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
  if (existing.count > limit) {
    return { ok: false, remaining: 0, retryAfterSeconds }
  }
  return { ok: true, remaining: Math.max(0, limit - existing.count), retryAfterSeconds }
}

/** Best-effort caller identity: the proxy-reported client IP. */
export function clientKey(request, scope = 'default') {
  const forwarded = request.headers.get('x-forwarded-for') || ''
  const ip = forwarded.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown'
  return `${scope}:${ip}`
}

/** Shared 429 response shape. */
export function tooManyRequests(retryAfterSeconds, message) {
  return {
    body: {
      error: message || 'Too many requests. Please wait a moment and try again.',
      retryAfterSeconds,
    },
    headers: { 'Retry-After': String(retryAfterSeconds) },
  }
}
