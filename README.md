# 🛡 SeniorShield — SMS Phishing Detection System

Sistem deteksi otomatis pesan phishing / hack WhatsApp untuk lansia.

---

## 📁 Struktur File

```
seniorshield/
├── index.html          ← Dashboard (buka di browser)
├── server.js           ← API Server (Node.js)
├── package.json
├── .env.example        ← Salin ke .env
├── .gitignore
├── Dockerfile
├── docker-compose.yml
└── render.yaml         ← Deploy ke Render.com
```

---

## 🚀 Jalankan Lokal

```bash
# 1. Clone / ekstrak folder
cd seniorshield

# 2. Install dependensi
npm install

# 3. Buat .env
cp .env.example .env
# Edit .env dan ganti API_KEY

# 4. Jalankan server
npm start

# 5. Buka dashboard
# Buka index.html di browser, atau:
# http://localhost:3000  (jika index.html ada di folder public/)
```

---

## 🌐 Endpoint API

| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| GET | `/api/status` | — | Health check |
| POST | `/api/sms/incoming` | ✅ | Terima SMS dari Android |
| POST | `/api/sms/test` | — | Kirim pesan uji |
| GET | `/api/sms/latest` | ✅ | Polling pesan baru |
| GET | `/api/stats` | ✅ | Statistik deteksi |
| DELETE | `/api/sms/clear` | ✅ | Hapus semua log |

**Header Auth:** `Authorization: Bearer YOUR_API_KEY`

---

## 📱 Integrasi Android

### Cara Termudah — SMS Forwarder App

1. Install **SMS Forwarder** dari Play Store
2. Tambah rule:
   - URL: `http://IP-SERVER:3000/api/sms/incoming`
   - Method: POST
   - Header: `Authorization: Bearer YOUR_API_KEY`
   - Body: `{"sender":"{sender}","body":"{body}"}`

### Cara Manual — curl test

```bash
curl -X POST http://localhost:3000/api/sms/incoming \
  -H "Authorization: Bearer seniorshield-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"sender":"+6281234567890","body":"Klik link ini: http://wa-verify.xyz"}'
```

---

## ☁ Deploy ke Cloud

### Railway
```bash
npm install -g @railway/cli
railway login && railway init && railway up
```

### Docker
```bash
docker compose up -d
```

### Render.com
Push ke GitHub → Connect di Render → `render.yaml` sudah siap.

---

## 🔒 Keamanan

```bash
# Generate API Key kuat:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

- Selalu ganti `API_KEY` default
- Gunakan HTTPS di production
- Jangan commit file `.env`

---

## 📡 WebSocket

Hubungkan dashboard ke `ws://localhost:3001?token=YOUR_KEY`

Format pesan dari server:
```json
{
  "id": "uuid",
  "sender": "+628xxx",
  "body": "isi SMS",
  "riskLevel": "high",
  "score": 75,
  "status": "HIGH RISK — ...",
  "keywords": ["otp", ".xyz"],
  "timestamp": "ISO8601"
}
```

---

## Login Default

| Username | Password |
|----------|----------|
| `admin` | `1234` |
| `seniorshield` | `sahabatselamanya` |
