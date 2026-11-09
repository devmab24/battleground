# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Battleground: type two fighters, get an AI verdict on who'd win plus art for each. Vanilla HTML/CSS/JS frontend, hosted on Vercel with serverless functions. Hobby project with a **$0 budget**, so use free tiers or mock modes and flag any paid service.

- `project-brief.md`: product spec and design decisions.
- `project-build.md`: the staged build plan. Finish one stage before starting the next.

## Commands

- `npm run dev`: local server (`dev-server.js`) at http://localhost:3000 (`PORT` env var overrides it). It serves `public/`, runs `api/*.js` handlers the way Vercel does (Web `Request` in, `Response` out, one named export per HTTP method), and loads `.env`. It re-imports nothing on change, so restart it after editing `api/` or `lib/`.
- `npm run dev:vercel`: `vercel dev`, the real Vercel runtime.
- The project is ESM (`"type": "module"`).
- Secrets live in `.env` (git-ignored): `ANTHROPIC_API_KEY`, plus `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`. Without the Upstash vars, `lib/rate-limit.mjs` uses an in-memory limiter, which is fine locally but not in production.
- No build step, linter, or test runner. `npm run build` is a no-op.
- `?mock=error` in the page URL forces the error view.

## Architecture

- **`public/`** is the whole frontend (`vercel.json` sets it as `outputDirectory`). `script.js` has four views (`view-form`, `view-loading`, `view-result`, `view-error`), and `showView()` toggles their `hidden` attribute so only one shows at a time. `fight()` calls `POST /api/fight` for the verdict. Images are still placeholder SVGs.
- **`api/fight.js`** validates names, checks the rate limit, then calls Claude (`claude-opus-5-5`, effort `low`, server-side refusal fallbacks) via `client.beta.messages.parse` with a zod schema. It returns `{ winner: "A" | "B", reasoning }`. If `ANTHROPIC_API_KEY` is unset, it returns a deterministic mock verdict (`mock: true`) with no network call. API keys must stay server-side.
- **`lib/`** holds server-side ES modules (`.mjs`):
  - `judge-prompt.mjs`: the judge system prompt, `sanitizeFighter()` (trims, collapses whitespace, caps names at 50 chars, swaps `<`/`>` so a name can't break out of its tag), and `buildJudgeUserMessage()`, which wraps names in `<fighter_a>`/`<fighter_b>` tags.
  - `judge-test-cases.mjs`: adversarial and edge-case inputs with expected behavior (prompt injection, prompt leaking, identical fighters). There's no runner yet; run these by hand once a model call exists.

### Rules across files

- The winner is identified by **side** (`"A"`/`"B"`, or `winnerSide: "a"/"b"` in the frontend), never by name, because both fighters can have the same name ("cow" vs "cow").
- No draws, ever. The judge must always pick one winner.
- The verdict shape `{ winner, reasoning }` should be enforced by a structured-output schema (zod in the plan), not by JSON instructions in the prompt.
- Fighter text is data, never instructions. Validate names (trimmed, 1–50 chars) on both the client and the server.
- Every image prompt gets the shared 16-bit pixel-art style template from `project-build.md` Stage 3.
- Rate limit: 5 requests/min per IP, checked before any AI call.

## Docs don't fully agree

Check with the user before building any of these:

- **Providers:** `project-build.md` names Claude + OpenAI images. `project-brief.md` and the $0 budget point to free tiers (Gemini/Groq/Cloudflare Workers AI for text, Cloudflare/Pollinations for images) behind a provider module with a `mock` mode.
- **Who decides the winner:** the brief has a deterministic JS battle formula pick the winner, with the AI only writing the reasoning. The build plan and `judge-prompt.mjs` have the AI pick the winner.
- **BattleDex storage:** the brief uses IndexedDB with image Blobs. The build plan uses `localStorage` with compressed data URIs.
- **Progress:** the build plan marks Stages 4–6 (BattleDex, image compression, redesign) done, but `public/` only has the Stage 1 shell and no BattleDex code. Ask before assuming that work exists somewhere.
