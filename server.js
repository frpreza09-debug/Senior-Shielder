/**
 * ╔══════════════════════════════════════════════════════════════╗
 *   SENIORSHIELD — API SERVER
 *   Node.js + Express + WebSocket (ws)
 *
 *   HTTP  → PORT      (default 3000)
 *   WS    → WS_PORT   (default 3001)
 * ╚══════════════════════════════════════════════════════════════╝
 */

require("dotenv").config();
const express   = require("express");
const cors      = require("cors");
const WebSocket = require("ws");
const crypto    = require("crypto");
const path      = require("path");

const app = express();

/* ──────────────────────────────────────
   CONFIG
────────────────────────────────────── */
const HTTP_PORT  = parseInt(process.env.PORT)     || 3000;
const WS_PORT    = parseInt(process.env.WS_PORT)  || 3001;
const API_KEY    = process.env.API_KEY             || "seniorshield-secret-key";
const ALLOWED_IP = process.env.ALLOWED_IP          || null; // optional IP whitelist

/* ──────────────────────────────────────
   MIDDLEWARE
────────────────────────────────────── */
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "1mb" }));

// Serve dashboard dari folder public/
app.use(express.static(path.join(__dirname, "public")));

// Logging
app.use((req, _res, next) => {
  console.log(`[HTTP] ${new Date().toLocaleTimeString()} ${req.method} ${req.path}`);
  next();
});

/* ──────────────────────────────────────
   AUTH MIDDLEWARE
────────────────────────────────────── */
function requireAuth(req, res, next) {
  if (!API_KEY) return next();

  // IP whitelist check
  if (ALLOWED_IP) {
    const clientIP = req.ip || req.socket.remoteAddress || "";
    if (!clientIP.includes(ALLOWED_IP)) {
      return res.status(403).json({ error: "IP tidak diizinkan: " + clientIP });
    }
  }

  const auth = req.headers["authorization"] || "";
  const key  = req.headers["x-api-key"]     || "";
  const provided = auth.replace(/^Bearer\s+/i, "") || key;

  if (provided !== API_KEY) {
    return res.status(401).json({
      error: "Unauthorized — API key tidak valid",
      hint : "Sertakan header: Authorization: Bearer YOUR_API_KEY"
    });
  }
  next();
}

/* ──────────────────────────────────────
   DETECTION ENGINE
────────────────────────────────────── */
const PHISHING_KEYWORDS = [
  "hadiah", "klik link", "verifikasi akun", "akun diblokir",
  "transfer sekarang", "menang undian", "gratis saldo",
  "bank", "pin", "otp", "kode verifikasi", "whatsapp support",
  "login dari perangkat baru", "reset password", "data anda",
  "segera", "urgent", "konfirmasi", "perangkat baru", "terkena hack",
  "kode rahasia", "jangan beritahu", "transfer dana", "rekening"
];

const SUSPICIOUS_DOMAINS = [
  ".xyz", ".top", ".click", ".gq", ".ru",
  ".tk", ".cf", ".ml", ".ga", ".pw", ".cc"
];

/**
 * Analisis teks pesan dan kembalikan skor risiko
 * @param {string} body - isi pesan
 * @returns {{ score, riskLevel, status, foundKeywords }}
 */
function analyzeMessage(body) {
  const t = (body || "").toLowerCase();
  let score = 0;
  const foundKeywords = [];

  // Cek keyword berbahaya (+15 tiap keyword)
  PHISHING_KEYWORDS.forEach(kw => {
    if (t.includes(kw)) { score += 15; foundKeywords.push(kw); }
  });

  // Cek domain mencurigakan (+25 tiap domain)
  SUSPICIOUS_DOMAINS.forEach(d => {
    if (t.includes(d)) { score += 25; foundKeywords.push(d); }
  });

  // Ada link HTTP/HTTPS (+20)
  if (t.match(/https?:\/\//)) score += 20;

  // Ada kode OTP 4-6 digit (+30 jika ada "otp", +10 jika tidak)
  if (t.match(/\d{4,6}/) && t.includes("otp")) score += 30;
  else if (t.match(/\d{4,6}/)) score += 10;

  // Tentukan level risiko
  let riskLevel, status;
  if (score >= 60) {
    riskLevel = "high";
    status    = "HIGH RISK — Kemungkinan Phishing / Hack WA!";
  } else if (score >= 30) {
    riskLevel = "medium";
    status    = "MEDIUM RISK — Perlu waspada.";
  } else {
    riskLevel = "low";
    status    = "LOW RISK — Pesan aman.";
  }

  return {
    score,
    riskLevel,
    status,
    foundKeywords: [...new Set(foundKeywords)]
  };
}

/* ──────────────────────────────────────
   IN-MEMORY DATABASE
   (ganti dengan MongoDB/SQLite untuk production)
────────────────────────────────────── */
let messages = [];
let stats    = { high: 0, medium: 0, low: 0, total: 0 };

const MAX_MESSAGES = 500; // rolling buffer

function storeMessage(msg) {
  messages.push(msg);
  if (messages.length > MAX_MESSAGES) messages.shift();
  stats.total++;
  stats[msg.riskLevel]++;
}

/* ──────────────────────────────────────
   WEBSOCKET SERVER
────────────────────────────────────── */
const wss     = new WebSocket.Server({ port: WS_PORT });
const clients = new Set();

wss.on("connection", (ws, req) => {
  // Validasi token dari query string: ws://host:3001?token=KEY
  const urlParams = new URL(req.url, "ws://localhost").searchParams;
  const token     = urlParams.get("token") || "";

  if (API_KEY && token !== API_KEY) {
    ws.send(JSON.stringify({ error: "Unauthorized" }));
    ws.close(1008, "Invalid token");
    console.log("[WS] Koneksi ditolak — token tidak valid");
    return;
  }

  console.log(`[WS] Klien terhubung: ${req.socket.remoteAddress}`);
  clients.add(ws);

  // Kirim 20 pesan terbaru ke klien baru
  const recent = messages.slice(-20);
  if (recent.length > 0) {
    ws.send(JSON.stringify(recent));
  }

  ws.on("close", () => {
    clients.delete(ws);
    console.log("[WS] Klien terputus");
  });

  ws.on("error", err => console.error("[WS] Error:", err.message));
});

/**
 * Broadcast data ke semua klien WebSocket yang terhubung
 */
function broadcast(data) {
  const payload = JSON.stringify(Array.isArray(data) ? data : [data]);
  let sent = 0;
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
      sent++;
    }
  });
  return sent;
}

/* ──────────────────────────────────────
   ROUTES
────────────────────────────────────── */

/** GET /api/status — public health check */
app.get("/api/status", (req, res) => {
  res.json({
    status    : "online",
    version   : "1.0.0",
    uptime    : process.uptime().toFixed(1) + "s",
    messages  : messages.length,
    wsClients : clients.size,
    timestamp : new Date().toISOString()
  });
});

/** GET /api/stats — statistik deteksi */
app.get("/api/stats", requireAuth, (req, res) => {
  res.json({ ...stats, wsClients: clients.size });
});

/**
 * POST /api/sms/incoming
 * ← Endpoint utama: terima SMS baru dari Android
 *
 * Body:
 * {
 *   "sender"    : "+6281234567890",
 *   "body"      : "isi pesan SMS",
 *   "timestamp" : "2025-01-01T10:00:00Z"  (opsional)
 * }
 */
app.post("/api/sms/incoming", requireAuth, (req, res) => {
  const { sender, body, timestamp } = req.body;

  if (!sender || !body) {
    return res.status(400).json({
      error: "Field 'sender' dan 'body' wajib ada",
      example: { sender: "+6281234567890", body: "isi pesan" }
    });
  }

  const analysis = analyzeMessage(body);

  const msg = {
    id         : crypto.randomUUID(),
    sender     : String(sender).trim(),
    body       : String(body).trim(),
    timestamp  : timestamp || new Date().toISOString(),
    receivedAt : new Date().toISOString(),
    score      : analysis.score,
    riskLevel  : analysis.riskLevel,
    status     : analysis.status,
    keywords   : analysis.foundKeywords,
    blocked    : false,
    isTest     : false
  };

  storeMessage(msg);
  const wsCount = broadcast(msg);

  console.log(
    `[SMS] ${msg.riskLevel.toUpperCase().padEnd(6)} | skor:${msg.score} | ws:${wsCount} | ${msg.sender} | ${body.substring(0, 60)}`
  );

  res.status(201).json({
    success   : true,
    id        : msg.id,
    riskLevel : msg.riskLevel,
    score     : msg.score,
    status    : msg.status,
    keywords  : msg.keywords
  });
});

/**
 * POST /api/sms/test — kirim pesan uji (public, tanpa auth)
 * Dashboard memakai endpoint ini untuk tombol 🧪 Uji
 */
app.post("/api/sms/test", (req, res) => {
  const testMessages = [
    { sender: "+6281111111111", body: "Akun WhatsApp Anda akan diblokir! Verifikasi sekarang: http://wa-verify.xyz/login" },
    { sender: "+6282222222222", body: "Kode OTP Anda: 847231. Jangan beritahu siapapun. Transfer dana ke rekening ini." },
    { sender: "+6283333333333", body: "Hadiah undian 50 juta menunggu! Klik: http://hadiah.top/klaim?id=12345" },
    { sender: "Teman Lama",    body: "Halo! Apa kabar? Jadi kumpul minggu depan ya?" },
    { sender: "Bank Central",  body: "Saldo Anda: Rp 2.500.000. Transaksi terakhir ATM 13:45." },
    { sender: "WA Support",    body: "Akun dihapus 24 jam. Klik: http://whatsapp-support.gq/save" },
    { sender: "+6287777777777", body: "Mama ini aku nomor baru. Tolong transfer ke rekening ini dulu ya." },
  ];

  const pick = req.body?.body
    ? req.body
    : testMessages[Math.floor(Math.random() * testMessages.length)];

  const analysis = analyzeMessage(pick.body);

  const msg = {
    id         : crypto.randomUUID(),
    sender     : pick.sender || "Test",
    body       : pick.body,
    timestamp  : new Date().toISOString(),
    receivedAt : new Date().toISOString(),
    score      : analysis.score,
    riskLevel  : analysis.riskLevel,
    status     : analysis.status,
    keywords   : analysis.foundKeywords,
    blocked    : false,
    isTest     : true
  };

  storeMessage(msg);
  const wsCount = broadcast(msg);

  console.log(`[TEST] ${msg.riskLevel.toUpperCase()} | skor:${msg.score} | ws:${wsCount} | ${msg.body.substring(0, 60)}`);

  res.status(201).json({ success: true, ...msg });
});

/**
 * GET /api/sms/latest — polling endpoint
 *
 * Query params:
 *   since  : ISO timestamp (default: 1 jam lalu)
 *   limit  : max results  (default: 50, max: 200)
 *   risk   : high|medium|low|all
 */
app.get("/api/sms/latest", requireAuth, (req, res) => {
  const since = req.query.since
    ? new Date(req.query.since)
    : new Date(Date.now() - 3_600_000);

  const limit      = Math.min(parseInt(req.query.limit) || 50, 200);
  const riskFilter = req.query.risk || "all";

  let result = messages.filter(m => new Date(m.receivedAt) > since);
  if (riskFilter !== "all") result = result.filter(m => m.riskLevel === riskFilter);

  res.json(result.slice(-limit));
});

/** DELETE /api/sms/clear — hapus semua log */
app.delete("/api/sms/clear", requireAuth, (req, res) => {
  messages = [];
  stats    = { high: 0, medium: 0, low: 0, total: 0 };
  console.log("[ADMIN] Semua pesan dihapus");
  res.json({ success: true, message: "Semua pesan dihapus" });
});

/** Fallback: serve index.html untuk semua route (SPA) */
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* ──────────────────────────────────────
   START
────────────────────────────────────── */
app.listen(HTTP_PORT, () => {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║   SENIORSHIELD API SERVER  v1.0.0        ║");
  console.log("╠══════════════════════════════════════════╣");
  console.log(`║  HTTP  →  http://localhost:${HTTP_PORT}           ║`);
  console.log(`║  WS    →  ws://localhost:${WS_PORT}              ║`);
  console.log(`║  Key   →  ${API_KEY.substring(0, 24).padEnd(24)}...  ║`);
  console.log("╚══════════════════════════════════════════╝\n");
  console.log("Endpoint tersedia:");
  console.log("  POST /api/sms/incoming  ← terima SMS dari Android");
  console.log("  POST /api/sms/test      ← kirim pesan uji (no auth)");
  console.log("  GET  /api/sms/latest    ← polling dashboard");
  console.log("  GET  /api/status        ← health check");
  console.log("  GET  /api/stats         ← statistik\n");
});
