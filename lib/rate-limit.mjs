// Per-IP rate limit for AI calls: 5 requests per minute (project-brief.md §5).
// Uses Upstash Redis when its env vars are set. Otherwise falls back to an
// in-memory counter, which is fine for local dev but not for production
// (each serverless instance would keep its own count).
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const LIMIT = 5;
const WINDOW_MS = 60_000;

const upstash =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.slidingWindow(LIMIT, "1 m"),
        prefix: "battleground:fight",
      })
    : null;

if (!upstash) {
  console.warn("[rate-limit] Upstash not configured, using in-memory rate limiting.");
}

// ip -> timestamps (ms) of recent requests
const memoryHits = new Map();

function checkInMemory(ip) {
  const now = Date.now();
  const recent = (memoryHits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) {
    memoryHits.set(ip, recent);
    return { ok: false, retryAfterSeconds: Math.ceil((recent[0] + WINDOW_MS - now) / 1000) };
  }
  recent.push(now);
  memoryHits.set(ip, recent);
  return { ok: true };
}

// Returns { ok: true } or { ok: false, retryAfterSeconds }.
// Throws if Upstash is configured but unreachable; the caller should then
// refuse the request rather than call the AI without a limit.
export async function checkRateLimit(ip) {
  if (!upstash) return checkInMemory(ip);
  const { success, reset } = await upstash.limit(ip);
  if (success) return { ok: true };
  return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((reset - Date.now()) / 1000)) };
}
