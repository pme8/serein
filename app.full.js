const STORAGE_KEY = "serein_state_v2";
const TOKEN_KEY = "serein_token";

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
  posts: [],
  dark: true,
  notifTime: "20:00",
};

let state = loadState();
let currentUser = null;
let deferredInstallPrompt = null;
let breathTimer = null;
let backendAvailable = true;

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
const authStatus = qs("#authStatus");
const authFeedback = qs("#authFeedback");

init();

async function init() {
  renderFearChips();
  initNav();
  bindEvents();
  hydrateUI();
  backendAvailable = await checkBackend();
  await initAuth();
  initPwa();
  renderAll();
}

async function checkBackend() {
  try {
    const res = await fetch("/health", { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

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

function token() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token()) headers.Authorization = `Bearer ${token()}`;

  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Erreur serveur");
  return data;
}

function initPwa() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    qs("#installPwaBtn").classList.remove("hidden");
  });

  qs("#installPwaBtn").addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    qs("#installPwaBtn").classList.add("hidden");
  });
}

async function initAuth() {
  if (!backendAvailable) {
    currentUser = null;
    renderAuthStatus();
    return;
  }

  const tk = token();
  if (!tk) {
    renderAuthStatus();
    return;
  }

  try {
    const me = await api("/api/me");
    currentUser = me.user;
    await pullCloudData();
  } catch {
    localStorage.removeItem(TOKEN_KEY);
    currentUser = null;
  }
  renderAuthStatus();
}

function renderAuthStatus() {
  if (!backendAvailable) {
    if (authStatus) authStatus.textContent = "";
    qs("#authBtn").classList.add("hidden");
    qs("#syncBtn").classList.add("hidden");
    return;
  }

  qs("#authBtn").classList.remove("hidden");
  if (currentUser) {
    if (authStatus) authStatus.textContent = `Connecté: ${currentUser.name}`;
    qs("#authBtn").textContent = "Déconnexion";
    qs("#syncBtn").classList.remove("hidden");
  } else {
    if (authStatus) authStatus.textContent = "Mode local";
    qs("#authBtn").textContent = "Connexion";
    qs("#syncBtn").classList.add("hidden");
  }
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

  qs("#diagnosticForm").addEventListener("submit", async (e) => {
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
    await pushCloudProfile();
  });

  qs("#completeStepBtn").addEventListener("click", async () => {
    const step = Math.min(state.exposureLevel + 1, 4);
    if (!state.completedSteps.includes(step)) state.completedSteps.push(step);
    state.exposureLevel = step;
    state.wins.unshift(`Étape ${step} validée dans le plan d’exposition.`);
    saveState();
    renderTherapy();
    renderProgress();
    refreshMessage();
    await pushCloudProfile();
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

  qs("#authBtn").addEventListener("click", () => {
    if (currentUser) {
      logout();
      return;
    }
    authFeedback.textContent = "";
    qs("#authDialog").showModal();
  });

  qs("#closeAuthBtn").addEventListener("click", () => qs("#authDialog").close());

  qs("#authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    await login();
  });

  qs("#registerBtn").addEventListener("click", async () => {
    await register();
  });

  qs("#syncBtn").addEventListener("click", async () => {
    await pushCloudProfile();
    authFeedback.textContent = "Synchronisation effectuée.";
  });

  qs("#saveNotifBtn").addEventListener("click", async () => {
    const notifTime = qs("#notifTime").value;
    state.notifTime = notifTime;
    saveState();
    scheduleBrowserReminder(notifTime);

    if (currentUser) {
      const date = nextReminderIso(notifTime);
      await api("/api/notifications", {
        method: "POST",
        body: JSON.stringify({
          title: "Serein - rappel douceur",
          body: "2 minutes de respiration peuvent changer ta soirée.",
          at: date,
        }),
      }).catch(() => {});
    }
  });
}

async function register() {
  const name = qs("#authName").value.trim();
  const email = qs("#authEmail").value.trim();
  const password = qs("#authPassword").value;

  try {
    const data = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
    localStorage.setItem(TOKEN_KEY, data.token);
    currentUser = data.user;
    qs("#authDialog").close();
    renderAuthStatus();
    await pushCloudProfile();
    await pullCloudData();
  } catch (err) {
    authFeedback.textContent = err.message;
  }
}

async function login() {
  const email = qs("#authEmail").value.trim();
  const password = qs("#authPassword").value;

  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    localStorage.setItem(TOKEN_KEY, data.token);
    currentUser = data.user;
    qs("#authDialog").close();
    renderAuthStatus();
    await pullCloudData();
    renderAll();
  } catch (err) {
    authFeedback.textContent = err.message;
  }
}

function logout() {
  currentUser = null;
  localStorage.removeItem(TOKEN_KEY);
  renderAuthStatus();
}

async function pullCloudData() {
  if (!currentUser) return;

  const [{ appState }, { posts }, { entries }] = await Promise.all([
    api("/api/profile").catch(() => ({ appState: null })),
    api("/api/posts").catch(() => ({ posts: [] })),
    api("/api/journal").catch(() => ({ entries: [] })),
  ]);

  if (appState) {
    state = { ...state, ...appState };
    saveState();
    hydrateUI();
    renderFearChips();
  }

  if (posts.length) {
    state.posts = posts;
  }

  if (entries.length) {
    state.journal = entries;
  }
}

async function pushCloudProfile() {
  if (!currentUser) return;

  await api("/api/profile", {
    method: "PUT",
    body: JSON.stringify({ appState: { ...state, journal: [], posts: [] } }),
  }).catch(() => {});
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
  qs("#notifTime").value = state.notifTime || "20:00";
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
    { test: /(toujours|jamais|forcément)/i, replace: "Parfois, c’est difficile. Je peux avancer pas à pas avec flexibilité." },
    { test: /(nul|incapable|raté|honte)/i, replace: "Je traverse une difficulté, mais ma valeur reste intacte et je peux apprendre." },
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
  messageBox.textContent = pool[Math.floor(Math.random() * pool.length)] + stressBoost;
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

async function renderCommunity() {
  const selected = state.fears.length ? state.fears : ["Échec", "Rejet"];
  groupsList.innerHTML = "";

  selected.forEach((fear) => {
    const div = document.createElement("div");
    div.className = "feed-item";
    div.innerHTML = `<strong>Groupe de soutien — ${fear}</strong><br><span class="muted">Ici vous pouvez parler librement et vous détendre.</span>`;
    groupsList.appendChild(div);
  });

  if (currentUser) {
    try {
      const { posts } = await api("/api/posts");
      state.posts = posts;
      saveState();
    } catch {
      // mode offline
    }
  }

  postFeed.innerHTML = "";
  const source = state.posts.length ? state.posts : [
    { text: "Bienvenue dans la communauté Serein 💙", user: "Serein", createdAt: new Date().toISOString() },
  ];

  source.slice(0, 30).forEach((p) => {
    const item = document.createElement("div");
    item.className = "feed-item";
    item.innerHTML = `<strong>${escapeHTML(p.user || "Membre")}</strong><br>${escapeHTML(p.text)}<br><small class="muted">${new Date(p.createdAt || p.date).toLocaleString("fr-FR")}</small>`;
    postFeed.appendChild(item);
  });
}

async function addCommunityPost() {
  const input = qs("#communityPost");
  const text = input.value.trim();
  if (!text) return;

  if (!backendAvailable) {
    state.posts.unshift({
      text,
      user: "Anonyme",
      createdAt: new Date().toISOString(),
    });
    input.value = "";
    saveState();
    await renderCommunity();
    return;
  }

  if (!currentUser) {
    authFeedback.textContent = "Connecte-toi pour publier dans la vraie communauté.";
    qs("#authDialog").showModal();
    return;
  }

  try {
    await api("/api/posts", {
      method: "POST",
      body: JSON.stringify({ text, fears: state.fears }),
    });
    input.value = "";
    await renderCommunity();
  } catch (err) {
    authFeedback.textContent = err.message;
  }
}

async function addJournalEntry(e) {
  e.preventDefault();
  const mood = qs("#mood").value;
  const intensity = Number(qs("#intensity").value) || 5;
  const trigger = qs("#trigger").value.trim();
  const win = qs("#win").value.trim();

  const entry = { date: new Date().toISOString(), mood, intensity, trigger, win };
  state.journal.unshift(entry);

  if (win) state.wins.unshift(`Victoire: ${win}`);
  if (state.journal.length >= 3) {
    const avg = average(state.journal.slice(0, 3).map((x) => x.intensity));
    if (avg <= 4) state.wins.unshift("Stabilité émotionnelle en amélioration sur 3 jours 🎉");
  }

  saveState();
  e.target.reset();
  qs("#intensity").value = 5;

  renderJournal();
  renderProgress();
  renderPace();

  if (currentUser) {
    await api("/api/journal", {
      method: "POST",
      body: JSON.stringify({ mood, intensity, trigger, win }),
    }).catch(() => {});
  }
}

function renderJournal() {
  journalEntries.innerHTML = "";
  const entries = state.journal.slice(0, 15);

  entries.forEach((j) => {
    const item = document.createElement("div");
    item.className = "feed-item";
    item.innerHTML = `
      <strong>${escapeHTML(j.mood)}</strong> (${j.intensity}/10)
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
  return `Sur les 7 dernières entrées, l’intensité anxieuse est ${trend} (${avgIntensity.toFixed(1)}/10). ${topTrigger ? `Déclencheur récurrent: ${topTrigger}. ` : ""}Suggestion: maintenir respiration quotidienne + une micro-exposition réaliste par jour.`;
}

function renderPace() {
  const stress = state.stress || 5;
  const fearLoad = state.fears.length;
  const score = Math.max(0, Math.min(100, 100 - stress * 8 - fearLoad * 4 + state.exposureLevel * 6));
  paceBar.style.width = `${score}%`;

  if (score < 35) paceText.textContent = "Rythme très doux: récupération d’abord, micro-pas ensuite.";
  else if (score < 65) paceText.textContent = "Rythme progressif: 1 défi léger par jour + récupération.";
  else paceText.textContent = "Rythme solide: consolidation et montée graduelle.";
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
  scheduleBrowserReminder(state.notifTime || "20:00");
}

function scheduleBrowserReminder(timeHHMM) {
  if (!timeHHMM) return;
  if (!("Notification" in window)) return;

  const [h, m] = timeHHMM.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return;

  Notification.requestPermission().then((permission) => {
    if (permission !== "granted") return;
    const target = new Date();
    target.setHours(h, m, 0, 0);
    if (target.getTime() <= Date.now()) target.setDate(target.getDate() + 1);

    const delay = Math.min(target.getTime() - Date.now(), 2147483647);
    setTimeout(() => {
      new Notification("Serein", {
        body: "Pause douceur: 2 minutes de respiration et un mot bienveillant envers toi.",
      });
    }, delay);
  }).catch(() => {});
}

function nextReminderIso(timeHHMM) {
  const [h, m] = timeHHMM.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d.toISOString();
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
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
