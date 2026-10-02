import { normalize, hashAnswer, decrypt } from "./crypto.js";

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const state = { logs: [], questions: [], key: null, results: null, reviewUnlocked: false };

// ---------- Data loading ----------
async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

async function init() {
  try {
    [state.logs, state.questions, state.key] = await Promise.all([
      loadJSON("assets/data/logs.json"),
      loadJSON("assets/data/questions.json"),
      loadJSON("assets/data/answers.json"),
    ]);
  } catch (err) {
    $("logBody").innerHTML = `<tr><td colspan="6" class="empty">Could not load data (${esc(err.message)}). Serve this folder over HTTP (GitHub Pages or <code>python -m http.server</code>); opening the file directly will not work.</td></tr>`;
    return;
  }
  if (!crypto?.subtle) {
    $("quiz").innerHTML = `<p class="empty">Answer checking needs a secure context (https:// or localhost).</p>`;
    return;
  }
  renderStats();
  buildFilters();
  renderLogs();
  renderQuiz();
  bindEvents();
}

// ---------- Dashboard ----------
function renderStats() {
  const L = state.logs;
  $("sTotal").textContent = L.length;
  $("sAttack").textContent = L.filter((l) => l.category !== "Benign").length;
  $("sCrit").textContent = L.filter((l) => l.severity === "Critical").length;
  $("sCats").textContent = new Set(L.filter((l) => l.category !== "Benign").map((l) => l.category)).size;
}

function buildFilters() {
  const cats = [...new Set(state.logs.map((l) => l.category))].sort();
  for (const c of cats) {
    const o = document.createElement("option");
    o.textContent = c;
    $("catFilter").appendChild(o);
  }
}

function renderLogs() {
  const q = normalize($("search").value);
  const cat = $("catFilter").value;
  const sev = $("sevFilter").value;
  const rows = state.logs.filter(
    (l) =>
      (!cat || l.category === cat) &&
      (!sev || l.severity === sev) &&
      (!q || normalize(Object.values(l).join(" ")).includes(q))
  );
  $("logCount").textContent = `${rows.length} of ${state.logs.length} events`;
  $("logBody").innerHTML = rows.length
    ? rows
        .map(
          (l) => `<tr>
        <td>${l.id}</td><td>${esc(l.timestamp)}</td><td>${esc(l.source)}</td>
        <td><span class="sev ${l.severity.toLowerCase()}">${esc(l.severity)}</span></td>
        <td class="cat ${l.category === "Benign" ? "benign" : ""}">${esc(l.category)}</td>
        <td class="msg">${esc(l.event)}</td></tr>`
        )
        .join("")
    : `<tr><td colspan="6" class="empty">No events match these filters. Clear the search or choose another category.</td></tr>`;
}

// ---------- Quiz ----------
function renderQuiz() {
  $("quiz").innerHTML = state.questions
    .map(
      (x, i) => `
    <div class="q" id="q${x.id}">
      <label for="in${x.id}"><b>${i + 1}.</b>${esc(x.question)}</label>
      <input type="text" id="in${x.id}" autocomplete="off" spellcheck="false" placeholder="Your answer">
      <div class="fb"><span class="verdict"></span> <span class="detail"></span></div>
    </div>`
    )
    .join("");
}

async function checkAnswers() {
  const { salt } = state.key;
  const results = [];
  for (const q of state.questions) {
    const keyQ = state.key.questions.find((k) => k.id === q.id);
    const given = $(`in${q.id}`).value;
    const h = await hashAnswer(given, salt);
    const idx = keyQ.hashes.indexOf(h);
    const ok = idx !== -1;
    const explanation = ok ? await decrypt(keyQ.byAnswer[idx], given, salt) : null;
    results.push({ id: q.id, question: q.question, given, ok, explanation, correctAnswer: ok ? given.trim() : null });
  }
  state.results = results;
  paintResults();
  $("dlResults").disabled = false;
  $("review").hidden = results.every((r) => r.ok);
  $("score").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function paintResults() {
  const results = state.results;
  const score = results.filter((r) => r.ok).length;
  const pct = Math.round((score / results.length) * 100);

  for (const r of results) {
    const el = $(`q${r.id}`);
    el.classList.remove("correct", "wrong");
    el.classList.add(r.ok ? "correct" : "wrong");
    el.querySelector(".verdict").textContent = r.ok ? "Correct." : r.given.trim() ? "Incorrect." : "No answer.";
    const detail = el.querySelector(".detail");
    if (r.ok) {
      detail.textContent = r.explanation;
    } else if (r.correctAnswer) {
      detail.innerHTML = `Correct answer: <span class="ans">${esc(r.correctAnswer)}</span>. ${esc(r.explanation)}`;
    } else {
      detail.textContent = "Re-check the logs. Your instructor can share a review code to unlock the explanation.";
    }
  }

  $("score").hidden = false;
  $("scoreNum").textContent = `${score} / ${results.length}`;
  $("scoreText").textContent =
    pct === 100
      ? "Perfect. Every indicator identified."
      : pct >= 70
      ? `${pct}% — solid analysis. Review the explanations below.`
      : `${pct}% — review the explanations and re-check the logs.`;
  $("scoreBar").style.width = pct + "%";
}

async function unlockReview() {
  const code = $("reviewCode").value;
  const { salt } = state.key;
  if ((await hashAnswer(code, salt)) !== state.key.reviewHash) {
    $("reviewMsg").textContent = "That review code is not valid.";
    return;
  }
  for (const r of state.results) {
    if (r.ok) continue;
    const keyQ = state.key.questions.find((k) => k.id === r.id);
    const plain = await decrypt(keyQ.byReview, code, salt);
    if (plain) {
      const { answer, explanation } = JSON.parse(plain);
      r.correctAnswer = answer;
      r.explanation = explanation;
    }
  }
  state.reviewUnlocked = true;
  $("reviewMsg").textContent = "Explanations unlocked.";
  paintResults();
}

function resetQuiz() {
  for (const q of state.questions) {
    $(`in${q.id}`).value = "";
    $(`q${q.id}`).classList.remove("correct", "wrong");
  }
  state.results = null;
  state.reviewUnlocked = false;
  $("score").hidden = true;
  $("review").hidden = true;
  $("reviewCode").value = "";
  $("reviewMsg").textContent = "";
  $("dlResults").disabled = true;
}

// ---------- Downloads ----------
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadLogs() {
  const cell = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const header = ["id", "timestamp", "source", "severity", "category", "event"];
  const csv = [header.join(","), ...state.logs.map((l) => header.map((k) => cell(l[k])).join(","))].join("\n");
  download("soccyber-logs.csv", csv, "text/csv");
}

function downloadResults() {
  if (!state.results) return;
  const score = state.results.filter((r) => r.ok).length;
  const lines = [
    "SocCyber-by Reyvem — Log Analysis Challenge results",
    `Generated: ${new Date().toISOString()}`,
    `Score: ${score} / ${state.results.length}`,
    "",
  ];
  state.results.forEach((r, i) => {
    lines.push(`Q${i + 1}. ${r.question}`);
    lines.push(`  Your answer:    ${r.given.trim() || "(blank)"}`);
    lines.push(`  Result:         ${r.ok ? "Correct" : "Incorrect"}`);
    if (r.correctAnswer && !r.ok) lines.push(`  Correct answer: ${r.correctAnswer}`);
    if (r.explanation) lines.push(`  Explanation:    ${r.explanation}`);
    lines.push("");
  });
  download("soccyber-results.txt", lines.join("\n"), "text/plain");
}

// ---------- Events ----------
function bindEvents() {
  ["search", "catFilter", "sevFilter"].forEach((id) => $(id).addEventListener("input", renderLogs));
  $("submit").addEventListener("click", checkAnswers);
  $("reset").addEventListener("click", resetQuiz);
  $("dlLogs").addEventListener("click", downloadLogs);
  $("dlResults").addEventListener("click", downloadResults);
  $("unlock").addEventListener("click", unlockReview);
  $("quiz").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      checkAnswers();
    }
  });
}

init();
