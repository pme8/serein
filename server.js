const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "db.json");
const JWT_SECRET = process.env.SEREIN_JWT_SECRET || "serein_dev_secret_change_me";
const ENC_SECRET = process.env.SEREIN_ENC_SECRET || "serein_enc_secret_change_me";

app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname));

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});

function ensureDb() {
  if (!fs.existsSync(DB_PATH)) {
    const initial = { users: [], posts: [], notifications: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2), "utf8");
  }
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

function signToken(user) {
  return jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Token manquant" });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ error: "Token invalide" });
  }
}

function getUser(db, id) {
  return db.users.find((u) => u.id === id);
}

function encryptionKey() {
  return crypto.createHash("sha256").update(ENC_SECRET).digest();
}

function encryptText(plain) {
  if (!plain) return "";
  const iv = crypto.randomBytes(12);
  const key = encryptionKey();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decryptText(value) {
  if (!value) return "";
  const [ivHex, tagHex, encryptedHex] = value.split(":");
  if (!ivHex || !tagHex || !encryptedHex) return "";
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password || password.length < 6) {
    return res.status(400).json({ error: "Données invalides (mot de passe min 6 caractères)." });
  }

  const db = readDb();
  const normalizedEmail = String(email).trim().toLowerCase();
  if (db.users.some((u) => u.email === normalizedEmail)) {
    return res.status(409).json({ error: "Email déjà utilisé." });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id: crypto.randomUUID(),
    name: String(name).trim(),
    email: normalizedEmail,
    passwordHash,
    createdAt: new Date().toISOString(),
    appState: null,
    journal: [],
  };

  db.users.push(user);
  writeDb(db);

  const token = signToken(user);
  return res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Email et mot de passe requis." });

  const db = readDb();
  const user = db.users.find((u) => u.email === String(email).trim().toLowerCase());
  if (!user) return res.status(401).json({ error: "Identifiants invalides." });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Identifiants invalides." });

  const token = signToken(user);
  return res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

app.get("/api/me", auth, (req, res) => {
  const db = readDb();
  const user = getUser(db, req.userId);
  if (!user) return res.status(404).json({ error: "Utilisateur introuvable." });
  return res.json({ user: { id: user.id, name: user.name, email: user.email } });
});

app.get("/api/profile", auth, (req, res) => {
  const db = readDb();
  const user = getUser(db, req.userId);
  if (!user) return res.status(404).json({ error: "Utilisateur introuvable." });
  return res.json({ appState: user.appState || null });
});

app.put("/api/profile", auth, (req, res) => {
  const { appState } = req.body || {};
  const db = readDb();
  const user = getUser(db, req.userId);
  if (!user) return res.status(404).json({ error: "Utilisateur introuvable." });

  user.appState = appState || null;
  writeDb(db);
  return res.json({ ok: true });
});

app.get("/api/posts", (req, res) => {
  const db = readDb();
  const posts = [...db.posts]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 50);
  return res.json({ posts });
});

app.post("/api/posts", auth, (req, res) => {
  const { text, fears = [] } = req.body || {};
  if (!text || String(text).trim().length < 3) {
    return res.status(400).json({ error: "Message trop court." });
  }

  const db = readDb();
  const user = getUser(db, req.userId);
  if (!user) return res.status(404).json({ error: "Utilisateur introuvable." });

  const post = {
    id: crypto.randomUUID(),
    user: user.name,
    text: String(text).trim(),
    fears: Array.isArray(fears) ? fears.slice(0, 4) : [],
    createdAt: new Date().toISOString(),
  };

  db.posts.push(post);
  writeDb(db);
  return res.status(201).json({ post });
});

app.get("/api/journal", auth, (req, res) => {
  const db = readDb();
  const user = getUser(db, req.userId);
  if (!user) return res.status(404).json({ error: "Utilisateur introuvable." });

  const entries = (user.journal || []).map((j) => ({
    id: j.id,
    date: j.date,
    mood: j.mood,
    intensity: j.intensity,
    trigger: decryptText(j.triggerEnc),
    win: decryptText(j.winEnc),
  }));

  return res.json({ entries: entries.sort((a, b) => new Date(b.date) - new Date(a.date)) });
});

app.post("/api/journal", auth, (req, res) => {
  const { mood, intensity, trigger, win } = req.body || {};
  if (!mood || typeof intensity !== "number") {
    return res.status(400).json({ error: "Entrée invalide." });
  }

  const db = readDb();
  const user = getUser(db, req.userId);
  if (!user) return res.status(404).json({ error: "Utilisateur introuvable." });

  const entry = {
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    mood: String(mood),
    intensity: Math.max(1, Math.min(10, intensity)),
    triggerEnc: encryptText(String(trigger || "")),
    winEnc: encryptText(String(win || "")),
  };

  user.journal = user.journal || [];
  user.journal.unshift(entry);
  user.journal = user.journal.slice(0, 200);
  writeDb(db);

  return res.status(201).json({ ok: true });
});

app.get("/api/notifications", auth, (req, res) => {
  const db = readDb();
  const my = (db.notifications || []).filter((n) => n.userId === req.userId);
  return res.json({ notifications: my });
});

app.post("/api/notifications", auth, (req, res) => {
  const { title, body, at } = req.body || {};
  if (!title || !at) return res.status(400).json({ error: "Notification invalide." });

  const db = readDb();
  db.notifications = db.notifications || [];
  db.notifications.push({
    id: crypto.randomUUID(),
    userId: req.userId,
    title: String(title),
    body: String(body || ""),
    at: String(at),
    createdAt: new Date().toISOString(),
  });

  writeDb(db);
  return res.status(201).json({ ok: true });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Serein prêt: http://localhost:${PORT}`);
});