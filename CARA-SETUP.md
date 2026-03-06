# SeniorShield API — Setup Guide

## Instalasi cepat

```bash
# 1. Masuk ke folder
cd seniorshield-api

# 2. Install dependensi
npm install

# 3. Jalankan server
npm start
```

Server berjalan di:
- HTTP  → `http://localhost:3000`
- WebSocket → `ws://localhost:3001`

---

## Konfigurasi (opsional)

Buat file `.env` di folder yang sama:

```env
PORT=3000
WS_PORT=3001
API_KEY=ganti-dengan-key-rahasia-anda
```

---

## Cara integrasi ke Dashboard

1. Buka **SeniorShield Dashboard** → klik **⚙ API**
2. Pilih mode: **WebSocket Real-time** (direkomendasikan)
3. Isi URL WebSocket: `ws://localhost:3001`
4. Isi API Key: `seniorshield-secret-key` (atau sesuai `.env`)
5. Klik **Simpan** → **▶ Mulai Monitor**

---

## Kirim SMS dari Android

### Opsi A — SMS Forwarder App (termudah)
1. Install **SMS Forwarder** dari Play Store
2. Tambah rule: Forward semua SMS ke:
   ```
   POST http://IP-KOMPUTER-KAMU:3000/api/sms/incoming
   Header: Authorization: Bearer seniorshield-secret-key
   Body: { "sender": "{sender}", "body": "{body}" }
   ```

### Opsi B — Tasker + AutoHttp
1. Buat Task Tasker: On SMS Received
2. Action → AutoHttp → POST ke endpoint di atas

### Opsi C — Android App Custom (Java/Kotlin)
```java
// Manifest: <uses-permission android:name="android.permission.RECEIVE_SMS"/>

BroadcastReceiver smsReceiver = new BroadcastReceiver() {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        SmsMessage[] msgs = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        for (SmsMessage msg : msgs) {
            sendToAPI(msg.getOriginatingAddress(), msg.getMessageBody());
        }
    }
};

void sendToAPI(String sender, String body) {
    // POST ke http://SERVER:3000/api/sms/incoming
    // JSON: { "sender": sender, "body": body }
}
```

---

## Endpoint API

| Method | Path | Deskripsi |
|--------|------|-----------|
| POST | `/api/sms/incoming` | Terima SMS baru (butuh API Key) |
| POST | `/api/sms/test` | Kirim pesan uji (tanpa API Key) |
| GET | `/api/sms/latest?since=ISO` | Ambil pesan baru (polling) |
| GET | `/api/status` | Health check |
| GET | `/api/stats` | Statistik deteksi |
| DELETE | `/api/sms/clear` | Hapus semua log |

---

## Contoh kirim SMS via curl

```bash
# Kirim pesan berbahaya (test)
curl -X POST http://localhost:3000/api/sms/incoming \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer seniorshield-secret-key" \
  -d '{"sender":"+6281234567890","body":"Klik link ini untuk verifikasi akun: http://wa-hack.xyz/login"}'

# Kirim pesan uji random (tanpa auth)
curl -X POST http://localhost:3000/api/sms/test

# Cek status server
curl http://localhost:3000/api/status
```

---

## Deploy ke cloud (Render / Railway / VPS)

```bash
# Railway
railway init && railway up

# Render
# → Tambah env var PORT=3000 dan API_KEY
# → Build command: npm install
# → Start command: npm start
```

Setelah deploy, ubah URL di dashboard dari `localhost` ke URL cloud Anda.
