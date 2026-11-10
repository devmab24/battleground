// Fighter art via Pollinations (https://gen.pollinations.ai).
// Needs POLLINATIONS_API_KEY (an sk_ key from enter.pollinations.ai).
// Never throws: an image problem must not fail the fight.
import { buildImagePrompt } from "./art-style.mjs";

const ENDPOINT = "https://gen.pollinations.ai/image/";
const SIZE = 512;
const TIMEOUT_MS = 45_000;

// Returns one of:
//   { status: "ok", src: "data:image/...;base64,..." }
//   { status: "blocked", src: null }   prompt rejected by the content filter
//   { status: "failed", src: null }    any other error
//   { status: "skipped", src: null }   no API key configured
export async function generateFighterImage(fighter) {
  const key = process.env.POLLINATIONS_API_KEY;
  if (!key) return { status: "skipped", src: null };

  const params = new URLSearchParams({
    width: String(SIZE),
    height: String(SIZE),
    // Block sexual prompts on a public site. Not "violence": it's a fight game.
    safe: "sexual",
  });
  const url = ENDPOINT + encodeURIComponent(buildImagePrompt(fighter)) + "?" + params;

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      if (body?.error?.code === "content_blocked" || response.status === 422) {
        return { status: "blocked", src: null };
      }
      console.error(`[images] Pollinations returned ${response.status}:`, body?.error?.message ?? "");
      return { status: "failed", src: null };
    }

    const type = response.headers.get("content-type")?.split(";")[0] ?? "";
    if (!type.startsWith("image/")) {
      console.error(`[images] unexpected content-type: ${type}`);
      return { status: "failed", src: null };
    }
    const base64 = Buffer.from(await response.arrayBuffer()).toString("base64");
    return { status: "ok", src: `data:${type};base64,${base64}` };
  } catch (err) {
    console.error("[images] request failed:", err.name === "TimeoutError" ? "timed out" : err);
    return { status: "failed", src: null };
  }
}
