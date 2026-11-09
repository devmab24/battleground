// Stage 1: UI shell with fake data. No network calls yet.
// Tip: add ?mock=error to the URL to see the error view.

const views = {
  form: document.getElementById("view-form"),
  loading: document.getElementById("view-loading"),
  result: document.getElementById("view-result"),
  error: document.getElementById("view-error"),
};

const form = document.getElementById("fight-form");
const inputA = document.getElementById("fighter-a");
const inputB = document.getElementById("fighter-b");
const formMessage = document.getElementById("form-message");

const FAKE_DELAY_MS = 1500;

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

// Placeholder art: a coloured square with the fighter's first letter.
function placeholderImage(label, color) {
  const letter = [...label][0].toUpperCase();
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

// Stand-in for the real /api/fight call (Stage 3).
function fakeFight(fighterA, fighterB) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (new URLSearchParams(location.search).get("mock") === "error") {
        reject(new Error("Mock error: the judge left the arena."));
        return;
      }
      // Winner is identified by side ("a" or "b"), not by name,
      // so identical fighters (e.g. "cow" vs "cow") still work.
      const winnerSide = Math.random() < 0.5 ? "a" : "b";
      const winner = winnerSide === "a" ? fighterA : fighterB;
      resolve({
        winnerSide,
        reasoning: `${winner} wins this one. This is placeholder reasoning — the real verdict arrives in Stage 3.`,
        imageA: placeholderImage(fighterA, "#3a6fd9"),
        imageB: placeholderImage(fighterB, "#d93a3a"),
      });
    }, FAKE_DELAY_MS);
  });
}

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

  document.getElementById("card-a").classList.toggle("is-winner", result.winnerSide === "a");
  document.getElementById("card-b").classList.toggle("is-winner", result.winnerSide === "b");
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
    const result = await fakeFight(fighterA, fighterB);
    renderResult(fighterA, fighterB, result);
    showView("result");
  } catch (err) {
    document.getElementById("error-text").textContent = err.message;
    showView("error");
  }
});

// "New fight" / "Try again" buttons return to the form.
document.addEventListener("click", (event) => {
  if (event.target.closest("[data-action='new-fight']")) {
    showView("form");
    inputA.focus();
  }
});

showView("form");
