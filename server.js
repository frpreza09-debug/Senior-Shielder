/**
 * ╔══════════════════════════════════════════════════════════╗
 *   SENIORSHIELD — BACKEND API SERVER
 *   Stack : Node.js + Express + ws (WebSocket)
 *   Port  : 3000  (HTTP)  |  3001  (WebSocket)
 * ╚══════════════════════════════════════════════════════════╝
 *
 * Endpoint:
 *   POST /api/sms/incoming   ← terima pesan dari Android / SMS forwarder
 *   GET  /api/sms/latest     ← polling oleh dashboard (param: ?since=ISO)
 *   GET  /api/status         ← health-check
 *   GET  /api/stats          ← statistik total deteksi
 *   DELETE /api/sms/clear    ← hapus semua log (opsional)
 *
 * WebSocket ws://localhost:3001
 *   ← broadcast ke semua klien setiap ada pesan baru
 */

const express  = require("express");
const cors     = require("cors");
const WebSocket= require("ws");
const crypto   = require("crypto");

const app = express();
app.use(cors());
app.use(express.json());

/* ══════════════════════════════════════════════════
   KONFIGURASI
══════════════════════════════════════════════════ */
const HTTP_PORT = process.env.PORT    || 3000;
const WS_PORT   = process.env.WS_PORT || 3001;
const API_KEY   = process.env.API_KEY || "seniorshield-secret-key"; // ganti di production!

/* ══════════════════════════════════════════════════
   DATABASE IN-MEMORY
   (ganti dengan MongoDB/SQLite untuk production)
══════════════════════════════════════════════════ */
let messages = [];          // semua pesan masuk
let stats    = { high:0, medium:0, low:0, total:0 };

/* ══════════════════════════════════════════════════
   DETECTION ENGINE — sama persis dengan frontend
══════════════════════════════════════════════════ */
const PHISHING_KEYWORDS = [
  "hadiah","klik link","verifikasi akun","akun diblokir","transfer sekarang",
  "menang undian","gratis saldo","bank","pin","otp","kode verifikasi",
  "whatsapp support","login dari perangkat baru","reset password","data anda",
  "segera","urgent","konfirmasi","perangkat baru","terkena hack",
  "kode rahasia","jangan beritahu","transfer dana","rekening"
];

const SUSPICIOUS_DOMAINS = [
  ".xyz",".top",".click",".gq",".ru",".tk",".cf",".ml",".ga"
];

function analyzeMessage(body) {
  const t = body.toLowerCase();
  let score = 0;
  const foundKeywords = [];

  PHISHING_KEYWORDS.forEach(kw => {
    if (t.includes(kw)) { score += 15; foundKeywords.push(kw); }
  });

  SUSPICIOUS_DOMAINS.forEach(d => {
    if (t.includes(d)) { score += 25; foundKeywords.push(d); }
  });

  if (t.match(/https?:\/\//))                     score += 20;
  if (t.match(/\d{4,6}/) && t.includes("otp"))    score += 30;
  else if (t.match(/\d{4,6}/))                    score += 10;

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

  return { score, riskLevel, status, foundKeywords: [...new Set(foundKeywords)] };
}

/* ══════════════════════════════════════════════════
   MIDDLEWARE — validasi API Key
══════════════════════════════════════════════════ */
function authMiddleware(req, res, next) {
  // Lewati jika tidak ada API_KEY yang dikonfigurasi
  if (!API_KEY) return next();

  const authHeader = req.headers["authorization"] || "";
  const keyHeader  = req.headers["x-api-key"]     || "";
  const provided   = authHeader.replace("Bearer ", "") || keyHeader;

  if (provided !== API_KEY) {
    return res.status(401).json({ error: "Unauthorized — API key tidak valid" });
  }
  next();
}

/* ══════════════════════════════════════════════════
   WEBSOCKET SERVER
══════════════════════════════════════════════════ */
const wss = new WebSocket.Server({ port: WS_PORT });
const wsClients = new Set();

wss.on("connection", (ws, req) => {
  console.log(`[WS] Klien terhubung: ${req.socket.remoteAddress}`);
  wsClients.add(ws);

  // Kirim pesan terbaru saat klien baru connect
  const recent = messages.slice(-20);
  if (recent.length > 0) {
    ws.send(JSON.stringify(recent));
  }

  ws.on("close", () => {
    wsClients.delete(ws);
    console.log("[WS] Klien terputus");
  });

  ws.on("error", err => console.error("[WS] Error:", err.message));
});

/** Broadcast objek ke semua klien WebSocket yang terhubung */
function broadcastToAll(data) {
  const payload = JSON.stringify(Array.isArray(data) ? data : [data]);
  wsClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

/* ══════════════════════════════════════════════════
   ROUTES
══════════════════════════════════════════════════ */

/** GET /api/status — health check */
app.get("/api/status", (req, res) => {
  res.json({
    status  : "online",
    version : "1.0.0",
    uptime  : process.uptime().toFixed(1) + "s",
    messages: messages.length,
    wsClients: wsClients.size,
    timestamp: new Date().toISOString()
  });
});

/** GET /api/stats — statistik deteksi */
app.get("/api/stats", authMiddleware, (req, res) => {
  res.json({ ...stats, wsClients: wsClients.size });
});

/**
 * POST /api/sms/incoming
 * Terima pesan SMS baru dari Android (SMS Forwarder / Tasker / custom app)
 *
 * Body JSON:
 * {
 *   "sender"   : "+6281234567890",
 *   "body"     : "isi pesan SMS",
 *   "timestamp": "2025-01-01T10:00:00Z"   (opsional)
 * }
 */
app.post("/api/sms/incoming", authMiddleware, (req, res) => {
  const { sender, body, timestamp } = req.body;

  // Validasi
  if (!sender || !body) {
    return res.status(400).json({ error: "Field 'sender' dan 'body' wajib diisi" });
  }

  // Analisis bahaya
  const analysis = analyzeMessage(body);

  // Buat objek pesan lengkap
  const msg = {
    id        : crypto.randomUUID(),
    sender    : String(sender).trim(),
    body      : String(body).trim(),
    timestamp : timestamp || new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    score     : analysis.score,
    riskLevel : analysis.riskLevel,
    status    : analysis.status,
    keywords  : analysis.foundKeywords,
    blocked   : false
  };

  // Simpan
  messages.push(msg);
  if (messages.length > 500) messages.shift(); // rolling buffer

  // Update statistik
  stats.total++;
  stats[analysis.riskLevel]++;

  // Broadcast ke semua WebSocket klien SEKARANG
  broadcastToAll(msg);

  console.log(
    `[SMS] ${msg.sender} | ${msg.riskLevel.toUpperCase()} (${msg.score}) | ${body.substring(0,60)}`
  );

  res.status(201).json({
    success  : true,
    id       : msg.id,
    riskLevel: msg.riskLevel,
    score    : msg.score,
    status   : msg.status,
    keywords : msg.keywords
  });
});

/**
 * GET /api/sms/latest
 * Polling endpoint — kembalikan pesan baru sejak timestamp tertentu
 *
 * Query params:
 *   ?since=2025-01-01T10:00:00Z   (opsional — default: 1 jam lalu)
 *   ?limit=50                      (opsional — default: 50)
 *   ?risk=high                     (opsional — filter: high|medium|low|all)
 */
app.get("/api/sms/latest", authMiddleware, (req, res) => {
  const since = req.query.since
    ? new Date(req.query.since)
    : new Date(Date.now() - 3600_000); // 1 jam lalu default

  const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
  const riskFilter = req.query.risk || "all";

  let result = messages.filter(m => new Date(m.receivedAt) > since);

  if (riskFilter !== "all") {
    result = result.filter(m => m.riskLevel === riskFilter);
  }

  res.json(result.slice(-limit));
});

/** DELETE /api/sms/clear — hapus semua pesan (admin) */
app.delete("/api/sms/clear", authMiddleware, (req, res) => {
  messages = [];
  stats    = { high:0, medium:0, low:0, total:0 };
  res.json({ success:true, message:"Semua pesan dihapus" });
});

/**
 * POST /api/sms/test
 * Kirim pesan uji tanpa API key (untuk demo / testing frontend)
 */
app.post("/api/sms/test", (req, res) => {
  const testMessages = [
    { sender:"+6281111111111", body:"Selamat! Akun WhatsApp Anda akan diblokir. Verifikasi sekarang: http://wa-verify.xyz/login" },
    { sender:"+6282222222222", body:"Kode OTP Anda: 847231. Jangan beritahu siapapun. Transfer dana ke rekening berikut." },
    { sender:"+6283333333333", body:"Hadiah undian 50 juta menunggu Anda! Klik: http://hadiah.top/klaim?id=12345" },
    { sender:"Teman",          body:"Halo! Apa kabar? Jadi makan siang bareng hari ini?" },
    { sender:"Bank Mandiri",   body:"Informasi: saldo Anda Rp 2.500.000. Transaksi terakhir: ATM 13:45." },
  ];

  // Pilih pesan random atau dari body
  let toSend;
  if (req.body && req.body.body) {
    toSend = req.body;
  } else {
    toSend = testMessages[Math.floor(Math.random() * testMessages.length)];
  }

  // Inject langsung tanpa auth check
  const analysis = analyzeMessage(toSend.body);
  const msg = {
    id        : crypto.randomUUID(),
    sender    : toSend.sender || "Test",
    body      : toSend.body,
    timestamp : new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    score     : analysis.score,
    riskLevel : analysis.riskLevel,
    status    : analysis.status,
    keywords  : analysis.foundKeywords,
    blocked   : false,
    isTest    : true
  };

  messages.push(msg);
  stats.total++;
  stats[analysis.riskLevel]++;
  broadcastToAll(msg);

  console.log(`[TEST] ${msg.sender} | ${msg.riskLevel.toUpperCase()} | ${msg.body.substring(0,60)}`);
  res.status(201).json({ success:true, ...msg });
});

/* ══════════════════════════════════════════════════
   START SERVER
══════════════════════════════════════════════════ */
app.listen(HTTP_PORT, () => {
  console.log("╔════════════════════════════════════════╗");
  console.log("║  SENIORSHIELD API SERVER               ║");
  console.log("╠════════════════════════════════════════╣");
  console.log(`║  HTTP  : http://localhost:${HTTP_PORT}          ║`);
  console.log(`║  WS    : ws://localhost:${WS_PORT}             ║`);
  console.log(`║  Key   : ${API_KEY.substring(0,20)}...  ║`);
  console.log("╚════════════════════════════════════════╝");
  console.log("\n[INFO] Endpoint siap:");
  console.log("  POST /api/sms/incoming  ← terima SMS dari Android");
  console.log("  POST /api/sms/test      ← kirim pesan uji (tanpa auth)");
  console.log("  GET  /api/sms/latest    ← polling pesan baru");
  console.log("  GET  /api/status        ← health check");
  console.log("  GET  /api/stats         ← statistik\n");
});
