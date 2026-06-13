# ✦ Animaxia - Platforma de Streaming Premium

**Animaxia** este o platformă de streaming video premium, inspirată din Netflix, Disney+, HBO Max, Hulu, Prime Video, Apple TV+, Stremio, Sweet TV și SciShowTyme. Construită complet în Node.js cu Express și PostgreSQL.

🌐 **Live:** [https://animaxia.ro](https://animaxia.ro)
📊 **Status:** [https://animaxia.ro/status](https://animaxia.ro/status)

---

## 🚀 Caracteristici Principale

### 🎬 Player Video Real
- Redare YouTube Trailers (autocăutare)
- Suport HLS (m3u8) prin HLS.js
- Redare MP4/WebM direct
- Player cu controale complete (play/pause, seek, volum, viteză)
- Picture-in-Picture (PiP)
- Ecran complet
- X-Ray overlay cu informații despre distribuție
- Subtitrări generate automat (.vtt)
- Tastatură scurtături (Netflix-style)

### 👤 Autentificare & Profiluri
- Înregistrare și login cu email/parolă
- Autentificare Google (Google Identity Services)
- Resetare parolă cu email
- Verificare email
- Profiluri multiple per cont
- Profiluri Kids cu PIN parental
- Încărcare avatar

### 🎯 Sistem de Recomandări
- Recomandări bazate pe genurile vizionate
- Colaborative filtering (similar users)
- Popular content fill
- "Continue Watching" tracking

### 💳 Plăți (Stripe)
- Abonamente lunare: Basic, Standard, Premium, Animaxia+
- Integrare reală Stripe Checkout
- Webhook pentru actualizare automată
- 4 planuri cu feature-uri diferite

### 📺 Live TV
- 15 canale IPTV-style
- EPG (Electronic Program Guide) 24/7
- Categorii: General, Movies, Series, Kids, Documentary, Sports, News, Music, etc.

### 📥 Descărcări Offline
- Salvare conținut în IndexedDB
- Queue de descărcări
- Offline manifest files
- Suport PWA (Progressive Web App)

### 📝 Recenzii & Rating
- Sistem de rating 1-5 stele
- Comentarii la conținut
- Statistici recenzii (medie, total, procentaj pozitiv)

### 👨‍👩‍👧‍👦 Control Parental
- Screen time limits
- Bedtime scheduling
- Content blocklist
- PIN pentru profiluri copii
- Approval requests
- Rapoarte zilnice de activitate

### 🔔 Notificări
- Push notifications (Web Push API)
- Notificări în aplicație
- Email notifications (Resend)
- Suport PWA

### 🔍 Căutare Avansată
- Full-text search (PostgreSQL tsvector)
- Filtrare după gen, an, tip
- Căutare după relevanță
- Trending searches
- Search history

### 🌐 APIs Integrate (API Gateway)
- **TMDB** - Filme, seriale, trending, populare
- **OMDB** - Metadata backup
- **YouTube** - Trailere, videoclipuri
- **Jikan** (MyAnimeList) - Anime
- **Kitsu** - Anime alternativ
- **AniAPI** - Anime
- **TVMaze** - Seriale TV
- **Algolia** - Căutare avansată
- **OpenSubtitles** - Subtitrări
- **Football-Data.org** - Fotbal
- **Balldontlie** - NBA
- **Ergast F1** - Formula 1
- **Deezer** - Muzică
- **iTunes** - Muzică
- **Lyrics.ovh** - Versuri
- **OpenLibrary** - Cărți
- **TheAudioDB** - Muzică
- **TheSportsDB** - Sport
- **Wikipedia** - Enciclopedie
- **Reddit** - Subreddit feed
- **RSS** - Feed parsing
- **MyDramaList** - K-Drama
- **Viki** - Dramă asiatică

### 👨‍💼 Admin Dashboard
- Statistici în timp real (conținut, utilizatori, watchlists, etc.)
- Gestiune conținut (CRUD)
- Vizualizare utilizatori
- Analytics (views pe tip, top content, distribuție genuri, activitate zilnică)
- Revenue estimation

### 🔄 WebSocket
- Sincronizare în timp real
- Watch Party (vizionare sincronizată)
- Chat în camere
- Evenimente play/pause/seek broadcast

### 🌍 Multi-limbă
- Română (implicit)
- Engleză
- Subtitrări configurabile

### 📱 PWA (Progressive Web App)
- Service Worker cu cache-first și network-first
- Instalabil pe dispozitive mobile
- Offline support
- Push notifications
- Share target
- Protocol handlers

---

## 🏗️ Arhitectură

```
Animaxia/
├── server.js              # Server principal Express
├── api-gateway.js         # API Gateway pentru servicii externe
├── package.json           # Dependințe și scripturi
├── .env                   # Variabile de mediu (NICIODATĂ commit)
├── .env.example           # Template pentru variabile de mediu
├── .gitignore             # Fișiere ignorate de Git
│
├── db/                    # Baza de date
│   ├── migrate.js         # Migrație principală + seed
│   ├── migrate_v5_2.js    # Migrație v5.2 (features noi)
│   ├── migrate_v6_0.js    # Migrație v6.0 (producție)
│   └── migrate_parental.js # Migrație control parental
│   ├── seed_channels.js   # Seed canale live TV
│   ├── seed_trailers.js   # Seed trailere YouTube reale
│   └── generate_icons.js  # Generator icoane PWA
│
├── public/                # Frontend (SPA)
│   ├── index.html         # Single Page Application
│   ├── manifest.json      # PWA Manifest
│   ├── service-worker.js  # Service Worker
│   ├── status.html        # Pagină status
│   ├── sitemap.xml        # Sitemap SEO
│   ├── robots.txt         # Config crawler
│   │
│   ├── css/
│   │   └── style.css      # Stiluri complete (~6700 linii)
│   │
│   ├── js/
│   │   ├── app.js         # App principal (~4700 linii)
│   │   ├── data.js        # Data loader + TMDB fallback
│   │   ├── player.js      # Player video real
│   │   ├── discovery.js   # Discovery module
│   │   ├── interactive.js # Module interactive
│   │   ├── parental.js    # Control parental UI
│   │   ├── collections.js # Colecții utilizatori
│   │   ├── watchparty.js  # Watch Party
│   │   ├── comingsoon.js  # Coming soon
│   │   ├── ratings.js     # Rating UI
│   │   ├── achievements.js# Achievements
│   │   ├── trending.js    # Trending module
│   │   ├── mystats.js     # Statistici personale
│   │   └── timeline.js    # Timeline vizionări
│   │
│   ├── icons/             # Icoane PWA
│   └── avatars/           # Avataruri utilizatori
│
└── node_modules/          # Dependințe (ignorate în Git)
```

---

## 🛠️ Tehnologii

### Backend
- **Runtime:** Node.js
- **Framework:** Express.js
- **Bază date:** PostgreSQL
- **Autentificare:** JWT + bcrypt
- **Plăți:** Stripe
- **Email:** Resend
- **WebSocket:** ws (native)
- **Cache:** In-memory Map
- **Security:** Helmet, CORS, Rate Limiting
- **Validare:** express-validator

### Frontend
- **Vanilla JS** (SPA, fără framework)
- **CSS3** cu variabile custom și animații
- **Font Awesome 6** pentru iconițe
- **HLS.js** pentru streaming HLS
- **Service Worker** pentru PWA
- **IndexedDB** pentru stocare offline

### DevOps
- **Hosting:** Node.js pe orice VPS/Cloud
- **Bază date:** PostgreSQL (recomandat Neon.tech)
- **Domeniu:** animaxia.ro

---

## 🚦 Instalare & Configurare

### 1. Clonează repository-ul
```bash
git clone https://github.com/andrei94robert26-cmd/Animaxia.git
cd Animaxia
```

### 2. Instalează dependințele
```bash
npm install
```

### 3. Configurează variabilele de mediu
```bash
cp .env.example .env
# Editează .env cu cheile tale
```

### 4. Configurează baza de date PostgreSQL
```bash
# Asigură-te că PostgreSQL rulează
# Editează DATABASE_URL în .env

# Rulează migrația (creează toate tabelele + seed data)
npm run db:migrate
```

### 5. Seed canale live TV
```bash
node db/seed_channels.js
```

### 6. Seed trailere YouTube
```bash
node db/seed_trailers.js
```

### 7. Pornește serverul
```bash
npm start
```

Accesează platforma la: **http://localhost:3000**

### Conturi demo
| Email | Parolă | Rol |
|---|---|---|
| demo@animaxia.ro | animaxia123 | Admin |
| test@animaxia.ro | test123456 | Utilizator |

---

## 🔑 Variabile de Mediu (.env)

| Variabila | Descriere | Obligatorie |
|---|---|---|
| `DATABASE_URL` | URL conexiune PostgreSQL | Da |
| `JWT_SECRET` | Secret pentru token-uri JWT | Da |
| `TMDB_API_KEY` | Cheie API TMDB (conținut) | Recomandat |
| `STRIPE_SECRET` | Cheie secretă Stripe (plăți) | Opțional |
| `RESEND_API_KEY` | Cheie API Resend (email) | Opțional |
| `VAPID_PUBLIC_KEY` | Cheie VAPID publică (push) | Opțional |
| `VAPID_PRIVATE_KEY` | Cheie VAPID privată (push) | Opțional |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | Opțional |
| `YOUTUBE_API_KEY` | Cheie API YouTube | Opțional |
| `ALGOLIA_APP_ID` | Algolia App ID | Opțional |

Vezi `.env.example` pentru lista completă.

---

## 📊 Statistici Platformă

| Metrică | Valoare |
|---|---|
| Tabele DB | 27+ |
| Linii de cod backend | ~5,000 (server.js) |
| Linii de cod frontend | ~15,000+ (JS files) |
| Linii CSS | ~6,700 (style.css) |
| API-uri externe integrate | 26+ |
| Canale Live TV | 15 |
| Contenut seed | 25+ item-uri |
| Module JS frontend | 14 |

---

## 📄 Licență

**MIT License** - Vezi fișierul `LICENSE` pentru detalii.

---

## 👤 Autor

**Andrei Popescu** - andrei94robert26-cmd

---

**✦ Animaxia** — *"Pregătim magia pentru tine..."*
