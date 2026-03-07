# 🛡 SeniorShield — Deploy Package

## Struktur
```
seniorshield/
├── public/
│   └── index.html     ← Dashboard (otomatis di-serve)
├── server.js          ← API + WebSocket server
├── package.json
├── env.example        ← Salin → .env
├── Dockerfile
├── docker-compose.yml
├── render.yaml
└── .gitignore
```

## Lokal (5 menit)
```bash
npm install
cp env.example .env   # edit API_KEY
npm start
# Buka: http://localhost:3000
```

## Railway
```bash
npm i -g @railway/cli
railway login && railway init && railway up
# Set env vars di Railway dashboard
```

## Render.com
Push ke GitHub → New Web Service → Connect repo → render.yaml otomatis terbaca.

## Docker
```bash
cp env.example .env
docker compose up -d
```

## Login Default
| Username | Password |
|---|---|
| admin | 1234 |
| seniorshield | sahabatselamanya |

## Android SMS Forwarder
```
URL     : https://DOMAIN-ANDA/api/sms/incoming
Method  : POST
Headers : Authorization: Bearer API_KEY_ANDA
Body    : {"sender":"{sender}","body":"{body}"}
```
