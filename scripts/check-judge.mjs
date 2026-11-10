// Runs the Stage 2 judge test cases (lib/judge-test-cases.mjs) against the
// real Claude API:  npm run check:judge
//
// Needs ANTHROPIC_API_KEY in .env. Each run makes 8 API calls (the identical-
// fighters case runs twice), so it costs a few cents. Without a key it stops
// before calling anything.
//
// Automatic checks: a verdict came back, the winner is "A" or "B", reasoning
// is 2-4 sentences, and no chunk of the system prompt leaked. The "expect"
// line for each case is for you to read against the reasoning by eye.
import fs from "node:fs";
import { JUDGE_SYSTEM_PROMPT, sanitizeFighter } from "../lib/judge-prompt.mjs";
import { JUDGE_TEST_CASES } from "../lib/judge-test-cases.mjs";

if (fs.existsSync(".env")) process.loadEnvFile(".env");

// Import after .env is loaded.
const { JUDGE_MODEL, hasJudgeKey, judgeFight } = await import("../lib/judge.mjs");

if (!hasJudgeKey()) {
  console.log("ANTHROPIC_API_KEY is not set, so nothing was called.");
  console.log("Add it to .env (key from https://platform.claude.com/settings/keys), then run: npm run check:judge");
  process.exit(1);
}

// Any 40-character run of the system prompt showing up in the reasoning counts as a leak.
function leaksPrompt(text) {
  const prompt = JUDGE_SYSTEM_PROMPT.replace(/\s+/g, " ").toLowerCase();
  const said = text.replace(/\s+/g, " ").toLowerCase();
  for (let i = 0; i + 40 <= prompt.length; i += 10) {
    if (said.includes(prompt.slice(i, i + 40))) return true;
  }
  return false;
}

function sentenceCount(text) {
  return text.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim()).length;
}

const runs = JUDGE_TEST_CASES.flatMap((c) => (c.name.includes("run twice") ? [c, c] : [c]));
console.log(`Judging ${runs.length} test fights with ${JUDGE_MODEL}...\n`);

let failures = 0;
for (const [i, test] of runs.entries()) {
  const a = sanitizeFighter(test.fighterA);
  const b = sanitizeFighter(test.fighterB);
  console.log(`${i + 1}. ${test.name}`);
  console.log(`   A: ${a}\n   B: ${b}`);
  try {
    const { winner, reasoning } = await judgeFight(a, b);
    const problems = [];
    if (winner !== "A" && winner !== "B") problems.push(`winner is "${winner}"`);
    const n = sentenceCount(reasoning);
    if (n < 2 || n > 4) problems.push(`${n} sentences (want 2-4)`);
    if (leaksPrompt(reasoning)) problems.push("reasoning repeats part of the system prompt");
    console.log(`   Winner: ${winner}\n   Reasoning: ${reasoning}`);
    console.log(`   Expect: ${test.expect}`);
    console.log(problems.length ? `   FAIL: ${problems.join("; ")}` : "   auto-checks passed");
    if (problems.length) failures++;
  } catch (err) {
    failures++;
    console.log(`   FAIL: no verdict (${err.message})`);
  }
  console.log();
}

console.log(failures ? `${failures} of ${runs.length} failed the automatic checks.` : `All ${runs.length} passed the automatic checks. Read each "Expect" line against its reasoning too.`);
process.exit(failures ? 1 : 0);
