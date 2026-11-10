# Battleground

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Type two fighters, get a verdict on who'd win, plus 16-bit pixel art of each. Save your favourite fighters to the BattleDex.

A hobby project with a **$0 budget**: vanilla HTML/CSS/JS on the front end, Vercel serverless functions on the back end, free tiers or mock modes for everything else.

![Design: "Arena of the Ancients"](design/sprites/lion.svg)

## Features

- **Fight verdict:** Claude judges the fight and always picks one winner, with 2–4 playful sentences of reasoning. No draws, even for "cow vs cow".
- **Mock judge:** without an Anthropic key, a built-in mock verdict is used instead, so the whole app works for free.
- **Fighter art:** each fighter gets one 16-bit pixel-art image from Pollinations, all in one shared art style. Group names ("10 cows", "an army of ants") get one image of the whole group; single fighters are drawn alone. If an image fails or is blocked, placeholder art is shown and the fight still works.
- **BattleDex:** save any fighter (win or lose) to a collection kept in the browser's `localStorage`. Images are shrunk to ~5 KB WebP before saving, so around 1,000 fighters fit.
- **Rate limit:** 5 fights per minute per visitor, checked before any AI call, using Upstash Redis.
- **"Arena of the Ancients" design:** kente bands, mud-cloth background, arcade titles, animated loading screen and a champion card for the winner. Works down to 360px wide, and all animation stops for people who ask for reduced motion.
- **Playful, clear errors:** every failure (rate limit, offline, timeout, no verdict, name too long) has its own message in an arena-announcer voice.

## Quick start

Requires Node.js 20.12 or newer (for `process.loadEnvFile`). Developed on Node 24.

```bash
npm install
cp .env.example .env      # then fill in what you have (all keys are optional)
npm run dev:local         # http://localhost:3000
```

With no keys at all the app still runs: mock verdicts, placeholder art and an in-memory rate limit.

## Environment variables

All live in `.env` (git-ignored; see `.env.example`). Every key is optional.

| Variable | Used for | Without it | Where to get it |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | The real Claude judge | Mock verdicts (`"mock": true`) | https://platform.claude.com/settings/keys (paid) |
| `POLLINATIONS_API_KEY` | Fighter art | Placeholder art | https://enter.pollinations.ai/keys. Use a **Secret** key (`sk_...`), not an App key. Uses free credits ("pollen"). |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Rate limiting | In-memory limiter: fine locally, **not reliable on Vercel** | https://console.upstash.com → create a Redis database (free plan) → REST API section |

For the live site, add the same variables in Vercel → Project → **Settings → Environment Variables** (Production and Preview), with the same names.

## Commands

| Command | What it does |
|---|---|
| `npm run dev:local` | Local server (`dev-server.js`) at http://localhost:3000. Serves `public/`, runs `api/*.js` the way Vercel does, loads `.env`. Restart it after editing `api/` or `lib/`. `PORT` overrides the port. |
| `npm run dev:vercel` | `vercel dev`, the real Vercel runtime. |
| `npm run check:judge` | Runs the judge test cases (prompt injection, prompt leaking, identical fighters) against the real Claude API: 8 paid calls. Stops before calling anything if `ANTHROPIC_API_KEY` is unset. |
| `npm run build` | No-op (static site, no build step). |

Don't add a script named `dev`: `vercel dev` runs a `dev` script in place of its own runtime if one exists.

Add `?mock=error` to the page URL to see the error screen without calling the API.

## How it works

```
public/          The whole front end (Vercel's outputDirectory)
  index.html     Five views: form, loading, result, error, BattleDex
  script.js      View switching, validation, the fight call, BattleDex
  style.css      The "Arena of the Ancients" design
api/
  fight.js       POST /api/fight: the only serverless function
lib/             Server-side modules (kept out of api/, where every file becomes a route)
  judge.mjs        Claude call (claude-opus-5-5) and the mock verdict
  judge-prompt.mjs System prompt, name cleaning and length check
  images.mjs       Pollinations image call
  art-style.mjs    Shared 16-bit art style; group vs single fighter wording
  rate-limit.mjs   Upstash limiter, in-memory fallback
  judge-test-cases.mjs  Adversarial judge tests
scripts/check-judge.mjs  Runs those tests against the real API
design/          Reference mockups and the design brief (not served)
dev-server.js    Local server for npm run dev:local
```

**One fight:** `POST /api/fight` with `{ fighterA, fighterB }`:

1. Names are cleaned (trimmed, whitespace collapsed, `<`/`>` neutralised) and checked: 1–50 characters each, counted as the player sees them (an emoji is one). Too long is an error with a message, never a silent cut. The page checks the same rule live, with an `n/50` counter.
2. The rate limit is checked (5 per minute per IP) before any AI call.
3. The verdict and both images run **in parallel**. The verdict shape `{ winner: "A" | "B", reasoning }` is enforced by a zod schema. The winner is identified by **side**, never by name, so identical fighters work.
4. The response carries `images.a` / `images.b` as `{ status: "ok" | "blocked" | "failed" | "skipped", src }`. An image problem never fails the fight.

Fighter names are treated as data, never instructions: they're wrapped in `<fighter_a>`/`<fighter_b>` tags and the judge prompt forbids following anything inside them. API keys stay server-side.

## Build status

Built in stages from [`project-build.md`](project-build.md), each on its own branch. Detailed status notes for every stage are in that file.

| Stage | What | Status |
|---|---|---|
| 0–1 | Scaffold, UI shell | ✅ Done |
| 2 | Judge system prompt | ⏳ Written; tests need an Anthropic key |
| 3 | Fight API: verdict, art, rate limiting | ✅ Done except the real Claude call (no key yet) |
| 4 | BattleDex in `localStorage` | ✅ Done |
| 5 | Image compression before save | ✅ Done |
| 6 | "Arena of the Ancients" redesign | ✅ Done |
| 7 | Final QA and deploy to Vercel | ⏳ Not started |

### Notable decisions and changes

- **Images come from Pollinations, not OpenAI** (the plan's original choice), to keep the $0 budget. Clarifai was considered but was unreachable in November 2026. Cloudflare Workers AI is the suggested fallback if one is ever needed.
- **BattleDex uses `localStorage`** with compressed data URIs, as in the build plan (not IndexedDB).
- **The Claude judge is ready to plug in:** it was checked offline against a faked API (valid verdict, refusal, bad winner, cut-off answer, bad key, no credit, rate limited, overloaded), but has never run against the live API. To switch it on: add `ANTHROPIC_API_KEY`, run `npm run check:judge`, then play a fight. See "Plugging in Claude" in `project-build.md`.
- **Rate limiting uses Upstash.** On Vercel each request can land on a fresh instance, which resets an in-memory counter; with Upstash the 6th request in a minute is blocked across instances (tested). If Upstash is unreachable the fight is refused rather than run without a limit.
- **`npm run dev` was renamed to `npm run dev:local`** so `vercel dev` uses the real Vercel runtime.
- **The old `api/art-style.js` moved to `notes/art-style.legacy.js`.** In `api/` it was a public route that returned a 500 and crashed `vercel dev`. It's kept for reference only; the live template is `lib/art-style.mjs`.

### Before going live (Stage 7)

- [ ] Add `POLLINATIONS_API_KEY` and both Upstash variables in Vercel's environment variables.
- [ ] Decide on the judge: add an Anthropic key (and set a monthly spend limit in the Claude Console) or ship with mock verdicts. Roughly a cent or two per fight on Opus 5.5 (an estimate).
- [ ] Full manual QA pass (see Stage 7 in `project-build.md`), then deploy.

## Cost notes

- **Pollinations:** each fight uses 2 images from your free credits. If they run out, placeholder art is shown.
- **Upstash:** a few Redis commands per fight; well within the free plan for a hobby site (check current limits).
- **Anthropic:** paid. Not used until a key is added.
- **Fonts:** Google Fonts (Bungee, Silkscreen, Archivo), free.

## License

[MIT](LICENSE) © 2026 Muhammad Bello Ayuba. You're free to use, copy, modify and share this project, as long as the copyright notice and license text are kept. It comes with no warranty.
