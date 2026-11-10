// POST /api/fight  { fighterA, fighterB }
//   -> { winner: "A" | "B", reasoning, mock?, images: { a, b } }
// Each image is { status: "ok" | "blocked" | "failed" | "skipped", src }.
// Without ANTHROPIC_API_KEY it returns a mock verdict (mock: true) instead of calling Claude.
// Without POLLINATIONS_API_KEY images come back "skipped" (placeholder art).
import { MAX_FIGHTER_LENGTH, fighterLength, sanitizeFighter } from "../lib/judge-prompt.mjs";
import { hasJudgeKey, isJudgeBusy, judgeFight, mockVerdict } from "../lib/judge.mjs";
import { checkRateLimit } from "../lib/rate-limit.mjs";
import { generateFighterImage } from "../lib/images.mjs";

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

// Vercel sets x-forwarded-for itself; the first entry is the client IP.
function clientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0].trim() || "unknown";
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "bad_request", message: "That challenge came in garbled! Send two fighter names and we'll ring the bell." });
  }

  const fighterA = sanitizeFighter(body?.fighterA);
  const fighterB = sanitizeFighter(body?.fighterB);
  if (!fighterA || !fighterB) {
    return json(400, { error: "bad_request", message: "The ring is empty! Name two fighters to start the brawl." });
  }
  // Too long is an error, not a silent cut: the player should see their name as typed.
  if (fighterLength(body.fighterA) > MAX_FIGHTER_LENGTH || fighterLength(body.fighterB) > MAX_FIGHTER_LENGTH) {
    return json(400, {
      error: "name_too_long",
      message: `That name won't fit on the scoreboard! Keep each fighter to ${MAX_FIGHTER_LENGTH} characters or fewer.`,
    });
  }

  // Rate limit before any AI call. Only valid requests count.
  let limit;
  try {
    limit = await checkRateLimit(clientIp(request));
  } catch (err) {
    console.error("[fight] rate limiter unavailable:", err);
    return json(503, {
      error: "unavailable",
      message: "The arena doors are jammed! Our crew is on it. Come back swinging in a minute.",
    });
  }
  if (!limit.ok) {
    const s = limit.retryAfterSeconds;
    return json(
      429,
      {
        error: "rate_limited",
        message: `Whoa there! The crowd needs a breather. Next bout starts in ${s} second${s === 1 ? "" : "s"}.`,
        retryAfter: s,
      },
      { "Retry-After": String(s) },
    );
  }

  // Verdict and both images run in parallel. Images never fail the fight:
  // a missing image comes back as { status, src: null } and the UI shows
  // placeholder art.
  const imagesPromise = Promise.all([generateFighterImage(fighterA), generateFighterImage(fighterB)]);

  if (!hasJudgeKey()) {
    console.warn("[fight] ANTHROPIC_API_KEY not set, returning a mock verdict.");
    const [a, b] = await imagesPromise;
    return json(200, { ...mockVerdict(fighterA, fighterB), images: { a, b } });
  }

  try {
    const [verdict, [a, b]] = await Promise.all([judgeFight(fighterA, fighterB), imagesPromise]);
    return json(200, { ...verdict, images: { a, b } });
  } catch (err) {
    console.error("[fight] verdict failed:", err);
    const busy = isJudgeBusy(err);
    return json(busy ? 503 : 502, {
      error: "verdict_failed",
      message: busy
        ? "The judges are buried under a mountain of bouts! Catch your breath and try again in a moment."
        : "The judges are scratching their heads and can't call this one. Ring the bell and try again!",
    });
  }
}
