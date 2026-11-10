// Frontend: verdict and fighter art come from /api/fight (placeholder art as fallback).
// Tip: add ?mock=error to the URL to see the error view without calling the API.

const views = {
  form: document.getElementById("view-form"),
  loading: document.getElementById("view-loading"),
  result: document.getElementById("view-result"),
  error: document.getElementById("view-error"),
  dex: document.getElementById("view-dex"),
};

const form = document.getElementById("fight-form");
const inputA = document.getElementById("fighter-a");
const inputB = document.getElementById("fighter-b");
const formMessage = document.getElementById("form-message");

const FIGHT_TIMEOUT_MS = 60_000;

// Show exactly one view; hide all the others.
function showView(name) {
  for (const [key, el] of Object.entries(views)) {
    el.hidden = key !== name;
  }
}

// Returns an error message, or "" if both inputs are valid.
function validate(a, b) {
  inputA.setAttribute("aria-invalid", String(!a));
  inputB.setAttribute("aria-invalid", String(!b));
  if (!a && !b) return "Enter two fighters.";
  if (!a) return "Enter Fighter A.";
  if (!b) return "Enter Fighter B.";
  return "";
}

// Placeholder art: a coloured square with the fighter's first letter,
// skipping a leading "a", "an" or "the" ("a ninja" shows N, not A).
function placeholderImage(label, color) {
  const name = label.replace(/^(a|an|the)\s+/i, "") || label;
  const letter = [...name][0].toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect width="100" height="100" fill="${color}"/>
    <text x="50" y="50" dy=".35em" text-anchor="middle" font-family="sans-serif"
      font-size="48" font-weight="700" fill="#fff">${escapeXml(letter)}</text>
  </svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

function escapeXml(text) {
  return text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// An error to show on the error view: a heading plus a user-facing message,
// so each kind of failure (rate limit, offline, timeout, no verdict) reads differently.
class FightError extends Error {
  constructor(title, message) {
    super(message);
    this.title = title;
  }
}

// Calls /api/fight for the verdict and both images.
// Throws a FightError with a user-facing heading and message.
async function fight(fighterA, fighterB) {
  if (new URLSearchParams(location.search).get("mock") === "error") {
    throw new FightError("Something went wrong", "Mock error: the judge left the arena.");
  }

  let response;
  try {
    response = await fetch("/api/fight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fighterA, fighterB }),
      signal: AbortSignal.timeout(FIGHT_TIMEOUT_MS),
    });
  } catch (err) {
    throw err.name === "TimeoutError"
      ? new FightError("Time's up", "The judge took too long. Try again.")
      : new FightError("Can't reach the arena", "Couldn't reach the arena. Check your connection and try again.");
  }

  const data = await response.json().catch(() => ({}));
  if (response.status === 429) {
    throw new FightError("Too many fights", data.message || "Slow down! Try again in a minute.");
  }
  if (!response.ok) {
    throw new FightError("No verdict", data.message || "The fight couldn't be judged. Please try again.");
  }
  // A 200 without a real verdict (e.g. an HTML page from a proxy) must not
  // invent a winner.
  if ((data.winner !== "A" && data.winner !== "B") || typeof data.reasoning !== "string") {
    throw new FightError("No verdict", "The fight couldn't be judged. Please try again.");
  }

  // Winner is identified by side ("A" or "B"), not by name,
  // so identical fighters (e.g. "cow" vs "cow") still work.
  // A missing image falls back to placeholder art; it never fails the fight.
  const imageA = data.images?.a ?? { status: "failed", src: null };
  const imageB = data.images?.b ?? { status: "failed", src: null };
  return {
    winnerSide: data.winner === "A" ? "a" : "b",
    reasoning: data.reasoning,
    imageA: imageA.src || placeholderImage(fighterA, "#3a6fd9"),
    imageB: imageB.src || placeholderImage(fighterB, "#d93a3a"),
    noteA: IMAGE_NOTES[imageA.status] ?? "",
    noteB: IMAGE_NOTES[imageB.status] ?? "",
  };
}

// Shown under the art when the real image couldn't be made.
// "skipped" (no image key configured) shows no note.
const IMAGE_NOTES = {
  blocked: "Art blocked by the content filter.",
  failed: "Art couldn't be generated.",
};

function renderResult(fighterA, fighterB, result) {
  const winner = result.winnerSide === "a" ? fighterA : fighterB;
  const sideLabel = fighterA === fighterB ? ` (Fighter ${result.winnerSide.toUpperCase()})` : "";
  document.getElementById("winner-name").textContent = winner + sideLabel;
  document.getElementById("reasoning").textContent = result.reasoning;

  document.getElementById("label-a").textContent = fighterA;
  document.getElementById("label-b").textContent = fighterB;

  const imageA = document.getElementById("image-a");
  const imageB = document.getElementById("image-b");
  imageA.src = result.imageA;
  imageA.alt = `Art of ${fighterA}`;
  imageB.src = result.imageB;
  imageB.alt = `Art of ${fighterB}`;
  document.getElementById("note-a").textContent = result.noteA;
  document.getElementById("note-b").textContent = result.noteB;

  document.getElementById("card-a").classList.toggle("is-winner", result.winnerSide === "a");
  document.getElementById("card-b").classList.toggle("is-winner", result.winnerSide === "b");

  // A new fight: both fighters can be saved again.
  for (const button of document.querySelectorAll("[data-action='save-fighter']")) {
    button.disabled = false;
    button.textContent = "Save to BattleDex";
  }
  for (const note of document.querySelectorAll("[data-save-message]")) note.textContent = "";
  hasLastFight = true;
}

// ---------------------------------------------------------------------------
// BattleDex: saved fighters, kept in localStorage as an array of
// { label, image } (no fight, winner or reasoning data). `image` is a data URI.
// Stage 5 will compress images before saving; until then a real image is
// ~100-150 KB, so roughly 30-40 fit in the browser's ~5 MB quota.
// ---------------------------------------------------------------------------

const DEX_KEY = "battleground.battledex";
const dexGrid = document.getElementById("dex-grid");
const dexMessage = document.getElementById("dex-message");
const clearButton = document.getElementById("btn-clear-dex");
let hasLastFight = false;
let clearArmedTimer = null;

// Only data-URI images are kept: that's all this app ever saves, and it stops
// a tampered entry from pointing an <img> at some other URL.
function isValidEntry(entry) {
  return (
    entry &&
    typeof entry.label === "string" &&
    entry.label.trim() !== "" &&
    typeof entry.image === "string" &&
    entry.image.startsWith("data:image/")
  );
}

// Returns the saved fighters. Bad or unreadable data counts as an empty list.
function loadDex() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DEX_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isValidEntry) : [];
  } catch {
    return [];
  }
}

// Returns "" on success, or a message saying why it couldn't save.
function storeDex(entries) {
  try {
    localStorage.setItem(DEX_KEY, JSON.stringify(entries));
    return "";
  } catch (err) {
    return err?.name === "QuotaExceededError"
      ? "Your BattleDex is full. Delete some fighters to make room."
      : "Couldn't save: this browser is blocking storage for this site.";
  }
}

function updateDexCount(count = loadDex().length) {
  for (const el of document.querySelectorAll(".dex-count")) el.textContent = count;
}

function renderDex() {
  const entries = loadDex();
  dexGrid.replaceChildren(
    ...entries.map((entry, index) => {
      const item = document.createElement("li");
      item.className = "dex-card";

      const img = document.createElement("img");
      img.src = entry.image;
      img.alt = `Art of ${entry.label}`;
      img.loading = "lazy";

      const name = document.createElement("p");
      name.className = "dex-name";
      name.textContent = entry.label;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn btn-small";
      remove.dataset.action = "delete-fighter";
      remove.dataset.index = String(index);
      remove.textContent = "Delete";
      remove.setAttribute("aria-label", `Delete ${entry.label} from BattleDex`);

      item.append(img, name, remove);
      return item;
    }),
  );
  document.getElementById("dex-empty").hidden = entries.length > 0;
  clearButton.hidden = entries.length === 0;
  document.getElementById("btn-last-fight").hidden = !hasLastFight;
  updateDexCount(entries.length);
}

function openDex() {
  dexMessage.textContent = "";
  disarmClear();
  renderDex();
  showView("dex");
}

function saveFighter(side, button) {
  const label = document.getElementById(`label-${side}`).textContent;
  const image = document.getElementById(`image-${side}`).src;
  const note = document.querySelector(`[data-save-message='${side}']`);
  const entry = { label, image };
  if (!isValidEntry(entry)) {
    note.textContent = "This fighter can't be saved.";
    return;
  }

  const entries = loadDex();
  entries.push(entry);
  const problem = storeDex(entries);
  if (problem) {
    note.textContent = problem;
    return;
  }
  button.disabled = true;
  button.textContent = "Saved ✓";
  note.textContent = "";
  updateDexCount(entries.length);
}

function deleteFighter(index) {
  const entries = loadDex();
  if (index < 0 || index >= entries.length) return;
  const [removed] = entries.splice(index, 1);
  const problem = storeDex(entries);
  renderDex();
  dexMessage.textContent = problem || `Deleted ${removed.label}.`;
}

// "Clear all" needs two clicks, so one stray click can't wipe the BattleDex.
// (No confirm() dialog: it blocks the page.)
function disarmClear() {
  clearTimeout(clearArmedTimer);
  delete clearButton.dataset.armed;
  clearButton.textContent = "Clear all";
}

function clearDex() {
  if (!clearButton.dataset.armed) {
    clearButton.dataset.armed = "true";
    clearButton.textContent = "Click again to clear all";
    clearArmedTimer = setTimeout(disarmClear, 4000);
    return;
  }
  disarmClear();
  const problem = storeDex([]);
  renderDex();
  dexMessage.textContent = problem || "BattleDex cleared.";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const fighterA = inputA.value.trim();
  const fighterB = inputB.value.trim();

  const message = validate(fighterA, fighterB);
  formMessage.textContent = message;
  if (message) {
    (fighterA ? inputB : inputA).focus();
    return;
  }

  showView("loading");
  try {
    const result = await fight(fighterA, fighterB);
    renderResult(fighterA, fighterB, result);
    showView("result");
  } catch (err) {
    // A non-FightError means a bug in this file; log it, still show something useful.
    if (!(err instanceof FightError)) console.error("[fight]", err);
    document.getElementById("error-title").textContent = err.title || "Something went wrong";
    document.getElementById("error-text").textContent =
      err instanceof FightError ? err.message : "Something broke on this page. Please try again.";
    showView("error");
  }
});

// All buttons with a data-action, on every view.
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  switch (button.dataset.action) {
    case "new-fight":
      showView("form");
      inputA.focus();
      break;
    case "open-dex":
      openDex();
      break;
    case "last-fight":
      if (hasLastFight) showView("result");
      break;
    case "save-fighter":
      saveFighter(button.dataset.side, button);
      break;
    case "delete-fighter":
      deleteFighter(Number(button.dataset.index));
      break;
    case "clear-dex":
      clearDex();
      break;
  }
});

updateDexCount();
showView("form");
