// The fight judge: asks Claude for { winner: "A" | "B", reasoning }.
// Shared by api/fight.js and scripts/check-judge.mjs. Lives in lib/, not api/,
// because Vercel turns every file in api/ into a public route.
//
// Without ANTHROPIC_API_KEY, api/fight.js uses mockVerdict() instead, so the
// app works for free. Add the key to .env (and to Vercel's env vars) to switch
// to the real judge; nothing else needs to change.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { JUDGE_SYSTEM_PROMPT, buildJudgeUserMessage } from "./judge-prompt.mjs";

export const JUDGE_MODEL = "claude-opus-5-5";

const VerdictSchema = z.object({
  // The SDK sends enums to the API as a description only, so zod's parse is
  // what actually rejects anything other than "A" or "B".
  winner: z.enum(["A", "B"]).describe('Exactly "A" or "B".'),
  reasoning: z.string(),
});

export function hasJudgeKey() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// True for errors worth a "try again in a moment" (503) rather than a 502.
export function isJudgeBusy(err) {
  return err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError;
}

// Created on first use so a missing key can't crash the module at import.
let client;

// fighterA/fighterB must already be cleaned with sanitizeFighter().
// Returns { winner, reasoning }. Throws on refusal, a missing/invalid verdict,
// or any API error (the SDK retries 429/5xx twice before throwing).
export async function judgeFight(fighterA, fighterB) {
  client ??= new Anthropic();
  const response = await client.beta.messages.parse({
    model: JUDGE_MODEL,
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

export function mockVerdict(fighterA, fighterB) {
  const h = hash(`${fighterA}\u0000${fighterB}`);
  const winner = h % 2 === 0 ? "A" : "B";
  // Tell identical fighters apart, like the real judge does.
  const same = fighterA.toLowerCase() === fighterB.toLowerCase();
  const nameA = same ? `${fighterA} A` : fighterA;
  const nameB = same ? `${fighterB} B` : fighterB;
  const [w, l] = winner === "A" ? [nameA, nameB] : [nameB, nameA];
  return { winner, reasoning: MOCK_REASONS[(h >>> 1) % MOCK_REASONS.length](w, l), mock: true };
}
