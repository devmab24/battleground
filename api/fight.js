// POST /api/fight  { fighterA, fighterB }  ->  { winner: "A" | "B", reasoning, mock? }
// Verdict only for now; image generation is added later in Stage 3.
// Without ANTHROPIC_API_KEY it returns a mock verdict (mock: true) instead of calling Claude.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { JUDGE_SYSTEM_PROMPT, buildJudgeUserMessage, sanitizeFighter } from "../lib/judge-prompt.mjs";
import { checkRateLimit } from "../lib/rate-limit.mjs";

const VerdictSchema = z.object({
  // The SDK sends enums to the API as a description only, so zod's parse is
  // what actually rejects anything other than "A" or "B".
  winner: z.enum(["A", "B"]).describe('Exactly "A" or "B".'),
  reasoning: z.string(),
});

// Created on first use so a missing key can't crash the module at import.
let client;

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

// Mock mode: used when ANTHROPIC_API_KEY isn't set. No network call.
// Deterministic, so the same two names always give the same result.
const MOCK_REASONS = [
  (w, l) => `${w} wins! ${l} came out swinging, but ${w} had the better game plan and saw every move coming.`,
  (w, l) => `${w} takes it! After a wild back-and-forth, ${w} landed the final blow while ${l} was still catching their breath.`,
  (w, l) => `${w} is victorious! ${l} put up a brave fight, but ${w} simply refused to stay down.`,
  (w, l) => `${w} wins by a whisker! ${l} looked strong early, then ${w} found a second wind and never looked back.`,
];

function hash(text) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

function mockVerdict(fighterA, fighterB) {
  const h = hash(`${fighterA}\u0000${fighterB}`);
  const winner = h % 2 === 0 ? "A" : "B";
  // Tell identical fighters apart, like the real judge does.
  const same = fighterA.toLowerCase() === fighterB.toLowerCase();
  const nameA = same ? `${fighterA} A` : fighterA;
  const nameB = same ? `${fighterB} B` : fighterB;
  const [w, l] = winner === "A" ? [nameA, nameB] : [nameB, nameA];
  return { winner, reasoning: MOCK_REASONS[(h >>> 1) % MOCK_REASONS.length](w, l), mock: true };
}

async function judgeFight(fighterA, fighterB) {
  client ??= new Anthropic();
  const response = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    // If a safety classifier declines, the API retries on a fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: JUDGE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildJudgeUserMessage(fighterA, fighterB) }],
    output_config: {
      effort: "low",
      format: betaZodOutputFormat(VerdictSchema),
    },
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`Judge refused (${response.stop_details?.category ?? "no category"}).`);
  }
  if (!response.parsed_output) {
    throw new Error(`No verdict returned (stop_reason: ${response.stop_reason}).`);
  }
  return response.parsed_output;
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "bad_request", message: "Send JSON with fighterA and fighterB." });
  }

  const fighterA = sanitizeFighter(body?.fighterA);
  const fighterB = sanitizeFighter(body?.fighterB);
  if (!fighterA || !fighterB) {
    return json(400, { error: "bad_request", message: "Enter two fighters." });
  }

  // Rate limit before any AI call. Only valid requests count.
  let limit;
  try {
    limit = await checkRateLimit(clientIp(request));
  } catch (err) {
    console.error("[fight] rate limiter unavailable:", err);
    return json(503, { error: "unavailable", message: "The arena is closed for a moment. Try again soon." });
  }
  if (!limit.ok) {
    const s = limit.retryAfterSeconds;
    return json(
      429,
      { error: "rate_limited", message: `Slow down! Try again in ${s} second${s === 1 ? "" : "s"}.`, retryAfter: s },
      { "Retry-After": String(s) },
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[fight] ANTHROPIC_API_KEY not set, returning a mock verdict.");
    return json(200, mockVerdict(fighterA, fighterB));
  }

  try {
    const verdict = await judgeFight(fighterA, fighterB);
    return json(200, verdict);
  } catch (err) {
    console.error("[fight] verdict failed:", err);
    const busy = err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError;
    return json(busy ? 503 : 502, {
      error: "verdict_failed",
      message: busy
        ? "The judge is swamped right now. Try again in a moment."
        : "The judge couldn't reach a verdict. Try again.",
    });
  }
}
