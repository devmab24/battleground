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

// Show exactly one view; hide all the others. body[data-view] lets the
// header show the right button for the current view (see style.css).
function showView(name) {
  for (const [key, el] of Object.entries(views)) {
    el.hidden = key !== name;
  }
  document.body.dataset.view = name;
}

// Same limit and counting as the server (lib/judge-prompt.mjs): whitespace
// collapsed and trimmed, counted in characters, so an emoji counts as 1.
const MAX_FIGHTER_LENGTH = 50;

function nameLength(name) {
  return [...name.replace(/\s+/g, " ").trim()].length;
}

// Returns the too-long message for the two names, or "" if both fit.
function lengthMessage(a, b) {
  const overA = nameLength(a) > MAX_FIGHTER_LENGTH;
  const overB = nameLength(b) > MAX_FIGHTER_LENGTH;
  if (overA && overB) {
    return `Both names are too long for the scoreboard! Keep each fighter to ${MAX_FIGHTER_LENGTH} characters or fewer.`;
  }
  if (overA || overB) {
    const [side, name] = overA ? ["A", a] : ["B", b];
    return `Fighter ${side}'s name won't fit on the scoreboard! Trim it to ${MAX_FIGHTER_LENGTH} characters or fewer (it's at ${nameLength(name)}).`;
  }
  return "";
}

// Returns an error message, or "" if both inputs are valid.
function validate(a, b) {
  const over = (name) => nameLength(name) > MAX_FIGHTER_LENGTH;
  inputA.setAttribute("aria-invalid", String(!a || over(a)));
  inputB.setAttribute("aria-invalid", String(!b || over(b)));
  if (!a && !b) return "The ring is empty! Name two fighters to start the brawl.";
  if (!a) return "Fighter A is a no-show! Give them a name.";
  if (!b) return "Fighter B is a no-show! Give them a name.";
  return lengthMessage(a, b);
}

// Live while typing: update the "n/50" counters and warn as soon as a name is
// too long (the empty-name messages only show on submit).
let showingLengthMessage = false;
function onNameInput() {
  for (const [input, counter] of [[inputA, "count-a"], [inputB, "count-b"]]) {
    const n = nameLength(input.value);
    const el = document.getElementById(counter);
    el.textContent = `${n}/${MAX_FIGHTER_LENGTH}`;
    el.classList.toggle("is-over", n > MAX_FIGHTER_LENGTH);
    if (n > MAX_FIGHTER_LENGTH) input.setAttribute("aria-invalid", "true");
    else if (input.getAttribute("aria-invalid") === "true" && input.value.trim()) input.setAttribute("aria-invalid", "false");
  }
  const message = lengthMessage(inputA.value, inputB.value);
  if (message) {
    formMessage.textContent = message;
    showingLengthMessage = true;
  } else if (showingLengthMessage) {
    formMessage.textContent = "";
    showingLengthMessage = false;
  }
  updateFightButton();
}

// Grey out Fight until both names are in and fit. It uses aria-disabled, not
// disabled, so it stays clickable: a click on the greyed button still runs
// validate() and shows why the fight can't start yet.
const fightButton = document.getElementById("btn-fight");
function updateFightButton() {
  const a = inputA.value.trim();
  const b = inputB.value.trim();
  const ready = Boolean(a && b) && !lengthMessage(a, b);
  fightButton.setAttribute("aria-disabled", String(!ready));
}
inputA.addEventListener("input", onNameInput);
inputB.addEventListener("input", onNameInput);

// Placeholder art: a coloured square with the fighter's first letter,
// skipping a leading "a", "an" or "the" ("a ninja" shows N, not A).
// Arena style: a dotted tile in the fighter's side colour with a big bone
// letter, ink outline and hard ink shadow. (An SVG used as an <img> can't load
// the page's web fonts, so the letter uses a heavy system font.)
function placeholderImage(label, color, dotColor) {
  const name = label.replace(/^(a|an|the)\s+/i, "") || label;
  const letter = escapeXml([...name][0].toUpperCase());
  const text = (dx, fill, stroke) =>
    `<text x="${50 + dx}" y="${50 + dx}" dy=".36em" text-anchor="middle"
      font-family="'Arial Black', Impact, 'Segoe UI Black', sans-serif" font-weight="900"
      font-size="58" fill="${fill}" stroke="${stroke}" stroke-width="5"
      stroke-linejoin="round" paint-order="stroke fill">${letter}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <defs><pattern id="d" width="10" height="10" patternUnits="userSpaceOnUse">
      <circle cx="5" cy="5" r="1.7" fill="${dotColor}"/></pattern></defs>
    <rect width="100" height="100" fill="${color}"/>
    <rect width="100" height="100" fill="url(#d)"/>
    ${text(4, "#1A0F0A", "#1A0F0A")}
    ${text(0, "#F3E3C3", "#1A0F0A")}
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
    throw new FightError("Test-mode mayhem!", "Mock error: the judge stormed out of the arena in a huff.");
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
      ? new FightError("Time's up!", "The judges deliberated so long the crowd went home. Step back in the ring and try again!")
      : new FightError("The arena's gone dark!", "We can't reach the arena. Check your connection and come back swinging.");
  }

  const data = await response.json().catch(() => ({}));
  if (response.status === 429) {
    throw new FightError(
      "Easy, champ!",
      data.message || "Whoa there! The crowd needs a breather. Give it a minute before the next bout.",
    );
  }
  if (response.status === 400) {
    throw new FightError("Foul!", data.message || "The referee threw out that challenge. Check both names and try again.");
  }
  if (response.status === 503) {
    throw new FightError(
      "Hold your horses!",
      data.message || "The arena is packed to bursting! Catch your breath and try again in a moment.",
    );
  }
  if (!response.ok) {
    throw new FightError(
      "No decision!",
      data.message || "The fight fizzled out before anyone landed a punch. Ring the bell and try again!",
    );
  }
  // A 200 without a real verdict (e.g. an HTML page from a proxy) must not
  // invent a winner.
  if ((data.winner !== "A" && data.winner !== "B") || typeof data.reasoning !== "string") {
    throw new FightError("No decision!", "The scorecards came back blank! Ring the bell and try again.");
  }

  // Winner is identified by side ("A" or "B"), not by name,
  // so identical fighters (e.g. "cow" vs "cow") still work.
  // A missing image falls back to placeholder art; it never fails the fight.
  const imageA = data.images?.a ?? { status: "failed", src: null };
  const imageB = data.images?.b ?? { status: "failed", src: null };
  return {
    winnerSide: data.winner === "A" ? "a" : "b",
    reasoning: data.reasoning,
    // Side colours from the design: adire indigo (A), laterite red (B).
    imageA: imageA.src || placeholderImage(fighterA, "#6F8BFF", "#5873E0"),
    imageB: imageB.src || placeholderImage(fighterB, "#E8673A", "#C9532A"),
    noteA: IMAGE_NOTES[imageA.status] ?? "",
    noteB: IMAGE_NOTES[imageB.status] ?? "",
  };
}

// Fun lines that rotate on the loading view while the fight is judged.
// Functions get the two fighter names (set with textContent, so any name is safe).
const LOADING_LINES = [
  "Sharpening claws…",
  "Consulting the ancient scrolls…",
  "Polishing the championship belt…",
  "Taping up the gloves…",
  "Warming up the crowd…",
  "Flexing dramatically for the cameras…",
  "Checking the rulebook (there isn't one)…",
  "Rolling for initiative…",
  "Sweeping the arena floor…",
  "Bribing the referee… just kidding…",
  "Selling overpriced arena nachos…",
  "Rehearsing victory poses…",
  (a) => `${a} is cracking their knuckles…`,
  (a, b) => `${b} is doing suspicious stretches…`,
  (a, b) => `Sizing up ${a} vs ${b}…`,
  (a, b) => `The crowd is chanting for ${Math.random() < 0.5 ? a : b}…`,
];
const LOADING_LINE_MS = 1800;
const loadingText = document.getElementById("loading-text");
let loadingTimer = null;

// Starts cycling lines in a shuffled order, so none repeats until all have shown.
function startLoadingLines(fighterA, fighterB) {
  stopLoadingLines();
  document.getElementById("loading-status").textContent =
    `The fight is on: ${fighterA} versus ${fighterB}. Waiting for the judges.`;
  // The two portrait frames show who's fighting while the art is painted.
  document.getElementById("loading-name-a").textContent = fighterA;
  document.getElementById("loading-name-b").textContent = fighterB;
  let queue = [];
  const next = () => {
    if (!queue.length) queue = [...LOADING_LINES].sort(() => Math.random() - 0.5);
    const line = queue.pop();
    loadingText.textContent = typeof line === "function" ? line(fighterA, fighterB) : line;
    // Replay the rise-in animation for each new line.
    loadingText.classList.remove("line-in");
    void loadingText.offsetWidth;
    loadingText.classList.add("line-in");
  };
  next();
  loadingTimer = setInterval(next, LOADING_LINE_MS);
}

function stopLoadingLines() {
  clearInterval(loadingTimer);
  loadingTimer = null;
  document.getElementById("loading-status").textContent = "";
}

// Shown under the art when the real image couldn't be made.
// "skipped" (no image key configured) shows no note.
const IMAGE_NOTES = {
  blocked: "The ring censors confiscated this portrait.",
  failed: "Our arena artist fainted mid-sketch. No portrait this time.",
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
  fightCount++;
}

// ---------------------------------------------------------------------------
// BattleDex: saved fighters, kept in localStorage as an array of
// { label, image } (no fight, winner or reasoning data). `image` is a data URI,
// shrunk by compressImage() before saving so many fighters fit in the
// browser's ~5 MB localStorage quota.
// ---------------------------------------------------------------------------

// Saved art is shown at most ~200px wide in the BattleDex grid, so 256px
// keeps it sharp on high-DPI screens.
const SAVE_IMAGE_SIZE = 256;
const SAVE_IMAGE_QUALITY = 0.8;

// Draws the image onto an off-screen canvas at SAVE_IMAGE_SIZE and re-exports
// it as WebP (JPEG where the browser can't make WebP). Returns the smaller of
// the result and the original, so tiny placeholder SVGs are kept as they are.
// Falls back to the original if anything goes wrong.
async function compressImage(src) {
  try {
    const img = new Image();
    img.src = src;
    await img.decode();

    const scale = Math.min(1, SAVE_IMAGE_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // toDataURL quietly returns PNG for formats it can't encode, so check.
    let out = canvas.toDataURL("image/webp", SAVE_IMAGE_QUALITY);
    if (!out.startsWith("data:image/webp")) out = canvas.toDataURL("image/jpeg", SAVE_IMAGE_QUALITY);
    return out.length < src.length ? out : src;
  } catch {
    return src;
  }
}

const DEX_KEY = "battleground.battledex";
const dexGrid = document.getElementById("dex-grid");
const dexMessage = document.getElementById("dex-message");
const clearButton = document.getElementById("btn-clear-dex");
let hasLastFight = false;
let fightCount = 0; // goes up with every rendered fight
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
      ? "The BattleDex is packed to the rafters! Retire a few fighters to make room."
      : "This browser locked the BattleDex vault. Allow site storage to save fighters.";
  }
}

function updateDexCount(count = loadDex().length) {
  for (const el of document.querySelectorAll(".dex-count")) el.textContent = count;
}

function renderDex() {
  const entries = loadDex();
  dexGrid.replaceChildren(
    ...entries.map((entry, index) => {
      // A plaque: art panel (dotted background cycling through 4 colours,
      // "No. 001" tag), then a bone name plate with the delete button.
      const item = document.createElement("li");
      item.className = `dex-card dex-tone-${index % 4}`;

      const art = document.createElement("div");
      art.className = "dex-art";

      const num = document.createElement("span");
      num.className = "dex-num";
      num.setAttribute("aria-hidden", "true");
      num.textContent = `No. ${String(index + 1).padStart(3, "0")}`;

      const img = document.createElement("img");
      img.src = entry.image;
      img.alt = `Art of ${entry.label}`;
      img.loading = "lazy";
      art.append(num, img);

      const plate = document.createElement("div");
      plate.className = "dex-plate";

      const name = document.createElement("p");
      name.className = "dex-name";
      name.textContent = entry.label;

      // Icon button (trash icon in CSS); the label says what it deletes.
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn dex-delete";
      remove.dataset.action = "delete-fighter";
      remove.dataset.index = String(index);
      remove.setAttribute("aria-label", `Delete ${entry.label} from BattleDex`);
      const removeText = document.createElement("span");
      removeText.className = "visually-hidden";
      removeText.textContent = "Delete";
      remove.append(removeText);

      plate.append(name, remove);
      item.append(art, plate);
      return item;
    }),
  );
  document.getElementById("dex-empty").hidden = entries.length > 0;
  clearButton.hidden = entries.length === 0;
  document.getElementById("btn-last-fight").hidden = !hasLastFight;
  updateDexCount(entries.length);
}

function openDex() {
  // Never mid-fight: the result would land on top of the BattleDex.
  if (!views.loading.hidden) return;
  dexMessage.textContent = "";
  disarmClear();
  renderDex();
  showView("dex");
}

async function saveFighter(side, button) {
  const label = document.getElementById(`label-${side}`).textContent;
  const original = document.getElementById(`image-${side}`).src;
  const note = document.querySelector(`[data-save-message='${side}']`);
  if (!isValidEntry({ label, image: original })) {
    note.textContent = "This fighter refuses to be filed away!";
    return;
  }

  // Compressing takes a moment; block double clicks and remember which fight
  // this was, in case a new fight starts before it finishes.
  const fight = fightCount;
  button.disabled = true;
  button.textContent = "Saving…";
  const image = await compressImage(original);

  const entries = loadDex();
  entries.push({ label, image });
  const problem = storeDex(entries);
  updateDexCount(problem ? entries.length - 1 : entries.length);
  if (fight !== fightCount) return; // the buttons now belong to a newer fight

  if (problem) {
    button.disabled = false;
    button.textContent = "Save to BattleDex";
    note.textContent = problem;
    return;
  }
  button.textContent = "Saved ✓";
  note.textContent = "";
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
  startLoadingLines(fighterA, fighterB);
  try {
    const result = await fight(fighterA, fighterB);
    stopLoadingLines();
    renderResult(fighterA, fighterB, result);
    showView("result");
  } catch (err) {
    stopLoadingLines();
    // A non-FightError means a bug in this file; log it, still show something useful.
    if (!(err instanceof FightError)) console.error("[fight]", err);
    document.getElementById("error-title").textContent = err.title || "Wardrobe malfunction!";
    document.getElementById("error-text").textContent =
      err instanceof FightError
        ? err.message
        : "Something snapped backstage. Refresh the page and step back into the ring.";
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
    case "pick-matchup":
      // Fill both names from a suggestion chip, then hand focus to Fight.
      inputA.value = button.dataset.a;
      inputB.value = button.dataset.b;
      formMessage.textContent = "";
      onNameInput();
      fightButton.focus();
      break;
  }
});

updateDexCount();
updateFightButton();
showView("form");
