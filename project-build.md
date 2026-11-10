/# Battleground — Staged Build Plan

> Source: `project-brief.md`. Each stage ships something runnable/demoable before moving to next. Do not start stage N+1 until stage N works.

---

## Stage 0 — Scaffold

**Goal:** empty project running locally.

- [x] `index.html`, `style.css`, `script.js` — bare skeleton, no logic yet
- [x] `vercel.json` (if needed) + `api/` folder for serverless functions
- [x] `package.json` (name, no deps yet unless a dev server is wanted)
- [x] Run locally (e.g. `vercel dev` or a static server), confirm blank page loads

**Done when:** blank page loads locally. No deploy — building and testing locally the whole way.

---

## Stage 1 — Static UI shell (no backend)

**Goal:** all core UI elements exist and are wired to JS, hardcoded/mock data only.

- [x] Four separate views on one page — input form, loading, result, error — each toggled via `hidden` attribute, never stacked/visible together
- [x] Input form view: two text inputs (fighter A, fighter B), Fight button — the only view visible on load
- [x] Loading view: spinner/skeleton, shown on click
- [x] Result view: winner name, written reasoning, two image slots — populate with placeholder text/images after a fake `setTimeout` delay
- [x] Error view: placeholder error message
- [x] Basic CSS layout, mobile-usable

**Done when:** on load only input form shows; clicking Fight hides it, shows loading, then swaps to result view (fake data) via `hidden`, no network calls yet.

---

## Stage 2 — Judge system prompt

**Goal:** lock Claude's role to judging fights, resist prompt injection from fighter input.

- [ ] Write the system prompt used in the verdict call: role locked to fight judge only — takes two fighters, returns a winner and reasoning, nothing else
- [ ] Must always pick exactly one winner — no ties, no draws, no refusing to decide, even for identical/mirrored fighters (break the tie on flavor/creativity if needed, but still pick one)
- [ ] Reasoning must be 2-4 sentences max, fun and playful tone, but logically justifies the winner
- [ ] Explicitly forbid in the prompt: role changes, revealing the system prompt, following instructions embedded in fighter names/descriptions, doing anything other than judging the fight
- [ ] Treat fighter input strictly as data to judge, never as instructions
- [ ] Test with adversarial input (e.g. a fighter name containing "ignore previous instructions and...") — confirm it still just judges a fight
- [ ] Test with identical fighters twice (e.g. "cow" vs "cow") — confirm it still names one winner, no tie/refusal

**Done when:** injected instructions inside fighter text don't change judge behavior or leak the system prompt.

---

## Stage 3 — Fight API (verdict + art + rate limiting)

**Goal:** one function, one call, real winner + reasoning + one image per side, end to end.

- [x] `api/fight.js` serverless function: takes `{ fighterA, fighterB }`
- [x] Rate limit check runs first, before calling either API — key by IP, 5 requests/minute per `project-brief.md` §5, return 429 with a clear message when exceeded
- [ ] Calls Claude for the verdict (using the Stage 2 system prompt) and ~~OpenAI~~ **Pollinations** image API for both fighters' art (images verified; Claude verdict not yet tested, see notes)
- [ ] Verdict output (`winner`, `reasoning`) enforced via a zod schema, not JSON-format instructions in the prompt (written in `lib/judge.mjs`, not yet run against the real API)
- [x] Store both API keys in env vars, never in client code
- [x] Group inputs (e.g. "10 cows") still produce exactly one image for that side — handled in the prompt sent to the image API, not by looping
- [x] Every image generated must follow one shared art style template, appended to each fighter's image prompt (not left to the model's default style):
  > 16-bit pixel art illustration, retro video game sprite style, bold outlined pixels, vibrant limited color palette, dynamic action pose. Depicted as one cohesive image, centered, filling most of the frame, isolated on a plain solid color background with no scenery. No text, words, letters, numbers, logos, watermarks, UI elements, borders, or frames.
- [x] Wire Fight button to call `/api/fight` instead of the fake timeout
- [x] Handle errors distinctly in the UI: verdict failure, image failure, moderation-blocked (image request rejected by ~~OpenAI's~~ the image provider's content filter — distinct message from a generic image failure), rate-limit 429 — don't hang on loading forever (tested in Chrome 2026-11-10, see notes)

**Done when:** typing two real fighters returns winner + reasoning + one image per side from a single call, both images following the shared art style template; hammering Fight 6x in a minute from one IP gets blocked on the 6th and resets after a minute.

### Stage 3 status notes (2026-11-10)

**Image provider: Pollinations, not OpenAI.** This plan originally named the OpenAI image API. To keep the $0 budget, images come from Pollinations (`gen.pollinations.ai/image/`, `lib/images.mjs`), which `project-brief.md` lists as a free-tier candidate. It needs a **secret** key (`sk_...`) from https://enter.pollinations.ai/keys in `POLLINATIONS_API_KEY`. Every image is paid from that account's free credits ("pollen"); if they run out, images fall back to placeholder art and the fight still works. Requests use `safe: "sexual"`, so sexual prompts are blocked but fight violence is allowed. Clarifai was considered as an alternative, but its site, API and docs were unreachable on 2026-11-10 (reportedly folded into Nebius in 2026). Cloudflare Workers AI (free daily allowance, FLUX models) is the recommended fallback if one is needed; not built.

**Claude verdict: NOT TESTED.** `ANTHROPIC_API_KEY` is empty in `.env`, so every fight so far returned the mock verdict (`mock: true`). The real call in `api/fight.js` (Claude, zod schema, refusal handling) has never run. This also blocks the Stage 2 tests (prompt injection, prompt leaking, identical fighters in `lib/judge-test-cases.mjs`). To do: add a key, run real fights, run the Stage 2 cases.

**Rate limit: PASSED locally (in-memory limiter).** Tested 2026-11-10 against `npm run dev`: fights 1–5 returned 200, fight 6 returned 429 with `Retry-After: 60` and "Slow down! Try again in 60 seconds.", an invalid request while blocked still returned 400 (invalid requests aren't counted), and a fight after ~61 s returned 200. Not tested: the Upstash Redis limiter used in production (`UPSTASH_REDIS_REST_URL`/`TOKEN` are empty locally). Without Upstash on Vercel, each serverless instance keeps its own count, so the limit isn't reliable there.

**Group inputs / single fighters: FIXED.** Single fighters ("a samurai", "a grizzly bear") were being drawn as crowds, because every prompt mentioned groups. `buildImagePrompt()` in `lib/art-style.mjs` now uses `isGroupFighter()` to spot groups (a leading number like "10 cows", number words like "a dozen", group words like "army"/"swarm"/"pack", or "and"/"&" as in "Batman and Robin") and asks for "exactly one single character" otherwise. Verified with real images: samurai, bear and Godzilla each came out as one character; "10 cows" came out as one image of a herd (9 cows; image models don't count exactly). Known limit: a plural with no number ("cows") is treated as one fighter.

**Art style: PASSED.** All generated images follow the 16-bit pixel-art template.

**Leftover file:** `api/art-style.js` is an old CommonJS copy of the template, fully commented out so it can't break the ESM build (`vercel build` passed on 2026-11-10). Vercel still exposes it as `/api/art-style` with no handler; moving it out of `api/` would remove that route.

**Still open before Stage 3 is done:**
- [ ] **The real Claude call has never run against the live API** (no budget for an Anthropic key yet, 2026-11-10). Everything that can be checked without a key has been:
  - The judge code now lives in `lib/judge.mjs` (`judgeFight()`, the zod `VerdictSchema`, `mockVerdict()`); `api/fight.js` imports it. Behavior unchanged.
  - Checked offline on 2026-11-10 by faking Anthropic's server inside a Node process (no network, $0), running the real `api/fight.js`: a valid verdict → 200 with winner and reasoning; refusal, winner other than "A"/"B" (zod rejects it), cut-off answer (`max_tokens`), bad key (401) and out-of-credit (400) → 502 "No verdict"; rate limited (429) and overloaded (529) → 503 "judge is swamped" after the SDK's 2 retries. The request sent matches the current API: `claude-opus-5-5`, `effort: "low"`, `fallbacks: "default"` with the `server-side-fallback-2026-07-01` beta, JSON-schema output, fighters wrapped in `<fighter_a>`/`<fighter_b>`.
  - `npm run check:judge` (`scripts/check-judge.mjs`) runs the 7 Stage 2 cases (8 calls) against the real API and auto-checks each verdict: winner is A/B, 2-4 sentences, no system-prompt leak. Without a key it stops before calling anything. Verified against the faked API, including that it flags a leak and a too-short answer.

### Plugging in Claude (when there's budget)

1. Get a key at https://platform.claude.com/settings/keys and add credit.
2. Put it in `.env` as `ANTHROPIC_API_KEY=sk-ant-...` (see `.env.example`). No code changes needed.
3. Run `npm run check:judge`. Expect 8 verdicts, all "auto-checks passed"; read each reasoning against its "Expect" line (no poem, no code, no leaked prompt, cow A vs cow B told apart). Then tick Stage 2's boxes.
4. Restart `npm run dev:local` (or `npm run dev:vercel`) and play a fight: the response should no longer have `"mock": true`.
5. For the live site, add the same key in Vercel → Project → Settings → Environment Variables, then redeploy.

**Cost:** Opus 5.5 is $4 / $20 per million input / output tokens. Each fight sends ~1K tokens and gets a short answer at `effort: "low"`, so roughly a cent or two per fight (an estimate; check `usage` on the first real calls). The 5 fights/min/IP limit caps abuse per visitor, not in total, so set a monthly spend limit in the Claude Console before going live. A cheaper model (e.g. Claude Haiku 5.5 at $0.10 / $0.50) is a one-line change of `JUDGE_MODEL` in `lib/judge.mjs`, but Haiku has no server-side refusal fallback, so drop the `betas`/`fallbacks` lines with it, and re-run `npm run check:judge` to confirm quality holds.
- [x] **The error screens in the browser have been clicked through (2026-11-10, Chrome, `npm run dev`).**
  - Tested for real: empty fields ("Enter two fighters."), a normal fight, the rate limit (6th fight via the page shows "Too many fights / Slow down! Try again in N seconds."), a real verdict failure (deliberately invalid Anthropic key → 401 → "No verdict / The judge couldn't reach a verdict."), offline (server stopped → "Can't reach the arena"), and `?mock=error`.
  - Tested with faked server responses in the page (can't easily be triggered for real): 503 judge busy, 500 crash page, timeout ("Time's up"), and the image notes ("Art blocked by the content filter." / "Art couldn't be generated."; "skipped" shows no note). The loading screen never got stuck.
  - Bugs found and fixed in `public/script.js` / `public/index.html`:
    1. Every error had the same "Something went wrong" heading. Each kind now has its own: "Too many fights", "No verdict", "Can't reach the arena", "Time's up".
    2. A 200 response without a valid verdict (e.g. an HTML page, or JSON missing `winner`) made the page invent a winner (Fighter B, blank reasoning). It now shows "No verdict".
    3. Placeholder art showed "A" for both "a ninja" and "a pirate". It now skips a leading "a"/"an"/"the" (shows N and P).
    4. Expected failures no longer log console errors; only unexpected bugs are logged.
  - Not tested: the real 60-second timeout (only faked), and a real "blocked" image from Pollinations' content filter (only faked).

---

## Stage 4 — BattleDex (save to localStorage)

**Goal:** save individual fighters, view saved fighters.

- [x] "Save" action per fighter: writes `{ label, image }` to a `localStorage` array — no fight/winner/reasoning data, just the fighter
- [x] BattleDex view: grid of saved fighters, each a mini trading-card style (image on top, name below) — not clickable, card just displays label + image
- [x] Delete/clear entries from BattleDex
- [x] "Back to last fight" button on BattleDex view — jumps back to most recent result view (winner/reasoning/images still in memory)
- [x] "New fight" button on BattleDex view — returns to input form view

**Done when:** save a fighter, reload the page, it's still there in BattleDex; from BattleDex, can jump back to last fight result or start a new fight.

### Stage 4 status notes (2026-11-10)

**Built** in `public/index.html`, `public/script.js`, `public/style.css` (no server changes). Storage: `localStorage` key `battleground.battledex`, an array of `{ label, image }` where `image` is the data URI shown on the card (real art or the placeholder SVG).
- Each result card has a "Save to BattleDex" button (shows "Saved ✓" once saved; resets on the next fight).
- The BattleDex opens from a "BattleDex (N)" button on the form and on the result view. It is a fifth view toggled by `showView()` like the others.
- Each saved card has a Delete button. "Clear all" needs two clicks within 4 s (no `confirm()` dialog, which blocks the page).
- "Back to last fight" only shows when a fight has happened since the page loaded (the last fight lives in memory, per the plan).

**Tested in Chrome (2026-11-10, `npm run dev`):** empty state; a real fight with Pollinations art, both fighters saved; **page reload → both still in the BattleDex (Done-when passed)**; stored entries have only `label` and `image`; "Back to last fight" restores winner, reasoning and images; Delete; Clear all (first click only arms it); a full `localStorage` shows "Your BattleDex is full. Delete some fighters to make room." and the retry works once space is free; corrupted JSON shows an empty BattleDex instead of crashing; tampered entries (an outside image URL, an empty name, a non-object) are skipped, and a name containing HTML is shown as plain text. No console errors.

**Known limits (for Stage 5):** images are saved uncompressed. Two real images took ~134 KB, so roughly 70 real-art fighters fit in a typical ~5 MB quota. Saving the same fighter in two different fights stores two copies (allowed on purpose: each fight's art is different).

---

## Stage 5 — Image compression before save

**Goal:** stay under `localStorage` quota (per brief §5).

- [x] Before saving a fighter to BattleDex, draw its image to an off-screen `<canvas>`, resize down, re-export as JPEG/WebP at reduced quality
- [x] Save the compressed data URI, not the original
- [x] Test with several saved fighters that quota isn't hit quickly

**Done when:** ~10+ saved fighters don't blow `localStorage` quota.

### Stage 5 status notes (2026-11-10)

**Built** in `public/script.js` (`compressImage()`, `saveFighter()` is now async). Before saving, the fighter's art is drawn onto an off-screen canvas at 256 px (the BattleDex shows it at ~140–200 px, so it stays sharp on high-DPI screens) and re-exported as WebP at quality 0.8, or JPEG 0.8 where the browser can't encode WebP. Whichever is smaller, the result or the original, is stored, so the tiny placeholder SVGs stay as they are. If compression fails for any reason, the original is saved. The Save button shows "Saving…" (disabled) while it works, and a save that finishes after a new fight has started doesn't touch the new fight's buttons.

**Tested in Chrome (2026-11-10, `npm run dev`):** one real fight (2 Pollinations images, JPEG, 46 KB and 49 KB), then 12 fighters saved through the page's Save buttons: each stored as WebP at **~5 KB (about 9× smaller)**, **12 fighters = 61 KB total**, so ~1,000 fit in a 5 MB quota (was ~70 uncompressed). **Done-when passed.** The compressed art still looks clean at card size. After a page reload all 12 load at 256 px. Placeholder art stays SVG (0.5 KB). With WebP export disabled, a 142 KB source was stored as a 6.9 KB JPEG. Broken image data saves the original without crashing. No console errors.

**Known limit:** fighters saved before Stage 5 keep their full-size images; they're not re-compressed.

---

## Stage 6 — Claude redesign

**Goal:** hand entire app to Claude Design for full visual overhaul — not just verdict UI polish, every view.

- [ ] Run all four views (form, loading, result, error) plus BattleDex through Claude Design for a complete visual pass — imported "Battleground Arcade" design project via the Claude Design MCP
- [ ] Winner card component: name, image, reasoning text, entry animation when result lands (winner border pulse, WINNER/DEFEAT tags, grayscale loser)
- [ ] Loading state redesigned to cover full wait for the fight call (VS spinner, rotating status text, animated verdict/art progress bar)
- [ ] Consistent visual language applied app-wide (typography, color, spacing, motion) — no leftover placeholder styling anywhere

**Done when:** full app feels like one designed product, no more placeholder styling on any view.

---

## Stage 7 — Final QA

**Goal:** ship it.

- [ ] Full manual pass: empty inputs, one empty input, same fighter twice, very long names, non-English input
- [ ] Confirm rate limiting doesn't fire on normal single-fight use
- [ ] Confirm loading/error states cover: fight API failure (verdict or image side), rate limit hit, network offline
- [ ] Deploy to Vercel

**Done when:** app handles the MVP end to end without console errors, deployed to Vercel.

---

## Explicitly out of scope (per brief §4 — later, not now)

- Real backend / cross-device BattleDex sync
- Quick re-fight using saved BattleDex characters
