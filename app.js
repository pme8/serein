const STORAGE_KEY = "serein_state_v1";

const FEARS = [
  "Abandon",
  "Échec",
  "Rejet",
  "Jugement",
  "Solitude",
  "Perte de contrôle",
  "Conflit",
  "Maladie",
];

const fearOrigins = {
  Abandon: "Attachement et sécurité relationnelle",
  Échec: "Pression de performance et estime de soi",
  Rejet: "Besoin d’appartenance et validation externe",
  Jugement: "Hypervigilance sociale et perfectionnisme",
  Solitude: "Sensibilité au manque de connexion",
  "Perte de contrôle": "Intolérance à l’incertitude",
  Conflit: "Mémoire émotionnelle de tensions passées",
  Maladie: "Anticipation et inquiétude somatique",
};

const messagesByFear = {
  Abandon: [
    "Tu mérites des liens stables. Tu restes digne d’amour, même dans l’incertitude.",
    "Tu peux te soutenir toi-même pendant que les relations se clarifient.",
  ],
  Échec: [
    "Ton progrès vaut plus qu’un résultat parfait.",
    "Chaque tentative est une preuve de courage, pas une preuve d’insuffisance.",
  ],
  Rejet: [
    "Être authentique attire les bonnes personnes, même si tout le monde n’adhère pas.",
    "Un “non” n’efface pas ta valeur.",
  ],
  Jugement: [
    "Les autres pensent moins à toi que ton anxiété ne le prétend.",
    "Tu as le droit d’être imparfait·e et visible.",
  ],
};

const defaultState = {
  fears: [],
  stress: 5,
  trigger: "",
  profile: null,
  exposureLevel: 0,
  completedSteps: [],
  wins: [],
  journal: [],
  posts: [
    { text: "J’ai osé prendre la parole aujourd’hui. Petite victoire 💙", date: new Date().toISOString() },
    { text: "Rappel: respirer lentement m’aide vraiment dans le métro.", date: new Date().toISOString() },
  ],
  dark: true,
};

let state = loadState();

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(defaultState);
  try {
    return { ...structuredClone(defaultState), ...JSON.parse(raw) };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const qs = (s) => document.querySelector(s);
const qsa = (s) => Array.from(document.querySelectorAll(s));

const fearChips = qs("#fearChips");
const stressRange = qs("#stressRange");
const stressValue = qs("#stressValue");
const triggerInput = qs("#triggerInput");
const mapResult = qs("#mapResult");
const exposurePlan = qs("#exposurePlan");
const progressList = qs("#progressList");
const groupsList = qs("#groupsList");
const postFeed = qs("#postFeed");
const journalEntries = qs("#journalEntries");
const journalInsights = qs("#journalInsights");
const messageBox = qs("#messageBox");
const paceText = qs("#paceText");
const paceBar = qs("#paceBar");

init();

function init() {
  renderFearChips();
  initNav();
  bindEvents();
  hydrateUI();
  renderAll();
}

function initNav() {
  qsa(".nav-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      qsa(".nav-link").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const target = btn.dataset.target;
      qsa(".panel").forEach((p) => p.classList.remove("active"));
      qs(`#${target}`).classList.add("active");
    });
  });
}

function bindEvents() {
  stressRange.addEventListener("input", () => {
    stressValue.textContent = stressRange.value;
  });

  qs("#diagnosticForm").addEventListener("submit", (e) => {
    e.preventDefault();
    state.stress = Number(stressRange.value);
    state.trigger = triggerInput.value.trim();
    state.profile = buildProfile();
    saveState();
    renderProfile();
    renderPace();
    renderTherapy();
    renderCommunity();
    refreshMessage();
  });

  qs("#completeStepBtn").addEventListener("click", () => {
    const step = Math.min(state.exposureLevel + 1, 4);
    if (!state.completedSteps.includes(step)) state.completedSteps.push(step);
    state.exposureLevel = step;
    state.wins.unshift(`Étape ${step} validée dans le plan d’exposition.`);
    saveState();
    renderTherapy();
    renderProgress();
    refreshMessage();
  });

  qs("#reframeBtn").addEventListener("click", reframeThought);
  qs("#newMessageBtn").addEventListener("click", refreshMessage);
  qs("#postBtn").addEventListener("click", addCommunityPost);
  qs("#journalForm").addEventListener("submit", addJournalEntry);

  qs("#startBreathBtn").addEventListener("click", () => startBreathing(60));
  qs("#emergencyBreathBtn").addEventListener("click", () => startBreathing(60));

  qs("#emergencyBtn").addEventListener("click", () => qs("#emergencyDialog").showModal());
  qs("#closeEmergencyBtn").addEventListener("click", () => qs("#emergencyDialog").close());

  qs("#themeBtn").addEventListener("click", () => {
    state.dark = !state.dark;
    document.body.classList.toggle("light", !state.dark);
    saveState();
  });
}

function renderFearChips() {
  fearChips.innerHTML = "";
  FEARS.forEach((fear) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = fear;
    if (state.fears.includes(fear)) b.classList.add("active");
    b.addEventListener("click", () => {
      if (state.fears.includes(fear)) {
        state.fears = state.fears.filter((f) => f !== fear);
      } else {
        state.fears.push(fear);
      }
      b.classList.toggle("active");
      saveState();
      renderPace();
    });
    fearChips.appendChild(b);
  });
}

function hydrateUI() {
  stressRange.value = state.stress;
  stressValue.textContent = String(state.stress);
  triggerInput.value = state.trigger;
  document.body.classList.toggle("light", !state.dark);
}

function buildProfile() {
  const fears = state.fears.length ? state.fears : ["Échec"];
  const dominant = fears[0];
  const intensity = Math.min(10, Math.round((state.stress + fears.length) / 1.2));

  return {
    dominant,
    fears,
    origins: fears.map((f) => ({ fear: f, origin: fearOrigins[f] || "Origine mixte" })),
    intensity,
    recommendation: intensity >= 8
      ? "Rythme très doux recommandé: micro-expositions + respiration quotidienne."
      : intensity >= 5
      ? "Rythme progressif recommandé: alternance exposition et récupération."
      : "Rythme confiant recommandé: consolidation et maintien des acquis.",
  };
}

function renderProfile() {
  if (!state.profile) return;
  const p = state.profile;
  mapResult.classList.remove("hidden");

  mapResult.innerHTML = `
    <h3>Cartographie émotionnelle personnalisée</h3>
    <p><strong>Peur dominante:</strong> ${p.dominant}</p>
    <p><strong>Intensité anxieuse estimée:</strong> ${p.intensity}/10</p>
    <p><strong>Déclencheur noté:</strong> ${state.trigger || "Non renseigné"}</p>
    <ul>
      ${p.origins.map((o) => `<li><strong>${o.fear}</strong> → ${o.origin}</li>`).join("")}
    </ul>
    <p>🧭 ${p.recommendation}</p>
  `;
}

function getExposureSteps() {
  const fear = state.profile?.dominant || state.fears[0] || "Échec";
  const base = {
    Abandon: [
      "Envoyer un message simple à une personne de confiance.",
      "Demander un moment d’échange de 10 minutes.",
      "Exprimer un besoin émotionnel concret.",
      "Accepter un délai de réponse sans catastropher.",
    ],
    Échec: [
      "Lancer une tâche 10 minutes sans viser la perfection.",
      "Publier/partager une version imparfaite.",
      "Demander un feedback ciblé.",
      "Tenter un défi avec risque modéré.",
    ],
    Rejet: [
      "Dire une opinion personnelle à faible enjeu.",
      "Faire une petite demande (aide/information).",
      "Proposer une idée en groupe.",
      "Accepter un refus sans auto-jugement.",
    ],
    Jugement: [
      "Prendre la parole 20 secondes.",
      "Poser une question en public.",
      "Exprimer une erreur sans se justifier.",
      "Animer une mini-présentation.",
    ],
  };

  return base[fear] || [
    "Identifier une micro-situation anxiogène.",
    "S’y exposer 5 minutes avec respiration.",
    "Rester présent·e malgré l’inconfort.",
    "Clore par une note de compassion envers soi.",
  ];
}

function renderTherapy() {
  const steps = getExposureSteps();
  exposurePlan.innerHTML = "";

  steps.forEach((s, i) => {
    const index = i + 1;
    const done = state.completedSteps.includes(index);
    const el = document.createElement("div");
    el.className = "feed-item";
    el.innerHTML = `<strong>Étape ${index}</strong> — ${s} ${done ? "✅" : ""}`;
    exposurePlan.appendChild(el);
  });
}

let breathTimer = null;
function startBreathing(durationSec = 60) {
  const circle = qs("#breathCircle");
  const instruction = qs("#breathInstruction");

  clearInterval(breathTimer);
  let t = durationSec;
  let phase = 0;
  const phases = [
    { name: "Inspire", sec: 4, expand: true },
    { name: "Bloque", sec: 4, expand: false },
    { name: "Expire", sec: 6, expand: false },
  ];
  let phaseLeft = phases[0].sec;

  breathTimer = setInterval(() => {
    if (t <= 0) {
      clearInterval(breathTimer);
      instruction.textContent = "Exercice terminé. Bien joué 💙";
      circle.textContent = "Fini";
      circle.classList.remove("expand");
      state.wins.unshift("1 minute de respiration guidée complétée.");
      saveState();
      renderProgress();
      return;
    }

    const p = phases[phase];
    instruction.textContent = `${p.name} — ${phaseLeft}s`;
    circle.textContent = p.name;
    circle.classList.toggle("expand", p.expand);

    phaseLeft -= 1;
    t -= 1;
    if (phaseLeft < 0) {
      phase = (phase + 1) % phases.length;
      phaseLeft = phases[phase].sec;
    }
  }, 1000);
}

function reframeThought() {
  const txt = qs("#negativeThought").value.trim();
  const out = qs("#reframeOutput");
  if (!txt) return;

  const patterns = [
    {
      test: /(toujours|jamais|forcément)/i,
      replace: "Parfois, c’est difficile. Je peux avancer pas à pas avec flexibilité.",
    },
    {
      test: /(nul|incapable|raté|honte)/i,
      replace: "Je traverse une difficulté, mais ma valeur reste intacte et je peux apprendre.",
    },
  ];

  let reframed = "Je remarque cette pensée anxieuse. Je choisis une version plus juste et aidante.";
  for (const p of patterns) {
    if (p.test.test(txt)) {
      reframed = p.replace;
      break;
    }
  }

  out.classList.remove("hidden");
  out.innerHTML = `<strong>Version reprogrammée :</strong><br>${reframed}`;
  state.wins.unshift("Pensée négative reformulée avec succès.");
  saveState();
  renderProgress();
}

function refreshMessage() {
  const dominant = state.profile?.dominant || state.fears[0] || "Échec";
  const pool = messagesByFear[dominant] || messagesByFear["Échec"];

  const stressBoost = state.stress >= 8
    ? " Respire lentement: ta sécurité est ici et maintenant."
    : " Continue avec douceur, tu avances réellement.";

  const msg = pool[Math.floor(Math.random() * pool.length)] + stressBoost;
  messageBox.textContent = msg;
}

function renderProgress() {
  progressList.innerHTML = "";
  const items = [...state.wins].slice(0, 8);
  if (!items.length) {
    progressList.innerHTML = "<li>Aucun progrès enregistré pour le moment.</li>";
    return;
  }
  items.forEach((w) => {
    const li = document.createElement("li");
    li.textContent = w;
    progressList.appendChild(li);
  });
}

function renderCommunity() {
  const selected = state.fears.length ? state.fears : ["Échec", "Rejet"];
  groupsList.innerHTML = "";

  selected.forEach((fear) => {
    const div = document.createElement("div");
    div.className = "feed-item";
    div.innerHTML = `<strong>Groupe ${fear}</strong><br><span class="muted">Canal anonyme + parrainage pair-à-pair disponible</span>`;
    groupsList.appendChild(div);
  });

  postFeed.innerHTML = "";
  state.posts.slice(0, 20).forEach((p) => {
    const item = document.createElement("div");
    item.className = "feed-item";
    item.innerHTML = `${escapeHTML(p.text)}<br><small class="muted">${new Date(p.date).toLocaleString("fr-FR")}</small>`;
    postFeed.appendChild(item);
  });
}

function addCommunityPost() {
  const input = qs("#communityPost");
  const text = input.value.trim();
  if (!text) return;
  state.posts.unshift({ text, date: new Date().toISOString() });
  input.value = "";
  saveState();
  renderCommunity();
}

function addJournalEntry(e) {
  e.preventDefault();
  const mood = qs("#mood").value;
  const intensity = Number(qs("#intensity").value) || 5;
  const trigger = qs("#trigger").value.trim();
  const win = qs("#win").value.trim();

  const entry = {
    date: new Date().toISOString(),
    mood,
    intensity,
    trigger,
    win,
  };
  state.journal.unshift(entry);

  if (win) state.wins.unshift(`Victoire: ${win}`);
  if (state.journal.length >= 3) {
    const avg = average(state.journal.slice(0, 3).map((x) => x.intensity));
    if (avg <= 4) {
      state.wins.unshift("Stabilité émotionnelle en amélioration sur 3 jours 🎉");
    }
  }

  saveState();
  e.target.reset();
  qs("#intensity").value = 5;

  renderJournal();
  renderProgress();
  renderPace();
}

function renderJournal() {
  journalEntries.innerHTML = "";
  const entries = state.journal.slice(0, 15);

  entries.forEach((j) => {
    const item = document.createElement("div");
    item.className = "feed-item";
    item.innerHTML = `
      <strong>${j.mood}</strong> (${j.intensity}/10)
      <br><span class="muted">Déclencheur: ${escapeHTML(j.trigger || "—")}</span>
      <br><span>Victoire: ${escapeHTML(j.win || "—")}</span>
      <br><small class="muted">${new Date(j.date).toLocaleString("fr-FR")}</small>
    `;
    journalEntries.appendChild(item);
  });

  if (!entries.length) {
    journalEntries.innerHTML = '<div class="feed-item">Aucune entrée pour le moment.</div>';
  }

  journalInsights.textContent = buildInsights();
}

function buildInsights() {
  if (!state.journal.length) return "Ajoute des entrées pour générer une analyse.";

  const topTrigger = mostFrequent(state.journal.map((j) => j.trigger).filter(Boolean));
  const avgIntensity = average(state.journal.slice(0, 7).map((j) => j.intensity));
  const trend = avgIntensity <= 4 ? "en baisse" : avgIntensity <= 6 ? "modérée" : "élevée";

  return `Sur les 7 dernières entrées, l’intensité anxieuse est ${trend} (${avgIntensity.toFixed(1)}/10). ` +
    `${topTrigger ? `Déclencheur récurrent: ${topTrigger}. ` : ""}` +
    "Suggestion: maintenir respiration quotidienne + une micro-exposition réaliste par jour.";
}

function renderPace() {
  const stress = state.stress || 5;
  const fearLoad = state.fears.length;
  const score = Math.max(0, Math.min(100, 100 - stress * 8 - fearLoad * 4 + state.exposureLevel * 6));
  paceBar.style.width = `${score}%`;

  if (score < 35) {
    paceText.textContent = "Rythme très doux: récupération d’abord, micro-pas ensuite.";
  } else if (score < 65) {
    paceText.textContent = "Rythme progressif: 1 défi léger par jour + récupération.";
  } else {
    paceText.textContent = "Rythme solide: consolidation et montée graduelle.";
  }
}

function renderAll() {
  if (!state.profile && state.fears.length) state.profile = buildProfile();
  renderProfile();
  renderPace();
  renderTherapy();
  renderProgress();
  renderCommunity();
  renderJournal();
  refreshMessage();
}

function average(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function mostFrequent(arr) {
  if (!arr.length) return "";
  const freq = arr.reduce((m, v) => {
    m[v] = (m[v] || 0) + 1;
    return m;
  }, {});
  return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
}

function escapeHTML(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
