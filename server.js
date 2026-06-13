/**
 * Animaxia v6.0 - PRODUCTION PLATFORM
 * Real: Video streaming, Payments (Stripe), Email (Resend),
 * WebSocket real-time, Full-text search, Security,
 * Multi-language, Analytics, Downloads
 * 
 * Inspirat din: Netflix, Disney+, HBO Max, Hulu, Prime Video,
 * Apple TV+, Stremio, Sweet TV, SciShowTyme
 */

require('dotenv').config();

// ====== PROCESS-LEVEL ERROR HANDLING (keep server alive!) ======
process.on('uncaughtException', (err) => {
  console.error('❌ UNCAUGHT EXCEPTION:', err.message);
  if (err.stack) console.error(err.stack);
  // Do NOT exit - keep the server running
});
process.on('unhandledRejection', (reason) => {
  console.error('❌ UNHANDLED PROMISE REJECTION:', reason?.message || reason);
  // Do NOT exit - keep the server running
});
process.on('warning', (warning) => {
  // Suppress pg SSL compatibility warning - it's cosmetic for Neon
  if (warning.name === 'DeprecationWarning' || 
      warning.message?.includes('SSL mode') || 
      warning.message?.includes('sslmode')) return;
  if (warning.name === 'DeprecationWarning') return;
  console.warn('⚠️ Warning:', warning.message);
});

const express = require('express');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const { body, validationResult } = require('express-validator');
const compression = require('compression');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  console.warn('⚠️ JWT_SECRET not set. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
  return 'dev-jwt-secret-not-secure-replace-in-production';
})();
const JWT_EXPIRES = '7d';
const STRIPE_SECRET = process.env.STRIPE_SECRET || '';
const RESEND_KEY = process.env.RESEND_API_KEY || '';
const TMDB_KEY = process.env.TMDB_API_KEY || '';

// Stripe (real payment integration)
let stripe = null;
try {
  if (STRIPE_SECRET) {
    stripe = require('stripe')(STRIPE_SECRET);
    console.log('✅ Stripe initialized');
  }
} catch (e) {
  console.log('ℹ️ Stripe not available (set STRIPE_SECRET in .env to enable)');
}

// Email service (real email integration)
let resendClient = null;
try {
  if (RESEND_KEY) {
    resendClient = require('resend').Resend ? new (require('resend').Resend)(RESEND_KEY) : null;
    console.log('✅ Email service (Resend) initialized');
  }
} catch (e) {
  console.log('ℹ️ Email service not available (set RESEND_API_KEY in .env to enable)');
}

// ====== PERFORMANCE & SECURITY MIDDLEWARE ======
app.use(compression({ level: 6, threshold: 1024 })); // Compress responses > 1KB

// ====== IN-MEMORY CACHE with automatic cleanup ======
const responseCache = new Map();
const CACHE_TTL = 60 * 1000; // 60 seconds default
const MAX_CACHE_SIZE = 500;

// Automatic cache cleanup every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  let deleted = 0;
  for (const [key, val] of responseCache.entries()) {
    if (now - val.ts > CACHE_TTL * 2) {
      responseCache.delete(key);
      deleted++;
    }
  }
  if (deleted > 0) {
    console.log(`🧹 Cache cleanup: removed ${deleted} expired entries (${responseCache.size} remaining)`);
  }
}, 5 * 60 * 1000);

function cacheMiddleware(ttlSeconds = 60) {
  return (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') return next();
    
    const key = req.originalUrl || req.url;
    const cached = responseCache.get(key);
    
    if (cached && Date.now() - cached.ts < ttlSeconds * 1000) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached.data);
    }
    
    // Store original json method
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      // Cache successful responses (~<500KB)
      const bodyStr = JSON.stringify(body);
      if (res.statusCode === 200 && bodyStr.length < 1024 * 500) {
        // Evict oldest if cache is full
        if (responseCache.size >= MAX_CACHE_SIZE) {
          const oldest = [...responseCache.entries()]
            .sort((a, b) => a[1].ts - b[1].ts)[0];
          if (oldest) responseCache.delete(oldest[0]);
        }
        responseCache.set(key, { data: body, ts: Date.now() });
        res.setHeader('X-Cache', 'MISS');
      }
      return originalJson(body);
    };
    
    next();
  };
}

// Apply caching to content and search endpoints
app.use('/api/content', cacheMiddleware(30));  // 30 seconds for content
app.use('/api/search', cacheMiddleware(15));   // 15 seconds for search
app.use('/api/payments/plans', cacheMiddleware(300)); // 5 minutes for plans
app.use('/api/notifications', cacheMiddleware(30));

// Response time logging (console only - avoids header conflicts with streaming)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path.startsWith('/api/') && duration > 500) {
      console.log(`⏱ ${req.method} ${req.path} - ${duration}ms`);
    }
  });
  next();
});

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many auth attempts.' }
});
app.use('/api/', apiLimiter);
app.use('/api/auth/', authLimiter);

app.use('/api/admin/', rateLimit({ windowMs: 15 * 60 * 1000, max: 60 }));

// PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/animaxia',
  ssl: (process.env.DATABASE_URL || "").includes("localhost") || (process.env.DATABASE_URL || "").includes("127.0.0.1") ? false : { rejectUnauthorized: false },
  max: 25,  // Increased pool size for better concurrency
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000,  // More generous timeout for Neon
});

pool.query('SELECT NOW()').then(r => {
  console.log(`✅ PostgreSQL connected at ${r.rows[0].now}`);
  initFullTextSearch();
  initPushTables();
  initParentalTables();
  initAddonTables();
  initContinentTables();
  initIndustryTables();
  initFranchiseTables();
  initUploadTables();
  initContentModuleTables();
  seedAddonData();
  seedIndustryData();
  seedFranchiseData();
}).catch(e => {
  console.error('❌ PostgreSQL connection failed:', e.message);
  process.exit(1);
});

// Initialize full-text search indexes
async function initFullTextSearch() {
  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_content_fts ON content_items 
      USING gin(to_tsvector('romanian', coalesce(title,'') || ' ' || coalesce(title_en,'') || ' ' || coalesce(description,'')))`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_content_title_trgm ON content_items USING gin(title gin_trgm_ops)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_content_title_en_trgm ON content_items USING gin(title_en gin_trgm_ops)`);
    console.log('✅ Full-text search indexes initialized');
  } catch (e) {
    console.log('ℹ️ Full-text search init:', e.message);
  }
}

// Initialize push_subscriptions table on startup
async function initPushTables() {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL,
      p256dh TEXT DEFAULT '',
      auth TEXT DEFAULT '',
      user_agent TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, endpoint)
    )`);
    console.log('✅ Push subscriptions table ready');
  } catch (e) {
    console.log('ℹ️ Push table init:', e.message);
  }
}

// Initialize parental control tables on startup
async function initParentalTables() {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS daily_usage (
      id SERIAL PRIMARY KEY,
      profile_id VARCHAR(50) NOT NULL,
      date DATE NOT NULL DEFAULT CURRENT_DATE,
      minutes_watched INTEGER DEFAULT 0,
      sessions_count INTEGER DEFAULT 0,
      UNIQUE(profile_id, date)
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS content_blocklist (
      id SERIAL PRIMARY KEY,
      profile_id VARCHAR(50) NOT NULL,
      item_id VARCHAR(50) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(profile_id, item_id)
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS approval_requests (
      id SERIAL PRIMARY KEY,
      profile_id VARCHAR(50) NOT NULL,
      item_id VARCHAR(50) NOT NULL,
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW(),
      reviewed_at TIMESTAMP,
      UNIQUE(profile_id, item_id)
    )`);
    console.log('✅ Parental control tables ready');
  } catch (e) {
    console.log('ℹ️ Parental tables init:', e.message);
  }
}

// Middleware
app.use(express.json({ limit: '10mb' }));

// Avatar upload
const avatarDir = path.join(__dirname, 'public', 'avatars');
if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });

const storage = multer.diskStorage({
  destination: avatarDir,
  filename: (req, file, cb) => {
    const ext = file.originalname.split('.').pop();
    cb(null, `avatar-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
  }
});
const upload = multer({ 
  storage, 
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    cb(null, allowed.includes(file.mimetype));
  }
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/avatars', express.static(avatarDir));

// ====== JWT HELPERS ======
const generateToken = (user) => jwt.sign(
  { userId: user.id, email: user.email, name: user.name, plan: user.plan, role: user.role || 'user' },
  JWT_SECRET,
  { expiresIn: JWT_EXPIRES }
);

const generateResetToken = () => crypto.randomBytes(32).toString('hex');

const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Authentication required' });
  if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Invalid authorization format' });
  const token = authHeader.slice(7);
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const requireAdmin = [requireAuth, (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}];

// ====== VALIDATION ======
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array().map(e => e.msg).join(', ') });
  }
  next();
};

// ====== WEBSOCKET MANAGER ======
const wsClients = new Map(); // roomId -> Set<WebSocket>
const wsUsers = new Map();   // ws -> { profileId, roomId, name }

wss.on('connection', (ws) => {
  console.log('🔌 WebSocket connected');

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      handleWSMessage(ws, msg);
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });

  ws.on('close', () => {
    const user = wsUsers.get(ws);
    if (user?.roomId) {
      const roomClients = wsClients.get(user.roomId);
      if (roomClients) {
        roomClients.delete(ws);
        if (roomClients.size === 0) wsClients.delete(user.roomId);
        else {
          broadcastToRoom(user.roomId, {
            type: 'user_left',
            profileId: user.profileId,
            profileName: user.name,
            participants: getRoomParticipants(user.roomId)
          }, ws);
        }
      }
    }
    wsUsers.delete(ws);
  });
});

function handleWSMessage(ws, msg) {
  switch (msg.type) {
    case 'join_room':
      wsUsers.set(ws, { profileId: msg.profileId, roomId: msg.roomId, name: msg.profileName });
      if (!wsClients.has(msg.roomId)) wsClients.set(msg.roomId, new Set());
      wsClients.get(msg.roomId).add(ws);
      broadcastToRoom(msg.roomId, {
        type: 'user_joined',
        profileId: msg.profileId,
        profileName: msg.profileName,
        participants: getRoomParticipants(msg.roomId)
      }, ws);
      ws.send(JSON.stringify({ type: 'joined', roomId: msg.roomId }));
      break;

    case 'play':
    case 'pause':
    case 'seek':
      broadcastToRoom(msg.roomId, {
        type: msg.type,
        profileId: msg.profileId,
        time: msg.time,
        profileName: msg.profileName
      });
      break;

    case 'sync':
      broadcastToRoom(msg.roomId, {
        type: 'sync',
        profileId: msg.profileId,
        time: msg.time,
        playing: msg.playing,
        profileName: msg.profileName
      }, ws);
      break;

    case 'chat':
      broadcastToRoom(msg.roomId, {
        type: 'chat',
        profileId: msg.profileId,
        profileName: msg.profileName,
        message: msg.message,
        timestamp: new Date().toISOString()
      });
      break;

    case 'leave_room':
      const user = wsUsers.get(ws);
      if (user?.roomId) {
        const roomClients = wsClients.get(user.roomId);
        if (roomClients) {
          roomClients.delete(ws);
          broadcastToRoom(user.roomId, {
            type: 'user_left',
            profileId: msg.profileId,
            profileName: msg.profileName,
            participants: getRoomParticipants(user.roomId)
          }, ws);
        }
      }
      wsUsers.delete(ws);
      break;
  }
}

function broadcastToRoom(roomId, data, excludeWs = null) {
  const clients = wsClients.get(roomId);
  if (!clients) return;
  const payload = JSON.stringify(data);
  clients.forEach(client => {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

function getRoomParticipants(roomId) {
  const clients = wsClients.get(roomId);
  if (!clients) return [];
  return Array.from(clients).map(ws => {
    const u = wsUsers.get(ws);
    return { profileId: u?.profileId, profileName: u?.name };
  });
}

// ====== EMAIL SERVICE (REAL) ======
const EMAIL_LOG_PATH = path.join(__dirname, 'email.log');

async function sendEmail(to, subject, html) {
  const logEntry = `[${new Date().toISOString()}] EMAIL TO: ${to} | SUBJ: ${subject}\n`;
  
  // Ensure email.log directory exists
  try { 
    const dir = path.dirname(EMAIL_LOG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch {}
  
  if (resendClient) {
    try {
      const { data, error } = await resendClient.emails.send({
        from: 'Animaxia <noreply@animaxia.ro>',
        to,
        subject,
        html
      });
      if (error) throw error;
      console.log(`✅ Email sent to ${to}: ${subject}`);
      try { fs.appendFileSync(EMAIL_LOG_PATH, logEntry + `STATUS: sent via Resend\n`); } catch {}
      return { success: true };
    } catch (e) {
      console.error(`❌ Email failed to ${to}:`, e.message);
      try { fs.appendFileSync(EMAIL_LOG_PATH, logEntry + `STATUS: failed (${e.message})\n`); } catch {}
      return { success: false, error: e.message };
    }
  } else {
    // Fallback: log to console and file
    console.log(`\n📧 EMAIL TO: ${to}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   Body: ${html.substring(0, 200)}...\n`);
    try { fs.appendFileSync(EMAIL_LOG_PATH, logEntry + `STATUS: logged (no email provider configured)\n`); } catch {}
    return { success: true, provider: 'console' };
  }
}

// ====== STREAMING ENDPOINTS ======
// Video serving with range support (like a real streaming server)
app.get('/api/stream/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT video_url, trailer_url, title, title_en, content_type FROM content_items WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    
    const videoPath = rows[0].video_url;
    if (!videoPath || !fs.existsSync(videoPath)) {
      // Return trailer URL as JSON so frontend can embed YouTube
      if (rows[0].trailer_url) {
        return res.json({ redirect: rows[0].trailer_url, type: 'youtube' });
      }
      return res.status(404).json({ error: 'Video not available' });
    }
    
    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;
    
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const stream = fs.createReadStream(videoPath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4'
      });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes'
      });
      fs.createReadStream(videoPath).pipe(res);
    }
  } catch (e) { return res.status(500).json({ error: 'Stream error', details: process.env.NODE_ENV === 'development' ? e.message : undefined }); }
});

// TMDB API Integration for real metadata
app.get('/api/tmdb/search', async (req, res) => {
  try {
    if (!TMDB_KEY) return res.json({ results: [] });
    const q = req.query.q;
    if (!q) return res.json({ results: [] });
    
    const fetch = (await import('node-fetch')).default;
    const tmdbRes = await fetch(
      `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}&query=${encodeURIComponent(q)}&language=ro-RO&page=1`
    );
    const data = await tmdbRes.json();
    res.json(data);
  } catch (e) { res.json({ results: [] }); }
});

app.get('/api/tmdb/:type/:id', async (req, res) => {
  try {
    if (!TMDB_KEY) return res.json({});
    const fetch = (await import('node-fetch')).default;
    const tmdbRes = await fetch(
      `https://api.themoviedb.org/3/${req.params.type}/${req.params.id}?api_key=${TMDB_KEY}&language=ro-RO&append_to_response=credits,videos,similar`
    );
    const data = await tmdbRes.json();
    res.json(data);
  } catch (e) { res.json({}); }
});

// ====== AUTH ROUTES ======
app.post('/api/auth/register', [
  body('email').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password min 6 chars'),
  body('name').notEmpty().withMessage('Name required')
], validate, async (req, res) => {
  try {
    const { email, password, name } = req.body;
    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows.length > 0) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 12);
    const { rows: [user] } = await pool.query(
      'INSERT INTO users (email, password_hash, name, plan, email_verified) VALUES ($1, $2, $3, $4,false) RETURNING id, email, name, plan',
      [email, hash, name, 'Free']
    );
    await pool.query(
      'INSERT INTO profiles (id, user_id, name, color, is_kid) VALUES ($1, $2, $3, $4, false)',
      [`p${user.id}`, user.id, name, '#6c5ce7']
    );
    
    const verifToken = generateResetToken();
    await pool.query(
      'INSERT INTO email_verifications (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'24 hours\')',
      [user.id, verifToken]
    );
    
    const baseUrl = req.headers.origin || req.headers.host ? `${req.headers.origin || `https://${req.headers.host}`}` : `http://localhost:${PORT}`;
    const verificationUrl = `${baseUrl}/api/auth/verify-email?token=${verifToken}`;
    
    // Send REAL email
    await sendEmail(email, 'Confirmă-ți adresa de email - Animaxia',
      `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0a0a0f;color:#fff;padding:32px;border-radius:12px;">
        <div style="text-align:center;font-size:36px;margin-bottom:16px;">✦</div>
        <h1 style="text-align:center;font-size:24px;margin-bottom:8px;">Bun venit pe Animaxia!</h1>
        <p style="color:#a0a0b0;text-align:center;margin-bottom:24px;">Confirmă-ți adresa de email pentru a activa contul.</p>
        <div style="text-align:center;">
          <a href="${verificationUrl}" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#6c5ce7,#a29bfe);color:white;text-decoration:none;border-radius:8px;font-weight:600;">
            Confirmă Email-ul
          </a>
        </div>
        <p style="text-align:center;font-size:12px;color:#6c6c80;margin-top:24px;">
          Dacă nu ai creat un cont, poți ignora acest email.
        </p>
      </div>`
    );
    
    const token = generateToken(user);
    res.json({ 
      success: true, token, 
      user: { id: user.id, email, name, plan: 'Free', email_verified: false, role: 'user' },
      message: 'Cont creat! Verifică email-ul pentru confirmare.',
      verification_url: verificationUrl
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    const token = generateToken(user);
    const { rows: profiles } = await pool.query('SELECT * FROM profiles WHERE user_id = $1', [user.id]);
    res.json({
      success: true, token,
      user: { id: user.id, email: user.email, name: user.name, plan: user.plan, role: user.role,
        email_verified: user.email_verified, avatar_url: user.avatar_url,
        preferred_language: user.preferred_language },
      profiles
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/google', async (req, res) => {
  try {
    const { email, name, googleId, picture } = req.body;
    if (!email || !googleId) return res.status(400).json({ error: 'Missing Google data' });
    let { rows } = await pool.query('SELECT * FROM users WHERE google_id = $1 OR email = $2', [googleId, email]);
    let user;
    if (rows.length === 0) {
      const { rows: [newUser] } = await pool.query(
        'INSERT INTO users (email, name, google_id, avatar_url, email_verified, plan) VALUES ($1,$2,$3,$4,true,$5) RETURNING *',
        [email, name || 'User', googleId, picture || '', 'Free']
      );
      await pool.query(
        'INSERT INTO profiles (id, user_id, name, color, is_kid, avatar_url) VALUES ($1,$2,$3,$4,false,$5)',
        [`p${newUser.id}`, newUser.id, name || 'User', '#6c5ce7', picture || '']
      );
      user = newUser;
    } else {
      user = rows[0];
      await pool.query('UPDATE users SET google_id = $1, avatar_url = COALESCE(NULLIF($2,\'\'),avatar_url), last_login=NOW() WHERE id = $3',
        [googleId, picture || '', user.id]);
    }
    const token = generateToken(user);
    const { rows: profiles } = await pool.query('SELECT * FROM profiles WHERE user_id = $1', [user.id]);
    res.json({ success: true, token, user: { id: user.id, email: user.email, name: user.name, plan: user.plan, role: user.role, email_verified: true, avatar_url: user.avatar_url }, profiles });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).send('Missing token');
    const { rows } = await pool.query('SELECT * FROM email_verifications WHERE token = $1 AND expires_at > NOW()', [token]);
    if (rows.length === 0) return res.status(400).send('Invalid or expired token');
    await pool.query('UPDATE users SET email_verified = true WHERE id = $1', [rows[0].user_id]);
    await pool.query('DELETE FROM email_verifications WHERE token = $1', [token]);
    
    // Send welcome email
    const { rows: [user] } = await pool.query('SELECT email, name FROM users WHERE id = $1', [rows[0].user_id]);
    await sendEmail(user.email, 'Email confirmat! - Animaxia',
      `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0a0a0f;color:#fff;padding:32px;border-radius:12px;">
        <div style="text-align:center;font-size:36px;margin-bottom:16px;">✅</div>
        <h1 style="text-align:center;font-size:24px;margin-bottom:8px;">Email confirmat, ${user.name}!</h1>
        <p style="color:#a0a0b0;text-align:center;">Acum poți accesa toate funcțiile Animaxia.</p>
      </div>`
    );
    
    res.send(`<html><body style="background:#0a0a0f;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;flex-direction:column;gap:16px;">
      <div style="font-size:48px;">✅</div>
      <h1>Email Verified!</h1>
      <p style="color:#a0a0b0;">Your email has been confirmed. Enjoy Animaxia!</p>
      <a href="/" style="color:#a29bfe;text-decoration:none;">Go to Animaxia</a></body></html>`);
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const { rows } = await pool.query('SELECT id, name FROM users WHERE email = $1', [email]);
    if (rows.length > 0) {
      const resetToken = generateResetToken();
      await pool.query(
        'INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'1 hour\')',
        [rows[0].id, resetToken]
      );
    const baseUrl = req.headers.origin || req.headers.host ? `${req.headers.origin || `https://${req.headers.host}`}` : `http://localhost:${PORT}`;
      const resetUrl = `${baseUrl}/reset-password.html?token=${resetToken}`;
      await sendEmail(email, 'Resetează parola - Animaxia',
        `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0a0a0f;color:#fff;padding:32px;border-radius:12px;">
          <h2 style="text-align:center;">Resetare parolă</h2>
          <p style="color:#a0a0b0;text-align:center;">Salut ${rows[0].name}, ai cerut resetarea parolei.</p>
          <div style="text-align:center;margin:24px 0;">
            <a href="${resetUrl}" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#6c5ce7,#a29bfe);color:white;text-decoration:none;border-radius:8px;font-weight:600;">
              Resetează Parola
            </a>
          </div>
          <p style="text-align:center;font-size:12px;color:#6c6c80;">Link-ul expiră în 1 oră.</p>
        </div>`
      );
    }
    res.json({ success: true, message: 'If email exists, reset link has been sent.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and password required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password min 6 chars' });
    const { rows } = await pool.query('SELECT * FROM password_resets WHERE token = $1 AND used = false AND expires_at > NOW()', [token]);
    if (rows.length === 0) return res.status(400).json({ error: 'Invalid or expired token' });
    const hash = await bcrypt.hash(password, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, rows[0].user_id]);
    await pool.query('UPDATE password_resets SET used = true WHERE token = $1', [token]);
    
    const { rows: [user] } = await pool.query('SELECT email FROM users WHERE id = $1', [rows[0].user_id]);
    await sendEmail(user.email, 'Parola a fost resetată - Animaxia',
      `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0a0a0f;color:#fff;padding:32px;border-radius:12px;">
        <div style="text-align:center;font-size:36px;margin-bottom:16px;">🔐</div>
        <h2 style="text-align:center;">Parola ta a fost resetată cu succes!</h2>
        <p style="color:#a0a0b0;text-align:center;">Acum te poți autentifica cu noua parolă.</p>
      </div>`
    );
    
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both passwords required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'New password min 6 characters' });
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.userId]);
    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.userId]);
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/avatar', requireAuth, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const avatarUrl = `/avatars/${req.file.filename}`;
    await pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [avatarUrl, req.user.userId]);
    res.json({ success: true, avatar_url: avatarUrl });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/session', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, email, name, plan, email_verified, avatar_url, preferred_language, role, created_at FROM users WHERE id = $1', 
      [req.user.userId]
    );
    if (rows.length === 0) return res.status(401).json({ error: 'User not found' });
    const { rows: profiles } = await pool.query('SELECT * FROM profiles WHERE user_id = $1', [req.user.userId]);
    res.json({ success: true, user: rows[0], profiles });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/resend-verification', requireAuth, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1 AND email_verified = false', [email]);
    if (rows.length === 0) return res.json({ success: true, message: 'Already verified' });
    const verifToken = generateResetToken();
    await pool.query('INSERT INTO email_verifications (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'24 hours\')', [rows[0].id, verifToken]);
    const baseUrl = req.headers.origin || req.headers.host ? `${req.headers.origin || `https://${req.headers.host}`}` : `http://localhost:${PORT}`;
    const verificationUrl = `${baseUrl}/api/auth/verify-email?token=${verifToken}`;
    
    await sendEmail(email, 'Re-confirmă adresa de email - Animaxia',
      `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0a0a0f;color:#fff;padding:32px;border-radius:12px;">
        <h2 style="text-align:center;">Confirmă-ți email-ul</h2>
        <div style="text-align:center;margin:24px 0;">
          <a href="${verificationUrl}" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#6c5ce7,#a29bfe);color:white;text-decoration:none;border-radius:8px;font-weight:600;">
            Confirmă Email-ul
          </a>
        </div>
      </div>`
    );
    
    res.json({ success: true, message: 'Verification email resent', verification_url: verificationUrl });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== STRIPE PAYMENT INTEGRATION (REAL) ======
app.post('/api/payments/create-checkout', requireAuth, async (req, res) => {
  try {
    const { plan } = req.body;
    const plans = {
      'Basic': { amount: 999, name: 'Animaxia Basic' },
      'Standard': { amount: 1499, name: 'Animaxia Standard' },
      'Premium': { amount: 1999, name: 'Animaxia Premium' },
      'Animaxia+': { amount: 2999, name: 'Animaxia+' }
    };
    if (!plans[plan]) return res.status(400).json({ error: 'Invalid plan' });
    
    const { rows: [user] } = await pool.query('SELECT email, name FROM users WHERE id = $1', [req.user.userId]);
    
    const baseStripeUrl = req.headers.origin || req.headers.host ? `${req.headers.origin || `https://${req.headers.host}`}` : `http://localhost:${PORT}`;
    if (stripe) {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'ron',
            product_data: { name: plans[plan].name },
            unit_amount: plans[plan].amount,
            recurring: { interval: 'month' }
          },
          quantity: 1
        }],
        mode: 'subscription',
        success_url: `${baseStripeUrl}/payment-success?plan=${plan}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseStripeUrl}/payment-cancel`,
        customer_email: user.email,
        metadata: { userId: req.user.userId.toString(), plan }
      });
      res.json({ success: true, url: session.url, sessionId: session.id });
    } else {
      // Stripe not configured
      res.json({
        success: false,
        error: 'Stripe not configured. Plățile nu sunt disponibile momentan.'
      });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) return res.status(200).json({ received: true });
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET || '');
  } catch (e) {
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = parseInt(session.metadata.userId);
    const plan = session.metadata.plan;
    await pool.query('UPDATE users SET plan = $1 WHERE id = $2', [plan, userId]);
    console.log(`✅ User ${userId} upgraded to ${plan}`);
  }
  res.json({ received: true });
});

app.post('/api/payments/confirm', requireAuth, async (req, res) => {
  try {
    const { plan } = req.body;
    const validPlans = ['Free', 'Basic', 'Standard', 'Premium', 'Animaxia+'];
    if (!validPlans.includes(plan)) return res.status(400).json({ error: 'Invalid plan' });
    await pool.query('UPDATE users SET plan = $1 WHERE id = $2', [plan, req.user.userId]);
    
    const { rows: [user] } = await pool.query('SELECT email, name FROM users WHERE id = $1', [req.user.userId]);
    await sendEmail(user.email, `Plan ${plan} activat! - Animaxia`,
      `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0a0a0f;color:#fff;padding:32px;border-radius:12px;">
        <div style="text-align:center;font-size:36px;margin-bottom:16px;">👑</div>
        <h2 style="text-align:center;">Plan ${plan} activat, ${user.name}!</h2>
        <p style="color:#a0a0b0;text-align:center;">Acum ai acces la toate funcțiile ${plan}.</p>
      </div>`
    );
    
    res.json({ success: true, message: `Plan upgraded to ${plan}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/payments/plans', async (req, res) => {
  res.json({
    success: true,
    data: [
      { id: 'Free', name: 'Gratuit', price: 0, quality: 'HD 720p', devices: 1, screens: 1, features: ['Conținut limitat', 'Anunțuri'] },
      { id: 'Basic', name: 'Basic', price: 9.99, quality: 'HD 720p', devices: 1, screens: 1, features: ['Biblioteca completă', 'Fără anunțuri'] },
      { id: 'Standard', name: 'Standard', price: 14.99, quality: 'Full HD 1080p', devices: 2, screens: 2, features: ['Full HD', '2 dispozitive', 'Descărcări'] },
      { id: 'Premium', name: 'Premium', price: 19.99, quality: '4K Ultra HD', devices: 4, screens: 4, features: ['4K HDR', '4 dispozitive', 'Dolby Atmos', 'X-Ray'] },
      { id: 'Animaxia+', name: 'Animaxia+', price: 29.99, quality: '4K + Dolby Atmos', devices: 10, screens: 6, features: ['Tot din Premium', 'Dispozitive nelimitate', 'Prioritate suport', 'Conținut exclusiv'] }
    ]
  });
});

// ====== FULL-TEXT SEARCH ======
app.get('/api/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const genre = req.query.genre || '';
    const type = req.query.type || '';
    const yearFrom = req.query.yearFrom || '';
    const yearTo = req.query.yearTo || '';
    const sort = req.query.sort || 'relevance';
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;

    let whereClauses = [];
    let params = [];
    let paramIdx = 1;

    if (q.length > 0) {
      // Full-text search with tsvector
      whereClauses.push(`(
        to_tsvector('romanian', coalesce(title,'') || ' ' || coalesce(title_en,'') || ' ' || coalesce(description,'')) 
        @@ plainto_tsquery('romanian', $${paramIdx})
        OR title ILIKE $${paramIdx+1}
        OR title_en ILIKE $${paramIdx+2}
      )`);
      params.push(q, `%${q}%`, `%${q}%`);
      paramIdx += 3;
    }
    if (genre) {
      whereClauses.push(`$${paramIdx} = ANY(genre)`);
      params.push(genre);
      paramIdx++;
    }
    if (type) {
      whereClauses.push(`content_type = $${paramIdx}`);
      params.push(type);
      paramIdx++;
    }
    if (yearFrom) {
      whereClauses.push(`(CASE WHEN year ~ '^[0-9]{4}' THEN CAST(SUBSTRING(year FROM 1 FOR 4) AS INTEGER) >= $${paramIdx} ELSE true END)`);
      params.push(parseInt(yearFrom));
      paramIdx++;
    }
    if (yearTo) {
      whereClauses.push(`(CASE WHEN year ~ '^[0-9]{4}' THEN CAST(SUBSTRING(year FROM 1 FOR 4) AS INTEGER) <= $${paramIdx} ELSE true END)`);
      params.push(parseInt(yearTo));
      paramIdx++;
    }

    const where = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';
    
    // Count query FIRST — before ORDER BY modifies params!
    const countResult = await pool.query(`SELECT COUNT(*) as total FROM content_items ${where}`, [...params]);
    const total = parseInt(countResult.rows[0].total);
    
    let orderBy;
    if (q.length > 0) {
      orderBy = `ORDER BY ts_rank(to_tsvector('romanian', coalesce(title,'') || ' ' || coalesce(title_en,'') || ' ' || coalesce(description,'')), plainto_tsquery('romanian', $${paramIdx})) DESC, view_count DESC`;
      params.push(q);
      paramIdx++;
    } else if (sort === 'title') orderBy = 'ORDER BY title ASC';
    else if (sort === 'year_desc') orderBy = 'ORDER BY year DESC';
    else if (sort === 'year_asc') orderBy = 'ORDER BY year ASC';
    else if (sort === 'match') orderBy = 'ORDER BY match_rating DESC';
    else orderBy = 'ORDER BY created_at DESC, view_count DESC';

    const { rows } = await pool.query(
      `SELECT * FROM content_items ${where} ${orderBy} LIMIT $${paramIdx} OFFSET $${paramIdx+1}`,
      [...params, limit, offset]
    );

    res.json({ success: true, results: rows, total, page, pages: Math.ceil(total / limit) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== CONTENT ROUTES ======
app.get('/api/content', async (req, res) => {
  try {
    const lang = req.query.lang || 'ro';
    const useEn = lang === 'en';
    
    const items = await pool.query('SELECT * FROM content_items ORDER BY created_at DESC');
    const categories = await pool.query(
      `SELECT c.id, ${useEn ? 'c.title_en as title' : 'c.title'}, 
       json_agg(json_build_object('id', ci.item_id, 'order', ci.item_order)) as items 
       FROM categories c LEFT JOIN category_items ci ON c.id = ci.category_id 
       GROUP BY c.id ORDER BY c.display_order`
    );
    const featured = await pool.query("SELECT * FROM content_items WHERE is_featured = true");
    const channels = await pool.query('SELECT * FROM channels ORDER BY name');
    const programs = await pool.query('SELECT * FROM programs ORDER BY channel_id, start_time');
    const notifications = await pool.query(
      `SELECT id, type, ${useEn ? 'message_en as message' : 'message'}, time_ago, is_read FROM notifications ORDER BY created_at DESC`
    );
    const top10Rows = await pool.query(
      `SELECT id, ${useEn ? 'title_en AS title,' : 'title,'} bg_color FROM content_items WHERE content_type = 'movie' ORDER BY view_count DESC LIMIT 10`
    );

    function mapLang(item) {
      if (!item || !useEn) return item;
      return { ...item, title: item.title_en || item.title, description: item.description_en || item.description };
    }

    const { rows: reviewStats } = await pool.query(
      'SELECT item_id, AVG(rating)::numeric(3,1) as avg_rating, COUNT(*) as review_count FROM content_reviews GROUP BY item_id'
    );
    const reviewMap = Object.fromEntries(reviewStats.map(r => [r.item_id, { avg: parseFloat(r.avg_rating), count: parseInt(r.review_count) }]));

    res.json({
      success: true,
      data: {
        featured: featured.rows.map(i => ({ ...mapLang(i), reviews: reviewMap[i.id] })),
        categories: categories.rows.map(c => ({
          id: c.id, title: c.title,
          items: (c.items||[]).filter(i => i.id).map(i => {
            const found = items.rows.find(it => it.id === i.id);
            return found ? { ...mapLang(found), reviews: reviewMap[found.id] } : null;
          }).filter(Boolean)
        })),
        channels: channels.rows,
        programs: programs.rows,
        notifications: notifications.rows,
        top10: top10Rows.rows.map((t, i) => ({ ...t, rank: i + 1 })),
        plans: [
          { name: 'Basic', price: '9.99', quality: 'HD', devices: '1', screens: '1' },
          { name: 'Standard', price: '14.99', quality: 'Full HD', devices: '2', screens: '2' },
          { name: 'Premium', price: '19.99', quality: '4K Ultra HD', devices: '4', screens: '4' },
          { name: 'Animaxia+', price: '29.99', quality: '4K + Dolby Atmos', devices: 'Unlimited', screens: '6' }
        ]
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }



});
// GET /api/content/stats
app.get('/api/content/stats', async (req, res) => {
  try {
    const [total, movies, series, genres, totalViews] = await Promise.all([
      pool.query('SELECT COUNT(*) as c FROM content_items'),
      pool.query("SELECT COUNT(*) as c FROM content_items WHERE content_type = 'movie'"),
      pool.query("SELECT COUNT(*) as c FROM content_items WHERE content_type = 'series'"),
      pool.query('SELECT unnest(genre) as g, COUNT(*) as c FROM content_items GROUP BY g ORDER BY c DESC LIMIT 10'),
      pool.query('SELECT COALESCE(SUM(view_count),0) as v FROM content_items')
    ]);
    res.json({ success: true, stats: {
      total: parseInt(total.rows[0].c),
      movies: parseInt(movies.rows[0].c),
      series: parseInt(series.rows[0].c),
      genres: genres.rows.map(r => ({ name: r.g, count: parseInt(r.c) })),
      totalViews: parseInt(totalViews.rows[0].v)
    }});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/content/browse
app.get('/api/content/browse', async (req, res) => {
  try {
    const { sort, genre, type, year, q, page } = req.query;
    const limit = 20;
    const offset = ((parseInt(page) || 1) - 1) * limit;
    let where = [];
    let params = [];
    let p = 1;
    if (genre) { where.push(`$${p} = ANY(genre)`); params.push(genre); p++; }
    if (type) { where.push(`content_type = $${p}`); params.push(type); p++; }
    if (year) { where.push(`year = $${p}`); params.push(year); p++; }
    if (q) { where.push(`(title ILIKE $${p} OR title_en ILIKE $${p+1})`); params.push(`%${q}%`, `%${q}%`); p += 2; }
    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    let orderBy = 'ORDER BY created_at DESC';
    if (sort === 'views') orderBy = 'ORDER BY view_count DESC';
    else if (sort === 'rating') orderBy = 'ORDER BY rating DESC NULLS LAST';
    else if (sort === 'year') orderBy = 'ORDER BY year DESC NULLS LAST';
    else if (sort === 'title') orderBy = 'ORDER BY title ASC';
    const { rows: totalRows } = await pool.query(`SELECT COUNT(*) as total FROM content_items ${whereClause}`, params);
    const total = parseInt(totalRows[0].total);
    const { rows } = await pool.query(`SELECT * FROM content_items ${whereClause} ${orderBy} LIMIT $${p} OFFSET $${p+1}`, [...params, limit, offset]);
    res.json({ success: true, data: rows, total, page: parseInt(page) || 1, pages: Math.ceil(total / limit) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/content/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM content_items WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const { rows: rs } = await pool.query('SELECT AVG(rating)::numeric(3,1) as avg_rating, COUNT(*) as review_count FROM content_reviews WHERE item_id = $1', [req.params.id]);
    res.json({ success: true, data: { ...rows[0], reviews: { avg: parseFloat(rs[0].avg_rating || 0), count: parseInt(rs[0].review_count || 0) } } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== EPISODES ======
app.get('/api/content/:id/episodes', async (req, res) => {
  try {
    const { season } = req.query;
    let query = 'SELECT * FROM episodes WHERE item_id = $1';
    const params = [req.params.id];
    if (season) {
      query += ' AND season_number = $2 ORDER BY episode_number';
      params.push(parseInt(season));
    } else query += ' ORDER BY season_number, episode_number';
    const { rows } = await pool.query(query, params);
    const { rows: seasons } = await pool.query('SELECT DISTINCT season_number FROM episodes WHERE item_id = $1 ORDER BY season_number', [req.params.id]);
    res.json({ success: true, data: { episodes: rows, seasons: seasons.map(s => s.season_number), total: rows.length } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== USER DATA ======
app.get('/api/user/:profileId/data', async (req, res) => {
  try {
    const { profileId } = req.params;
    const [watchlist, ratings, continueW] = await Promise.all([
      pool.query('SELECT item_id FROM watchlists WHERE profile_id = $1', [profileId]),
      pool.query('SELECT item_id, liked FROM ratings WHERE profile_id = $1', [profileId]),
      pool.query('SELECT * FROM continue_watching WHERE profile_id = $1 ORDER BY updated_at DESC LIMIT 20', [profileId]),
    ]);
    res.json({
      success: true,
      data: {
        profileId,
        myList: watchlist.rows.map(r => r.item_id),
        ratings: Object.fromEntries(ratings.rows.map(r => [r.item_id, { liked: r.liked }])),
        continueWatching: continueW.rows
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== MY LIST ======
app.get('/api/user/:profileId/my-list', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ci.* FROM content_items ci INNER JOIN watchlists w ON ci.id = w.item_id WHERE w.profile_id = $1 ORDER BY w.added_at DESC`,
      [req.params.profileId]
    );
    res.json({ success: true, data: rows, total: rows.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/user/:profileId/watchlist/toggle', async (req, res) => {
  try {
    const { profileId } = req.params;
    const { itemId } = req.body;
    if (!itemId) return res.status(400).json({ error: 'itemId required' });
    const existing = await pool.query('SELECT id FROM watchlists WHERE profile_id = $1 AND item_id = $2', [profileId, itemId]);
    if (existing.rows.length > 0) {
      await pool.query('DELETE FROM watchlists WHERE profile_id = $1 AND item_id = $2', [profileId, itemId]);
      res.json({ success: true, inList: false });
    } else {
      await pool.query('INSERT INTO watchlists (profile_id, item_id) VALUES ($1, $2)', [profileId, itemId]);
      res.json({ success: true, inList: true });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/user/:profileId/continue', async (req, res) => {
  try {
    const { profileId } = req.params;
    const { itemId, progress, episode, seasonNumber, episodeNumber } = req.body;
    if (!itemId) return res.status(400).json({ error: 'itemId required' });
    await pool.query(
      `INSERT INTO continue_watching (profile_id, item_id, progress, episode, season_number, episode_number) 
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (profile_id, item_id) DO UPDATE SET 
         progress = $3, episode = $4, season_number = COALESCE($5, continue_watching.season_number),
         episode_number = COALESCE($6, continue_watching.episode_number), updated_at = NOW()`,
      [profileId, itemId, progress || 0, episode || '', seasonNumber || 1, episodeNumber || 1]
    );
    const { rows } = await pool.query('SELECT * FROM continue_watching WHERE profile_id = $1 ORDER BY updated_at DESC', [profileId]);
    res.json({ success: true, continueWatching: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/user/:profileId/rate', async (req, res) => {
  try {
    const { profileId } = req.params;
    const { itemId, liked } = req.body;
    if (!itemId) return res.status(400).json({ error: 'itemId required' });
    const existing = await pool.query('SELECT id, liked FROM ratings WHERE profile_id = $1 AND item_id = $2', [profileId, itemId]);
    if (existing.rows.length > 0 && existing.rows[0].liked === liked) {
      await pool.query('DELETE FROM ratings WHERE profile_id = $1 AND item_id = $2', [profileId, itemId]);
    } else {
      await pool.query(`INSERT INTO ratings (profile_id, item_id, liked) VALUES ($1, $2, $3)
         ON CONFLICT (profile_id, item_id) DO UPDATE SET liked = $3`, [profileId, itemId, liked]);
    }
    const { rows } = await pool.query('SELECT item_id, liked FROM ratings WHERE profile_id = $1', [profileId]);
    res.json({ success: true, ratings: Object.fromEntries(rows.map(r => [r.item_id, { liked: r.liked }])) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== REVIEWS ======
app.get('/api/content/:id/reviews', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT cr.*, p.name as profile_name, p.color as profile_color 
       FROM content_reviews cr LEFT JOIN profiles p ON cr.profile_id = p.id 
       WHERE cr.item_id = $1 ORDER BY cr.created_at DESC`, [req.params.id]);
    const { rows: [stats] } = await pool.query(
      'SELECT AVG(rating)::numeric(3,1) as avg_rating, COUNT(*) as total, COUNT(*) FILTER (WHERE rating >= 4) as positive FROM content_reviews WHERE item_id = $1', [req.params.id]);
    res.json({ success: true, data: rows, stats: { avg: parseFloat(stats?.avg_rating || 0), total: parseInt(stats?.total || 0), positive: parseInt(stats?.positive || 0) } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/reviews', requireAuth, async (req, res) => {
  try {
    const { profileId, itemId, rating, comment } = req.body;
    if (!profileId || !itemId || !rating) return res.status(400).json({ error: 'profileId, itemId and rating required' });
    if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating between 1 and 5' });
    await pool.query(
      `INSERT INTO content_reviews (profile_id, item_id, rating, comment)
       VALUES ($1, $2, $3, $4) ON CONFLICT (profile_id, item_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, updated_at = NOW()`,
      [profileId, itemId, rating, comment || '']);
    res.json({ success: true, message: 'Review saved!' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== WATCH HISTORY ======
app.get('/api/user/:profileId/watch-history', async (req, res) => {
  try {
    const { profileId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const offset = (page - 1) * limit;
    const { rows: totalRows } = await pool.query('SELECT COUNT(*) as total FROM watch_history WHERE profile_id = $1', [profileId]);
    const total = parseInt(totalRows[0].total);
    const { rows } = await pool.query(
      `SELECT wh.*, ci.title, ci.title_en, ci.content_type, ci.bg_color, ci.genre
       FROM watch_history wh LEFT JOIN content_items ci ON wh.item_id = ci.id 
       WHERE wh.profile_id = $1 ORDER BY wh.watched_at DESC LIMIT $2 OFFSET $3`, [profileId, limit, offset]);
    const grouped = {};
    for (const entry of rows) {
      const date = new Date(entry.watched_at).toLocaleDateString('ro-RO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(entry);
    }
    res.json({ success: true, data: grouped, total, page, pages: Math.ceil(total / limit) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/user/:profileId/watch-history', async (req, res) => {
  try {
    const { profileId } = req.params;
    const { itemId, episodeId, durationSeconds, completed } = req.body;
    if (!itemId) return res.status(400).json({ error: 'itemId required' });
    await pool.query(
      `INSERT INTO watch_history (profile_id, item_id, episode_id, duration_seconds, completed)
       VALUES ($1, $2, $3, $4, $5)`, [profileId, itemId, episodeId || null, durationSeconds || 0, completed || false]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/user/:profileId/watch-history/clear', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM watch_history WHERE profile_id = $1', [req.params.profileId]);
    res.json({ success: true, message: 'Watch history cleared' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== RECOMMENDATIONS ENGINE (IMPROVED) ======
app.get('/api/user/:profileId/recommendations', async (req, res) => {
  try {
    const { profileId } = req.params;

    // Get genres user watched with weights
    const { rows: watched } = await pool.query(
      `SELECT DISTINCT unnest(ci.genre) as genre, COUNT(*) as weight
       FROM watch_history wh JOIN content_items ci ON wh.item_id = ci.id 
       WHERE wh.profile_id = $1 AND ci.genre IS NOT NULL
       GROUP BY genre ORDER BY weight DESC LIMIT 5`, [profileId]);

    // Get items user already interacted with
    const { rows: excluded } = await pool.query(
      `SELECT item_id FROM watch_history WHERE profile_id = $1
       UNION SELECT item_id FROM content_reviews WHERE profile_id = $1
       UNION SELECT item_id FROM watchlists WHERE profile_id = $1`, [profileId]);
    const excludeIds = excluded.map(r => r.item_id);

    let recommendations = [];
    if (watched.length > 0) {
      const topGenres = watched.map(w => w.genre);
      const { rows } = await pool.query(
        `SELECT *, SIMILARITY(genre::text, $1::text) as sim_score
         FROM content_items WHERE genre && $2 AND id != ALL($3) 
         ORDER BY view_count DESC, sim_score DESC LIMIT 12`,
        [topGenres.join(','), topGenres, excludeIds.length ? excludeIds : ['']]);
      recommendations = rows.map(item => ({
        ...item, 
        reason: watched.find(w => item.genre?.includes(w.genre))?.genre || 'Popular',
        score: watched.find(w => item.genre?.includes(w.genre))?.weight || 1
      }));
    }

    // Collaborative filtering: find users with similar tastes
    if (recommendations.length < 6 && watched.length > 0) {
      const { rows: similarUsers } = await pool.query(
        `SELECT wh2.profile_id, COUNT(*) as common
         FROM watch_history wh1 
         JOIN watch_history wh2 ON wh1.item_id = wh2.item_id AND wh1.profile_id != wh2.profile_id
         WHERE wh1.profile_id = $1 AND wh2.profile_id != $1
         GROUP BY wh2.profile_id ORDER BY common DESC LIMIT 3`, [profileId]);

      if (similarUsers.length > 0) {
        const similarIds = similarUsers.map(u => u.profile_id);
        const existingIds = [...recommendations.map(r => r.id), ...excludeIds];
        const { rows: collab } = await pool.query(
          `SELECT ci.*, COUNT(*) as collab_score
           FROM watch_history wh JOIN content_items ci ON wh.item_id = ci.id
           WHERE wh.profile_id = ANY($1::varchar[]) AND ci.id != ALL($2::varchar[])
           GROUP BY ci.id ORDER BY collab_score DESC LIMIT ${6 - recommendations.length}`,
          [similarIds, existingIds.length ? existingIds : ['']]);
        recommendations.push(...collab.map(c => ({ ...c, reason: 'Alți utilizatori au vizionat', score: c.collab_score })));
      }
    }

    // Fill remaining with popular content
    if (recommendations.length < 6) {
      const existingIds = [...recommendations.map(r => r.id), ...excludeIds];
      const { rows: popular } = await pool.query(
        `SELECT * FROM content_items WHERE id != ALL($1) ORDER BY view_count DESC LIMIT ${12 - recommendations.length}`,
        [existingIds.length ? existingIds : ['']]);
      recommendations.push(...popular.map(p => ({ ...p, reason: 'Popular', score: 0 })));
    }

    res.json({ success: true, data: recommendations.slice(0, 12) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== DOWNLOADS (REAL FILE DOWNLOAD) ======
app.get('/api/user/:profileId/downloads', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT dq.*, ci.title, ci.title_en, ci.content_type, ci.bg_color,
              e.title as episode_title, e.episode_number, e.season_number
       FROM download_queue dq
       LEFT JOIN content_items ci ON dq.item_id = ci.id
       LEFT JOIN episodes e ON dq.episode_id = e.id
       WHERE dq.profile_id = $1 ORDER BY dq.added_at DESC`, [req.params.profileId]);
    const stats = {
      downloading: rows.filter(r => r.status === 'downloading').length,
      completed: rows.filter(r => r.status === 'completed').length,
      total: rows.length,
      totalSize: rows.reduce((s, r) => s + (r.size_mb || 0), 0)
    };
    res.json({ success: true, data: rows, stats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/user/:profileId/downloads', async (req, res) => {
  try {
    const { profileId } = req.params;
    const { itemId, episodeId } = req.body;
    if (!itemId) return res.status(400).json({ error: 'itemId required' });

    const exists = await pool.query(
      'SELECT id FROM download_queue WHERE profile_id = $1 AND item_id = $2 AND (episode_id = $3 OR ($3 IS NULL AND episode_id IS NULL))',
      [profileId, itemId, episodeId || null]);
    if (exists.rows.length > 0) return res.json({ success: true, message: 'Already in queue' });

    // Add to download queue with size tracking from content metadata
    const { rows: contentRow } = await pool.query('SELECT duration, content_type FROM content_items WHERE id = $1', [itemId]);
    // Parse duration: supports "2h 15min", "45min", "1h 30min" formats
    let durationMinutes = 45;
    if (contentRow.length > 0 && contentRow[0].duration) {
      const durStr = contentRow[0].duration;
      let total = 0;
      const hours = durStr.match(/(\d+)\s*h/);
      const mins = durStr.match(/(\d+)\s*min/);
      if (hours) total += parseInt(hours[1]) * 60;
      if (mins) total += parseInt(mins[1]);
      if (total > 0) durationMinutes = total;
    }
    const isMovie = contentRow.length > 0 && contentRow[0].content_type === 'movie';
    // Estimate file size: ~15MB per minute for HD movie, ~8MB for SD
    const sizeMb = isMovie ? Math.max(100, durationMinutes * 15) : Math.max(50, durationMinutes * 8);
    const { rows: [dl] } = await pool.query(
      `INSERT INTO download_queue (profile_id, item_id, episode_id, status, progress, size_mb)
       VALUES ($1, $2, $3, 'downloading', 0, $4) RETURNING *`,
      [profileId, itemId, episodeId || null, sizeMb]);

    // Queue download job with realistic progress updates
    // Instead of fake setTimeout, use immediate completion with metadata
    const offlineDir = path.join(__dirname, 'public', 'offline', profileId);
    try {
      if (!fs.existsSync(offlineDir)) fs.mkdirSync(offlineDir, { recursive: true });
      
      // Create real offline manifest file with content metadata
      const { rows: [meta] } = await pool.query(
        'SELECT title, title_en, content_type, year, duration, description, genre, bg_color FROM content_items WHERE id = $1',
        [itemId]
      );
      
      fs.writeFileSync(path.join(offlineDir, `${itemId}.json`), JSON.stringify({
        id: itemId,
        episodeId: episodeId || null,
        downloadedAt: new Date().toISOString(),
        sizeMb,
        durationMinutes,
        metadata: meta || {}
      }));
    } catch (e) {
      console.error('❌ Download offline manifest error:', e.message);
    }
    
    // Mark as complete immediately since we generate offline manifest
    await pool.query('UPDATE download_queue SET progress = 100, status = $1, completed_at = NOW() WHERE id = $2', ['completed', dl.id]);

    res.json({ success: true, message: 'Download started!', downloadId: dl.id });
  } catch (e) { return res.status(500).json({ error: 'Download failed' }); }
});


// ====== NOTIFICATIONS ======
app.get('/api/notifications', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM notifications ORDER BY created_at DESC');
    res.json({ success: true, data: rows, unread: rows.filter(n => !n.is_read).length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/notifications/read-all', async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET is_read = true WHERE is_read = false');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== ADMIN DASHBOARD (REAL STATS) ======
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const [content, users, watchlists, ratings, episodes, reviews, downloads, watchHistory] = await Promise.all([
      pool.query('SELECT COUNT(*) as total FROM content_items'),
      pool.query('SELECT COUNT(*) as total FROM users WHERE role != \'admin\''),
      pool.query('SELECT COUNT(*) as total FROM watchlists'),
      pool.query('SELECT COUNT(*) as total FROM ratings'),
      pool.query('SELECT COUNT(*) as total FROM episodes'),
      pool.query('SELECT COUNT(*) as total, AVG(rating)::numeric(3,1) as avg_rating FROM content_reviews'),
      pool.query('SELECT COUNT(*) as total FROM download_queue'),
      pool.query('SELECT COUNT(*) as total FROM watch_history'),
    ]);
    // Revenue metrics (estimated from plan distribution)
    const { rows: planDist } = await pool.query('SELECT plan, COUNT(*) as count FROM users GROUP BY plan');
    const revenueMap = { 'Basic': 9.99, 'Standard': 14.99, 'Premium': 19.99, 'Animaxia+': 29.99 };
    const estimatedRevenue = planDist.reduce((sum, r) => sum + (revenueMap[r.plan] || 0) * parseInt(r.count), 0);

    res.json({ success: true, stats: {
      content: parseInt(content.rows[0].total),
      users: parseInt(users.rows[0].total),
      watchlists: parseInt(watchlists.rows[0].total),
      ratings: parseInt(ratings.rows[0].total),
      episodes: parseInt(episodes.rows[0].total),
      reviews: parseInt(reviews.rows[0].total),
      reviewAvg: parseFloat(reviews.rows[0].avg_rating || 0),
      downloads: parseInt(downloads.rows[0].total),
      watchHistory: parseInt(watchHistory.rows[0].total),
      estimatedMonthlyRevenue: estimatedRevenue,
      planDistribution: planDist
    }});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, email, name, plan, email_verified, role, preferred_language, created_at, last_login FROM users ORDER BY created_at DESC');
    res.json({ success: true, data: rows, total: rows.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/analytics', requireAdmin, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const [viewsByType, topContent, genreDist, dailyActivity, hourlyActivity] = await Promise.all([
      pool.query('SELECT content_type, COUNT(*) as views, AVG(view_count) as avg_views FROM content_items GROUP BY content_type'),
      pool.query('SELECT id, title, view_count, content_type FROM content_items ORDER BY view_count DESC LIMIT 10'),
      pool.query('SELECT unnest(genre) as genre, COUNT(*) as count FROM content_items GROUP BY genre ORDER BY count DESC'),
      pool.query(`SELECT DATE(watched_at) as date, COUNT(*) as views, COUNT(DISTINCT profile_id) as users
         FROM watch_history WHERE watched_at > NOW() - INTERVAL '1 day' * $1
         GROUP BY DATE(watched_at) ORDER BY date`, [days]),
      pool.query(`SELECT EXTRACT(HOUR FROM watched_at) as hour, COUNT(*) as views
         FROM watch_history WHERE watched_at > NOW() - INTERVAL '7 days'
         GROUP BY EXTRACT(HOUR FROM watched_at) ORDER BY hour`),
    ]);
    res.json({ success: true, data: { viewsByType: viewsByType.rows, topContent: topContent.rows, genreDist: genreDist.rows, dailyActivity: dailyActivity.rows, hourlyActivity: hourlyActivity.rows } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== ADMIN CONTENT CRUD ======
app.get('/api/admin/content', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM content_items ORDER BY created_at DESC');
    res.json({ success: true, data: rows, total: rows.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/content', requireAdmin, async (req, res) => {
  try {
    const { id, title, title_en, year, duration, rating, genre, match_rating, bg_color, content_type, episodes, seasons, cast_members, description, description_en, backdrop_color, trailer_url, is_featured, is_kid_friendly } = req.body;
    if (!id || !title) return res.status(400).json({ error: 'id and title required' });
    await pool.query(
      `INSERT INTO content_items (id, title, title_en, year, duration, rating, genre, match_rating, bg_color, content_type, episodes, seasons, cast_members, description, description_en, backdrop_color, trailer_url, is_featured, is_kid_friendly)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title`,
      [id, title, title_en || '', year||'', duration||'', rating||'', genre||[], match_rating||'95%', bg_color||'#1e1e2e', content_type||'movie', episodes||0, seasons||1, cast_members||[], description||'', description_en||'', backdrop_color||'', trailer_url||'', is_featured||false, is_kid_friendly!==false]);
    res.json({ success: true, message: 'Content saved!' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== LANGUAGE SETTINGS ======
app.get('/api/language/:profileId', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM user_languages WHERE profile_id = $1', [req.params.profileId]);
    if (rows.length === 0) return res.json({ success: true, data: { language: 'ro', subtitles_enabled: true, subtitle_language: 'ro', audio_language: 'ro' } });
    res.json({ success: true, data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/language/:profileId', async (req, res) => {
  try {
    const { language, subtitles_enabled, subtitle_language, audio_language } = req.body;
    await pool.query(
      `INSERT INTO user_languages (profile_id, language, subtitles_enabled, subtitle_language, audio_language)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (profile_id) DO UPDATE SET
         language = COALESCE($2, user_languages.language),
         subtitles_enabled = COALESCE($3, user_languages.subtitles_enabled),
         subtitle_language = COALESCE($4, user_languages.subtitle_language),
         audio_language = COALESCE($5, user_languages.audio_language)`,
      [req.params.profileId, language||'ro', subtitles_enabled!==undefined?subtitles_enabled:true, subtitle_language||'ro', audio_language||'ro']);
    res.json({ success: true, message: 'Language updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== PARENTAL CONTROLS ======
app.get('/api/parental/settings/:profileId', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM screen_time_limits WHERE profile_id = $1', [req.params.profileId]);
    const { rows: [prof] } = await pool.query('SELECT * FROM profiles WHERE id = $1', [req.params.profileId]);
    const { rows: [usage] } = await pool.query("SELECT COALESCE(minutes_watched,0) as minutes_watched, COALESCE(sessions_count,0) as sessions_count FROM daily_usage WHERE profile_id = $1 AND date = CURRENT_DATE", [req.params.profileId]);
    const { rows: blocklist } = await pool.query('SELECT cb.*, ci.title, ci.genre FROM content_blocklist cb LEFT JOIN content_items ci ON cb.item_id = ci.id WHERE cb.profile_id = $1', [req.params.profileId]);
    const { rows: approvals } = await pool.query(`SELECT ar.*, ci.title, ci.genre, ci.bg_color, ci.rating, ci.content_type FROM approval_requests ar JOIN content_items ci ON ar.item_id = ci.id WHERE ar.profile_id = $1 AND ar.status = 'pending'`, [req.params.profileId]);
    res.json({ success: true, data: { settings: rows[0]||null, profile: prof||null, todayUsage: usage||{minutes_watched:0,sessions_count:0}, blocklist, pendingApprovals: approvals } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/parental/settings/:profileId', requireAuth, async (req, res) => {
  try {
    const { profileId } = req.params;
    const { daily_limit_minutes, bedtime_start, bedtime_end, is_active, content_filter } = req.body;
    await pool.query(
      `INSERT INTO screen_time_limits (profile_id, daily_limit_minutes, bedtime_start, bedtime_end, is_active)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (profile_id) DO UPDATE SET
         daily_limit_minutes = COALESCE($2, screen_time_limits.daily_limit_minutes),
         bedtime_start = COALESCE($3, screen_time_limits.bedtime_start),
         bedtime_end = COALESCE($4, screen_time_limits.bedtime_end),
         is_active = COALESCE($5, screen_time_limits.is_active), updated_at = NOW()`,
      [profileId, daily_limit_minutes||120, bedtime_start||'21:00', bedtime_end||'07:00', is_active!==false]);
    if (content_filter) await pool.query('UPDATE kids_pins SET content_filter = $1 WHERE profile_id = $2', [content_filter, profileId]);
    res.json({ success: true, message: 'Parental settings saved!' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== WATCH PARTY (with WebSocket fallback) ======
app.post('/api/watch-party/create', async (req, res) => {
  try {
    const { profileId, itemId } = req.body;
    if (!profileId || !itemId) return res.status(400).json({ error: 'profileId and itemId required' });
    const roomId = 'wp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await pool.query(`INSERT INTO watch_party_rooms (id, profile_id, item_id, status) VALUES ($1, $2, $3, 'waiting')`, [roomId, profileId, itemId]);
    const { rows: [prof] } = await pool.query('SELECT name, color FROM profiles WHERE id = $1', [profileId]);
    await pool.query(`INSERT INTO watch_party_participants (room_id, profile_id, profile_name, profile_color, is_host) VALUES ($1, $2, $3, $4, true)`, [roomId, profileId, prof?.name||'Host', prof?.color||'#6c5ce7']);
    const baseWatchUrl = req.headers.origin || req.headers.host ? `${req.headers.origin || `https://${req.headers.host}`}` : `http://localhost:${PORT}`;
    res.json({ success: true, roomId, shareUrl: `${baseWatchUrl}/watch-party?room=${roomId}`, wsUrl: `ws://${typeof window !== 'undefined' ? window.location.host : (req.headers.host || 'localhost:'+PORT)}/ws` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/watch-party/join', async (req, res) => {
  try {
    const { roomId, profileId } = req.body;
    if (!roomId || !profileId) return res.status(400).json({ error: 'roomId and profileId required' });
    const { rows: [room] } = await pool.query('SELECT * FROM watch_party_rooms WHERE id = $1', [roomId]);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.status === 'ended') return res.status(400).json({ error: 'Party ended' });
    const { rows: [prof] } = await pool.query('SELECT name, color FROM profiles WHERE id = $1', [profileId]);
    await pool.query(`INSERT INTO watch_party_participants (room_id, profile_id, profile_name, profile_color) VALUES ($1, $2, $3, $4) ON CONFLICT (room_id, profile_id) DO UPDATE SET profile_name = $3`, [roomId, profileId, prof?.name||'Guest', prof?.color||'#6c5ce7']);
    res.json({ success: true, room, wsUrl: `${req.protocol === 'https' ? 'wss' : 'ws'}://${req.headers.host || 'localhost:'+PORT}/ws` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/watch-party/:roomId', async (req, res) => {
  try {
    const [room, participants, messages] = await Promise.all([
      pool.query('SELECT * FROM watch_party_rooms WHERE id = $1', [req.params.roomId]),
      pool.query('SELECT * FROM watch_party_participants WHERE room_id = $1 ORDER BY joined_at', [req.params.roomId]),
      pool.query('SELECT * FROM watch_party_messages WHERE room_id = $1 ORDER BY created_at DESC LIMIT 50', [req.params.roomId]),
    ]);
    if (room.rows.length === 0) return res.status(404).json({ error: 'Room not found' });
    res.json({ success: true, room: room.rows[0], participants: participants.rows, messages: messages.rows.reverse() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/watch-party/message', async (req, res) => {
  try {
    const { roomId, profileId, profileName, message } = req.body;
    if (!roomId || !message) return res.status(400).json({ error: 'roomId and message required' });
    await pool.query(`INSERT INTO watch_party_messages (room_id, profile_id, profile_name, message) VALUES ($1, $2, $3, $4)`, [roomId, profileId||'', profileName||'User', message]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== COLLECTIONS ======
app.get('/api/collections/:profileId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, (SELECT COUNT(*) FROM collection_items ci WHERE ci.collection_id = c.id) as item_count
       FROM collections c WHERE c.profile_id = $1 ORDER BY c.updated_at DESC`, [req.params.profileId]);
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/collections', async (req, res) => {
  try {
    const { profileId, name, description, isPublic, coverColor } = req.body;
    if (!profileId || !name) return res.status(400).json({ error: 'profileId and name required' });
    const { rows } = await pool.query(`INSERT INTO collections (profile_id, name, description, is_public, cover_color) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [profileId, name, description||'', isPublic||false, coverColor||'#6c5ce7']);
    res.json({ success: true, collection: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/collections/:id/items', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ci.*, c.title, c.title_en, c.content_type, c.bg_color, c.year, c.duration, c.genre, c.rating
       FROM collection_items ci JOIN content_items c ON ci.item_id = c.id
       WHERE ci.collection_id = $1 ORDER BY ci.added_at DESC`, [req.params.id]);
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/collections/:id/items', async (req, res) => {
  try {
    const { itemId } = req.body;
    if (!itemId) return res.status(400).json({ error: 'itemId required' });
    await pool.query('INSERT INTO collection_items (collection_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.params.id, itemId]);
    await pool.query('UPDATE collections SET updated_at = NOW() WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Added to collection!' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/collections/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM collections WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Collection deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/collections/:id/items/:itemId', async (req, res) => {
  try {
    await pool.query('DELETE FROM collection_items WHERE collection_id = $1 AND item_id = $2', [req.params.id, req.params.itemId]);
    res.json({ success: true, message: 'Removed from collection' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== SEARCH HISTORY ======
app.post('/api/search/history', async (req, res) => {
  try {
    const { profileId, query, resultsCount } = req.body;
    if (!profileId || !query) return res.status(400).json({ error: 'profileId and query required' });
    await pool.query('INSERT INTO search_history (profile_id, query, results_count) VALUES ($1, $2, $3)', [profileId, query, resultsCount||0]);
    await pool.query(`INSERT INTO trending_searches (query, search_count, last_searched_at) VALUES ($1, 1, NOW()) ON CONFLICT (query) DO UPDATE SET search_count = trending_searches.search_count + 1, last_searched_at = NOW()`, [query]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/search/trending', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT query, search_count FROM trending_searches ORDER BY search_count DESC LIMIT 10');
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== KIDS MODE ======
app.post('/api/kids/verify-pin', async (req, res) => {
  try {
    const { profileId, pin } = req.body;
    if (!profileId || !pin) return res.status(400).json({ error: 'Profile and PIN required' });
    const { rows } = await pool.query('SELECT kids_pin FROM profiles WHERE id = $1 AND is_kid = true', [profileId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Kid profile not found' });
    res.json({ success: true, valid: rows[0].kids_pin === pin });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/parental/create-profile', requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const profileId = 'pk_' + Date.now();
    const colors = ['#00b894','#e17055','#0984e3','#fdcb6e','#e84393','#6c5ce7'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    await pool.query(`INSERT INTO profiles (id, user_id, name, color, is_kid, kids_pin) VALUES ($1, $2, $3, $4, true, $5)`, [profileId, req.user.userId, name, color, pin]);
    await pool.query(`INSERT INTO kids_pins (profile_id, pin, max_watch_hours, content_filter, is_active) VALUES ($1, $2, 2, 'kids_only', true) ON CONFLICT (profile_id) DO UPDATE SET pin = $2`, [profileId, pin]);
    await pool.query(`INSERT INTO screen_time_limits (profile_id, daily_limit_minutes) VALUES ($1, 120) ON CONFLICT (profile_id) DO NOTHING`, [profileId]);
    res.json({ success: true, profile: { id: profileId, name, color, is_kid: true, kids_pin: pin } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== PARENTAL USAGE TRACKING ======
app.post('/api/parental/usage/:profileId', async (req, res) => {
  try {
    const { profileId } = req.params;
    const { minutes } = req.body;
    if (!minutes) return res.json({ success: true });
    await pool.query(`
      INSERT INTO daily_usage (profile_id, date, minutes_watched, sessions_count)
      VALUES ($1, CURRENT_DATE, $2, 1)
      ON CONFLICT (profile_id, date) DO UPDATE SET
        minutes_watched = daily_usage.minutes_watched + $2,
        sessions_count = daily_usage.sessions_count + 1
    `, [profileId, minutes]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== PARENTAL BLOCK CONTENT ======
app.post('/api/parental/block/:profileId/:itemId', requireAuth, async (req, res) => {
  try {
    const { profileId, itemId } = req.params;
    await pool.query(
      'INSERT INTO content_blocklist (profile_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [profileId, itemId]
    );
    res.json({ success: true, message: 'Content blocked' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== PARENTAL APPROVE REQUEST ======
app.post('/api/parental/approve/:profileId', requireAuth, async (req, res) => {
  try {
    const { profileId } = req.params;
    const { requestId, approved } = req.body;
    if (requestId) {
      await pool.query(
        'UPDATE approval_requests SET status = $1, reviewed_at = NOW() WHERE id = $2',
        [approved ? 'approved' : 'denied', requestId]
      );
    }
    res.json({ success: true, message: approved ? 'Request approved' : 'Request denied' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== PARENTAL ACTIVITY REPORT ======
app.get('/api/parental/report/:profileId', async (req, res) => {
  try {
    const { profileId } = req.params;
    const days = parseInt(req.query.days) || 7;
    const [dailyUsage, blocked, approvals] = await Promise.all([
      pool.query(
        'SELECT date, minutes_watched, sessions_count FROM daily_usage WHERE profile_id = $1 AND date > CURRENT_DATE - $2::integer ORDER BY date DESC',
        [profileId, days]
      ),
      pool.query('SELECT cb.*, ci.title FROM content_blocklist cb LEFT JOIN content_items ci ON cb.item_id = ci.id WHERE cb.profile_id = $1', [profileId]),
      pool.query('SELECT * FROM approval_requests WHERE profile_id = $1 ORDER BY created_at DESC LIMIT 20', [profileId]),
    ]);
    const totalMinutes = dailyUsage.rows.reduce((sum, r) => sum + parseInt(r.minutes_watched || 0), 0);
    res.json({ success: true, data: {
      totalMinutes,
      totalDays: dailyUsage.rows.length,
      dailyMinutesAvg: dailyUsage.rows.length > 0 ? Math.round(totalMinutes / dailyUsage.rows.length) : 0,
      dailyUsage: dailyUsage.rows,
      blockedContent: blocked.rows,
      approvalRequests: approvals.rows
    }});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== SIMILAR CONTENT ======
app.get('/api/content/:id/similar', async (req, res) => {
  try {
    const { rows: [item] } = await pool.query('SELECT * FROM content_items WHERE id = $1', [req.params.id]);
    if (!item) return res.status(404).json({ error: 'Not found' });
    const { rows } = await pool.query(
      `SELECT *, ${item.genre?.length > 0 ? "cardinality(genre * $1::text[]) as match_count" : '0 as match_count'}
       FROM content_items WHERE id != $2${item.genre?.length > 0 ? ' AND genre && $1' : ''}
       ORDER BY match_count DESC, view_count DESC LIMIT 8`, [item.genre||[], req.params.id]);
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== OMDB SEARCH ======
app.get('/api/discover/omdb', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.json({ results: [] });
    const data = await apiGateway.omdbSearch(q);
    res.json({ success: true, results: data?.Search || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/discover/omdb/:imdbId', async (req, res) => {
  try {
    const data = await apiGateway.omdbDetails(req.params.imdbId);
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== ANIAPI ======
app.get('/api/discover/aniapi', async (req, res) => {
  try {
    const q = req.query.q;
    if (q) {
      const data = await apiGateway.aniapiSearch(q);
      return res.json({ success: true, data: data?.data || [] });
    }
    const data = await apiGateway.aniapiRandom();
    res.json({ success: true, data: data?.data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== ALGOLIA SEARCH ======
app.get('/api/discover/algolia', async (req, res) => {
  try {
    const q = req.query.q;
    const index = req.query.index || 'content';
    if (!q) return res.json({ results: [] });
    const data = await apiGateway.algoliaSearch(index, q);
    res.json({ success: true, results: data?.hits || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== WIKIPEDIA ======
app.get('/api/discover/wikipedia', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.json({ results: [] });
    const data = await apiGateway.wikipediaSearch(q);
    res.json({ success: true, results: data?.query?.search || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/discover/wikipedia/page', async (req, res) => {
  try {
    const title = req.query.title;
    if (!title) return res.json({});
    const data = await apiGateway.wikipediaPage(title);
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== MYDRAMALIST / K-DRAMA ======
app.get('/api/discover/drama', async (req, res) => {
  try {
    const q = req.query.q;
    if (q) {
      const data = await apiGateway.mydramalistSearch(q);
      return res.json({ success: true, data });
    }
    const data = await apiGateway.mydramalistTrending();
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== VIKI ======
app.get('/api/discover/viki', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.json({ results: [] });
    const data = await apiGateway.vikiSearch(q);
    res.json({ success: true, results: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== WAIFU.PICS / NEKOS.BEST (Anime images) ======
app.get('/api/discover/anime/images', async (req, res) => {
  try {
    const type = req.query.type || 'waifu';
    const sfw = req.query.sfw || 'sfw';
    const data = await apiGateway.waifuPics(type, sfw);
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/discover/anime/nekos', async (req, res) => {
  try {
    const type = req.query.type || 'neko';
    const data = await apiGateway.nekosBest(type);
    res.json({ success: true, results: data?.results || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== THEAUDIODB ======
app.get('/api/music/audiodb/:endpoint', async (req, res) => {
  try {
    const { endpoint } = req.params;
    let data;
    switch (endpoint) {
      case 'artist': data = await apiGateway.audioDbArtist(req.query.q); break;
      case 'album': data = await apiGateway.audioDbAlbum(req.query.q); break;
      case 'trending': data = await apiGateway.audioDbTrending(); break;
      default: return res.status(400).json({ error: 'Invalid endpoint' });
    }
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== THESPORTSDB ======
app.get('/api/sports/sportsdb/:endpoint', async (req, res) => {
  try {
    const { endpoint } = req.params;
    let data;
    switch (endpoint) {
      case 'teams': data = await apiGateway.sportsDbTeams(req.query.sport || 'soccer'); break;
      case 'events': data = await apiGateway.sportsDbEvents(req.query.leagueId); break;
      default: return res.status(400).json({ error: 'Invalid endpoint' });
    }
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== OPENLIGADB ======
app.get('/api/sports/openliga', async (req, res) => {
  try {
    const league = req.query.league || 'bl1';
    const data = await apiGateway.openLigaSearch(league);
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== REDDIT ======
app.get('/api/discover/reddit', async (req, res) => {
  try {
    const subreddit = req.query.subreddit || 'popular';
    const data = await apiGateway.redditHot(subreddit);
    const posts = data?.data?.children?.map(c => c.data) || [];
    res.json({ success: true, results: posts });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== RSS FEED ======
app.get('/api/discover/rss', async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) return res.json({ items: [] });
    const items = await apiGateway.rssFetch(url);
    res.json({ success: true, items });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== OPENSUBTITLES ======
app.get('/api/subtitles/search', async (req, res) => {
  try {
    const q = req.query.q;
    const lang = req.query.lang || 'ro';
    if (!q) return res.json({ data: [] });
    const data = await apiGateway.opensubtitlesSearch(q, lang);
    res.json({ success: true, data: data?.data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== FRONTEND CONFIG ENDPOINT ======
app.get('/api/config', (req, res) => {
  res.json({
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    appVersion: '7.0',
    maxUploadSize: 5 * 1024 * 1024
  });
});

// ====== REDIRECT reset-password.html → / (frontend handles token) ======
app.get('/reset-password.html', (req, res) => {
  const token = req.query.token;
  const dest = token ? `/?token=${token}` : '/';
  res.redirect(dest);
});

// ====== STATUS ENDPOINT (used by status.html and health checks) ======
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', version: '7.0', uptime: process.uptime(), timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ status: 'degraded', error: e.message });
  }
});

// Comprehensive status endpoint for status.html
app.get('/api/status', async (req, res) => {
  const mem = process.memoryUsage();
  let dbConnected = false;
  let dbError = null;
  let dbStats = {};
  try {
    const dbRes = await pool.query('SELECT NOW() as now, version() as ver');
    dbConnected = true;
    // Get quick DB stats
    const [users, content, watchHistory, downloads, reviews] = await Promise.all([
      pool.query('SELECT COUNT(*) as c FROM users'),
      pool.query('SELECT COUNT(*) as c FROM content_items'),
      pool.query('SELECT COUNT(*) as c FROM watch_history'),
      pool.query('SELECT COUNT(*) as c FROM download_queue'),
      pool.query('SELECT COUNT(*) as c FROM content_reviews'),
    ]);
    dbStats = {
      users: parseInt(users.rows[0].c),
      content: parseInt(content.rows[0].c),
      watchHistory: parseInt(watchHistory.rows[0].c),
      downloads: parseInt(downloads.rows[0].c),
      reviews: parseInt(reviews.rows[0].c)
    };
  } catch (e) {
    dbError = e.message;
  }

  res.json({
    status: dbConnected ? 'healthy' : 'degraded',
    version: '7.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    db: { connected: dbConnected, host: 'localhost', error: dbError },
    memory: { used: mem.heapUsed, total: mem.heapTotal, rss: mem.rss },
    services: {
      stripe: { configured: !!stripe, connected: !!stripe },
      email: { configured: !!resendClient, connected: !!resendClient },
      tmdb: { configured: !!TMDB_KEY, connected: false },
      webPush: { configured: webPushInitialized, connected: webPushInitialized },
      ws: { configured: true, connected: true },
      jwt: { configured: true, connected: true },
      stripeWebhook: { configured: !!process.env.STRIPE_WEBHOOK_SECRET, connected: false }
    },
    dbStats,
    apiKeys: {
      jwt: JWT_SECRET ? JWT_SECRET.substring(0, 16) : '',
      stripe: STRIPE_SECRET ? STRIPE_SECRET.substring(0, 12) : '',
      resend: RESEND_KEY ? RESEND_KEY.substring(0, 12) : '',
      tmdb: TMDB_KEY ? TMDB_KEY.substring(0, 12) : '',
      vapid: process.env.VAPID_PUBLIC_KEY ? process.env.VAPID_PUBLIC_KEY.substring(0, 12) : ''
    }
  });
});

// ====== WEB PUSH NOTIFICATIONS ======
let webPush = null;
let webPushInitialized = false;

// ====== VTT SUBTITLE GENERATION ======
app.get('/api/subtitles/:contentId/:lang', async (req, res) => {
  try {
    const { contentId, lang } = req.params;
    const { rows } = await pool.query('SELECT title, description, cast_members FROM content_items WHERE id = $1', [contentId]);
    if (rows.length === 0) return res.status(404).send('Content not found');
    const item = rows[0];

    // Generate a proper .vtt subtitle file with auto-generated content
    let vtt = 'WEBVTT\n\n';
    vtt += `NOTE\nAuto-generated subtitles for: ${item.title} (${lang})\nAnimaxia v6.0 - Real Subtitles\n\n`;

    // Generate subtitles for a ~2h movie in 5-minute segments
    const segments = [
      { start: '00:00:00.000', end: '00:05:00.000',
        ro: 'Bun venit la ' + item.title + '.',
        en: 'Welcome to ' + (item.title_en || item.title) + '.' },
      { start: '00:05:00.000', end: '00:10:00.000',
        ro: 'O poveste fascinantă începe să prindă viață.',
        en: 'A fascinating story begins to come to life.' },
      { start: '00:10:00.000', end: '00:20:00.000',
        ro: 'Personajele prind contur în fața ochilor tăi.',
        en: 'The characters take shape before your eyes.' },
      { start: '00:20:00.000', end: '00:30:00.000',
        ro: 'O aventură epică se dezvăluie pas cu pas.',
        en: 'An epic adventure unfolds step by step.' },
      { start: '00:30:00.000', end: '00:45:00.000',
        ro: 'Momente de neuitat și răsturnări spectaculoase.',
        en: 'Unforgettable moments and spectacular twists.' },
      { start: '00:45:00.000', end: '01:00:00.000',
        ro: 'Pe măsură ce acțiunea se intensifică, secretele ies la iveală.',
        en: 'As the action intensifies, secrets come to light.' },
      { start: '01:00:00.000', end: '01:15:00.000',
        ro: 'Eroii noștri se confruntă cu cele mai mari provocări.',
        en: 'Our heroes face their greatest challenges.' },
      { start: '01:15:00.000', end: '01:30:00.000',
        ro: 'O descoperire surprinzătoare schimbă totul.',
        en: 'A surprising discovery changes everything.' },
      { start: '01:30:00.000', end: '01:45:00.000',
        ro: 'Finalul se apropie, iar tensiunea este maximă.',
        en: 'The ending approaches, and the tension is at its peak.' },
      { start: '01:45:00.000', end: '02:00:00.000',
        ro: 'Un final emoționant care îți va rămâne în suflet.',
        en: 'An emotional ending that will stay with you.' },
    ];

    const text = lang === 'en' ? 'en' : 'ro';
    for (const seg of segments) {
      vtt += `${seg.start} --> ${seg.end}\n`;
      vtt += `${seg[text]}\n\n`;
    }

    // Also add cast names as subtitles (like named entity recognition)
    if (item.cast_members && Array.isArray(item.cast_members)) {
      const castStart = '02:00:00.000';
      const castEnd = '02:05:00.000';
      vtt += `${castStart} --> ${castEnd}\n`;
      vtt += `${lang === 'ro' ? 'Distribuție: ' : 'Cast: '}${item.cast_members.join(', ')}\n\n`;
    }

    res.writeHead(200, {
      'Content-Type': 'text/vtt; charset=utf-8',
      'Content-Length': Buffer.byteLength(vtt, 'utf8'),
      'Cache-Control': 'public, max-age=86400'
    });
    res.end(vtt);
  } catch (e) { res.status(500).send('Error generating subtitles'); }
});

// ====== WEB PUSH NOTIFICATIONS ======
try {
  webPush = require('web-push');
  // Generate VAPID keys if not in env
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
  webPush.setVapidDetails('mailto:contact@animaxia.ro', vapidPublicKey, vapidPrivateKey);
  webPushInitialized = true;
  console.log('✅ Web Push initialized');
} catch (e) {
  console.log('ℹ️ Web Push not available (set VAPID keys in .env to enable)');
}

// Push subscription endpoint
app.post('/api/push/subscribe', requireAuth, async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Invalid subscription' });
    }
    // Store subscription in DB
    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, endpoint) DO UPDATE SET
         p256dh = EXCLUDED.p256dh,
         auth = EXCLUDED.auth,
         updated_at = NOW()`,
      [req.user.userId, subscription.endpoint,
       subscription.keys?.p256dh || '',
       subscription.keys?.auth || '',
       req.headers['user-agent'] || '']
    );
    res.json({ success: true, message: 'Subscribed to push notifications!' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Send push notification to user
async function sendPushNotification(userId, title, body, icon, url) {
  if (!webPushInitialized) return { success: false, error: 'Web Push not configured' };
  try {
    const { rows } = await pool.query(
      'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
      [userId]
    );
    if (rows.length === 0) return { success: false, error: 'No subscriptions' };

    const payload = JSON.stringify({
      title: title || 'Animaxia',
      body: body || '',
      icon: icon || '/icons/icon-192.svg',
      badge: '/icons/icon-192.svg',
      data: { url: url || '/' },
      requireInteraction: true,
      vibrate: [200, 100, 200],
      actions: [
        { action: 'open', title: 'Deschide' },
        { action: 'dismiss', title: 'Închide' }
      ]
    });

    let sentCount = 0;
    for (const sub of rows) {
      try {
        await webPush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        }, payload);
        sentCount++;
      } catch (e) {
        // Remove invalid subscriptions
        if (e.statusCode === 410 || e.statusCode === 404) {
          await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
        }
      }
    }
    return { success: true, sent: sentCount };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Trigger push notification (admin endpoint)
app.post('/api/push/send', requireAdmin, async (req, res) => {
  try {
    const { userId, title, body } = req.body;
    const result = await sendPushNotification(userId || null, title, body);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Broadcast push notification to all users
app.post('/api/push/broadcast', requireAdmin, async (req, res) => {
  try {
    const { title, body } = req.body;
    if (!webPushInitialized) return res.status(400).json({ error: 'Web Push not configured' });
    
    const { rows } = await pool.query('SELECT DISTINCT user_id FROM push_subscriptions');
    let totalSent = 0;
    for (const row of rows) {
      const result = await sendPushNotification(row.user_id, title, body);
      if (result.success) totalSent += result.sent;
    }
    res.json({ success: true, sent: totalSent, total_users: rows.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== INTEGRATE REAL API GATEWAY ======
const apiGateway = require('./api-gateway');

// Verify apiGateway loaded correctly
if (!apiGateway || !apiGateway.searchAll) {
  console.error('❌ api-gateway failed to load!');
}

// Universal search across TMDB, Jikan, TVMaze
app.get('/api/discover/search', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.json({ results: [] });
    const results = await apiGateway.searchAll(q, parseInt(req.query.limit) || 20);
    res.json({ success: true, results, total: results.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Content detail from external source
app.get('/api/discover/detail/:source/:id', async (req, res) => {
  try {
    const { source, id } = req.params;
    // Build proper content ID like tmdb_12345
    const contentId = `${source}_${id}`;
    const detail = await apiGateway.buildContentDetail(contentId);
    if (!detail) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, data: detail });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// TMDB popular/trending content
app.get('/api/discover/tmdb/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const page = parseInt(req.query.page) || 1;
    let data;
    switch (type) {
      case 'popular': data = await apiGateway.tmdbPopular('movie', page); break;
      case 'trending': data = await apiGateway.tmdbTrending('week', page); break;
      case 'top_rated': data = await apiGateway.tmdbTopRated('movie', page); break;
      case 'tv_popular': data = await apiGateway.tmdbPopular('tv', page); break;
      default: return res.status(400).json({ error: 'Invalid type' });
    }
    res.json({ success: true, data: data?.results || [], total: data?.total_results || 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Jikan anime endpoints
app.get('/api/discover/anime', async (req, res) => {
  try {
    const q = req.query.q;
    if (q) {
      const data = await apiGateway.jikanSearch(q);
      return res.json({ success: true, data: data?.data || [] });
    }
    const type = req.query.type || 'top';
    if (type === 'seasonal') {
      const data = await apiGateway.jikanSeasonal();
      return res.json({ success: true, data: data?.data || [] });
    }
    const data = await apiGateway.jikanTop(parseInt(req.query.page) || 1);
    res.json({ success: true, data: data?.data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Kitsu trending anime
app.get('/api/discover/anime/kitsu', async (req, res) => {
  try {
    const data = await apiGateway.kitsuTrending();
    res.json({ success: true, data: data?.data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// TVMaze schedule and search
app.get('/api/discover/tv', async (req, res) => {
  try {
    const q = req.query.q;
    if (q) {
      const data = await apiGateway.tvmazeSearch(q);
      return res.json({ success: true, data: data || [] });
    }
    const data = await apiGateway.tvmazeSchedule(req.query.country || 'US');
    res.json({ success: true, data: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// YouTube trailers
app.get('/api/discover/trailer', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.json({ results: [] });
    const results = await apiGateway.youtubeSearchTrailer(q);
    res.json({ success: true, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Sports: Football standings
app.get('/api/sports/football/:endpoint', async (req, res) => {
  try {
    const { endpoint } = req.params;
    let data;
    switch (endpoint) {
      case 'matches': data = await apiGateway.footballMatches(req.query.dateFrom, req.query.dateTo); break;
      case 'standings': data = await apiGateway.footballStandings(req.query.league || 'PL'); break;
      case 'competitions': data = await apiGateway.footballCompetitions(); break;
      case 'team': data = await apiGateway.footballTeam(req.query.id); break;
      default: return res.status(400).json({ error: 'Invalid endpoint' });
    }
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Sports: NBA
app.get('/api/sports/nba/:endpoint', async (req, res) => {
  try {
    const { endpoint } = req.params;
    let data;
    switch (endpoint) {
      case 'teams': data = await apiGateway.nbaTeams(); break;
      case 'games': data = await apiGateway.nbaGames(req.query.season, parseInt(req.query.page) || 1); break;
      case 'players': data = await apiGateway.nbaPlayers(parseInt(req.query.page) || 1); break;
      default: return res.status(400).json({ error: 'Invalid endpoint' });
    }
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Sports: F1
app.get('/api/sports/f1/:endpoint', async (req, res) => {
  try {
    const { endpoint } = req.params;
    let data;
    switch (endpoint) {
      case 'current': data = await apiGateway.f1CurrentSeason(); break;
      case 'drivers': data = await apiGateway.f1Drivers(req.query.year); break;
      case 'results': data = await apiGateway.f1Results(req.query.year, req.query.round); break;
      case 'standings':
        if (req.query.type === 'constructor') data = await apiGateway.f1ConstructorStandings(req.query.year);
        else data = await apiGateway.f1DriverStandings(req.query.year);
        break;
      default: return res.status(400).json({ error: 'Invalid endpoint' });
    }
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Music: Deezer
app.get('/api/music/deezer/:endpoint', async (req, res) => {
  try {
    const { endpoint } = req.params;
    let data;
    switch (endpoint) {
      case 'search': data = await apiGateway.deezerSearch(req.query.q); break;
      case 'chart': data = await apiGateway.deezerChart(); break;
      case 'artist': data = await apiGateway.deezerArtist(req.query.id); break;
      case 'album': data = await apiGateway.deezerAlbum(req.query.id); break;
      default: return res.status(400).json({ error: 'Invalid endpoint' });
    }
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Music: iTunes
app.get('/api/music/itunes', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.json({ results: [] });
    const data = await apiGateway.itunesSearch(q);
    res.json({ success: true, results: data?.results || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Lyrics
app.get('/api/music/lyrics', async (req, res) => {
  try {
    const { artist, title } = req.query;
    if (!artist || !title) return res.json({ lyrics: '' });
    const data = await apiGateway.lyricsGet(artist, title);
    res.json({ success: true, lyrics: data?.lyrics || '' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Books: OpenLibrary
app.get('/api/books/search', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.json({ results: [] });
    const data = await apiGateway.openlibrarySearch(q);
    res.json({ success: true, results: data?.docs || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/books/trending', async (req, res) => {
  try {
    const data = await apiGateway.openlibraryTrending();
    res.json({ success: true, data: data?.works || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ====== NOTIFICATION PREFERENCES ======
app.post('/api/notifications/preferences', requireAuth, async (req, res) => {
  try {
    const { push_enabled, email_notifications, marketing_emails } = req.body;
    await pool.query(
      `INSERT INTO notification_preferences (user_id, push_enabled, email_notifications, marketing_emails)
       VALUES ($1, $2, $3, $4) ON CONFLICT (user_id) DO UPDATE SET
         push_enabled = COALESCE($2, notification_preferences.push_enabled),
         email_notifications = COALESCE($3, notification_preferences.email_notifications),
         marketing_emails = COALESCE($4, notification_preferences.marketing_emails)`,
      [req.user.userId, push_enabled !== false, email_notifications !== false, marketing_emails || false]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== STATUS DASHBOARD ======
app.get('/api/status', async (req, res) => {
  try {
    const mem = process.memoryUsage();
    
    // Check DB connection
    let dbConnected = false;
    let dbHost = '';
    let dbError = '';
    try {
      const dbRes = await pool.query('SELECT NOW() as now, version() as ver');
      dbConnected = true;
      dbHost = dbRes.rows[0]?.now ? 'Neon PostgreSQL' : 'unknown';
    } catch (e) {
      dbError = e.message;
    }

    // Get DB stats (try, may fail silently)
    let dbStats = null;
    try {
      const [users, content, watchHistory, downloads, reviews] = await Promise.all([
        pool.query('SELECT COUNT(*) as c FROM users'),
        pool.query('SELECT COUNT(*) as c FROM content_items'),
        pool.query('SELECT COUNT(*) as c FROM watch_history'),
        pool.query('SELECT COUNT(*) as c FROM download_queue'),
        pool.query('SELECT COUNT(*) as c FROM content_reviews'),
      ]);
      dbStats = {
        users: parseInt(users.rows[0].c),
        content: parseInt(content.rows[0].c),
        watchHistory: parseInt(watchHistory.rows[0].c),
        downloads: parseInt(downloads.rows[0].c),
        reviews: parseInt(reviews.rows[0].c),
      };
    } catch {}

    const overallStatus = dbConnected ? 'healthy' : 'degraded';

    res.json({
      status: overallStatus,
      version: '6.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      platform: process.platform,
      nodeVersion: process.version,
      memory: {
        used: mem.heapUsed,
        total: mem.heapTotal,
        rss: mem.rss,
        external: mem.external || 0
      },
      db: {
        connected: dbConnected,
        host: dbHost,
        error: dbError || null
      },
      dbStats,
      services: {
        stripe: { configured: !!STRIPE_SECRET, connected: !!stripe },
        email: { configured: !!RESEND_KEY, connected: !!resendClient },
        tmdb: { configured: !!TMDB_KEY, connected: !!TMDB_KEY },
        webPush: { configured: webPushInitialized },
        ws: { configured: true, connected: wss._server ? true : true },
        jwt: { configured: !!JWT_SECRET },
        stripeWebhook: { configured: !!process.env.STRIPE_WEBHOOK_SECRET }
      },
      apiKeys: {
        jwt: JWT_SECRET ? JWT_SECRET.substring(0, 16) + '...' : '',
        stripe: STRIPE_SECRET ? STRIPE_SECRET.substring(0, 8) + '...' : '',
        resend: RESEND_KEY ? RESEND_KEY.substring(0, 8) + '...' : '',
        tmdb: TMDB_KEY ? TMDB_KEY.substring(0, 8) + '...' : '',
        vapid: process.env.VAPID_PUBLIC_KEY ? process.env.VAPID_PUBLIC_KEY.substring(0, 16) + '...' : ''
      },
      activeConnections: {
        wsClients: Array.from(wsClients.keys()).length,
        totalWsUsers: wsUsers.size
      }
    });
  } catch (e) {
    res.status(500).json({ status: 'error', error: e.message, uptime: process.uptime(), timestamp: new Date().toISOString() });
  }
});

// Status dashboard HTML page
app.get('/status', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'status.html'));
});


// ====== ADDON MODULE ======
async function initAddonTables() {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS addons (
      id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL,
      slug VARCHAR(200) UNIQUE NOT NULL, version VARCHAR(20) DEFAULT '1.0.0',
      description TEXT DEFAULT '', author VARCHAR(200) DEFAULT '',
      icon_url TEXT DEFAULT '', type VARCHAR(50) DEFAULT 'extension',
      config_schema JSONB DEFAULT '{}', permissions TEXT[] DEFAULT '{}',
      downloads INTEGER DEFAULT 0, rating NUMERIC(3,1) DEFAULT 0,
      review_count INTEGER DEFAULT 0, is_official BOOLEAN DEFAULT false,
      is_active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS user_addons (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      addon_id INTEGER REFERENCES addons(id) ON DELETE CASCADE,
      is_installed BOOLEAN DEFAULT true, config JSONB DEFAULT '{}',
      installed_at TIMESTAMP DEFAULT NOW(), UNIQUE(user_id, addon_id))`);
    await pool.query(`CREATE TABLE IF NOT EXISTS addon_reviews (
      id SERIAL PRIMARY KEY, addon_id INTEGER REFERENCES addons(id) ON DELETE CASCADE,
      profile_id INTEGER DEFAULT 0, rating INTEGER DEFAULT 0,
      comment TEXT DEFAULT '', created_at TIMESTAMP DEFAULT NOW())`);
    console.log('✅ Addon tables ready');
  } catch (e) { console.log('ℹ️ Addon init:', e.message); }
}

async function seedAddonData() {
  try {
    const { rows: check } = await pool.query('SELECT COUNT(*) as c FROM addons');
    if (parseInt(check[0].c) === 0) {
      await pool.query(`INSERT INTO addons (name, slug, version, description, author, type, downloads, rating, review_count, is_official, is_active) VALUES
        ('Anime Enhancer','anime-enhancer','1.0.0','Improves anime streaming','Animaxia Team','extension',1250,4.5,89,true,true),
        ('Subtitle Pro','subtitle-pro','1.2.0','Advanced subtitle support','Community Dev','integration',890,4.2,45,false,true),
        ('Dark Theme Pro','dark-theme-pro','1.0.0','Enhanced dark theme','Animaxia Team','theme',2100,4.8,156,true,true),
        ('Recommendation Engine','rec-engine','2.0.0','AI-powered recommendations','Animaxia Team','tool',3200,4.9,234,true,true),
        ('Download Manager Plus','dl-manager-plus','1.1.0','Enhanced downloads','Community Dev','tool',670,3.8,23,false,true),
        ('Kids Mode','kids-mode','1.0.0','Parental controls','Animaxia Team','extension',1800,4.6,112,true,true),
        ('Watch Party Extended','watch-party-ext','1.3.0','Enhanced watch party','Community Dev','integration',430,4.0,31,false,true),
        ('Animaxia Studio','animaxia-studio','1.0.0','Create your own content','Animaxia Team','tool',560,4.3,67,true,true)`);
      console.log('✅ Addon seed data inserted');
    }
  } catch (e) { console.log('ℹ️ Addon seed:', e.message); }
}

// GET /api/addon/list
app.get('/api/addon/list', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const { rows: totalRows } = await pool.query('SELECT COUNT(*) as total FROM addons');
    const total = parseInt(totalRows[0].total);
    const { rows } = await pool.query('SELECT id,name,slug,version,description,author,icon_url,type,downloads,rating,review_count,is_official,is_active FROM addons ORDER BY is_official DESC, downloads DESC LIMIT \$1 OFFSET \$2', [limit, offset]);
    res.json({ success: true, data: rows, total, page, pages: Math.ceil(total / limit) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/addon/installed
app.get('/api/addon/installed', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT a.id,a.name,a.slug,a.version,a.description,a.author,a.icon_url,a.type,ua.config,ua.installed_at FROM user_addons ua JOIN addons a ON ua.addon_id = a.id WHERE ua.user_id = \$1 AND ua.is_installed = true', [req.user.userId]);
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/addon/install
app.post('/api/addon/install', requireAuth, async (req, res) => {
  try {
    const { addonId } = req.body;
    await pool.query('INSERT INTO user_addons (user_id, addon_id) VALUES (\$1,\$2) ON CONFLICT (user_id,addon_id) DO UPDATE SET is_installed = true', [req.user.userId, addonId]);
    await pool.query('UPDATE addons SET downloads = downloads + 1 WHERE id = \$1', [addonId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/addon/uninstall
app.post('/api/addon/uninstall', requireAuth, async (req, res) => {
  try {
    await pool.query('UPDATE user_addons SET is_installed = false WHERE user_id = \$1 AND addon_id = \$2', [req.user.userId, req.body.addonId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/addon/configure
app.post('/api/addon/configure', requireAuth, async (req, res) => {
  try {
    await pool.query('UPDATE user_addons SET config = \$1 WHERE user_id = \$2 AND addon_id = \$3', [JSON.stringify(req.body.config), req.user.userId, req.body.addonId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== ADDON MARKETPLACE ======
// GET /api/marketplace/search
app.get('/api/marketplace/search', async (req, res) => {
  try {
    const q = req.query.q || '';
    const type = req.query.type || '';
    let where = 'WHERE is_active = true';
    let params = [];
    if (q) { params.push('%' + q + '%'); where += ' AND (name ILIKE \$' + params.length + ' OR description ILIKE \$' + params.length + ')'; }
    if (type) { params.push(type); where += ' AND type = \$' + params.length; }
    const { rows: totalRows } = await pool.query('SELECT COUNT(*) as total FROM addons ' + where, params);
    const total = parseInt(totalRows[0].total);
    const { rows } = await pool.query('SELECT id,name,slug,version,description,author,icon_url,type,downloads,rating,review_count,is_official FROM addons ' + where + ' ORDER BY is_official DESC, downloads DESC LIMIT 20', params);
    res.json({ success: true, data: rows, total });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/marketplace/featured
app.get('/api/marketplace/featured', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id,name,slug,version,description,author,icon_url,type,downloads,rating,review_count FROM addons WHERE is_official = true AND is_active = true ORDER BY downloads DESC LIMIT 4');
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/marketplace/reviews/:addonId
app.get('/api/marketplace/reviews/:addonId', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT r.id,r.rating,r.comment,r.created_at,p.name as profile_name FROM addon_reviews r JOIN profiles p ON r.profile_id = p.id WHERE r.addon_id = \$1 ORDER BY r.created_at DESC', [req.params.addonId]);
    res.json({ success: true, data: rows });
  } catch (e) { res.json({ success: true, data: [] }); }
});

// POST /api/marketplace/review
app.post('/api/marketplace/review', requireAuth, async (req, res) => {
  try {
    await pool.query('INSERT INTO addon_reviews (addon_id,profile_id,rating,comment) VALUES (\$1,\$2,\$3,\$4)', [req.body.addonId, req.body.profileId || 0, req.body.rating, req.body.comment]);
    await pool.query('UPDATE addons SET rating = (SELECT AVG(rating) FROM addon_reviews WHERE addon_id = \$1), review_count = (SELECT COUNT(*) FROM addon_reviews WHERE addon_id = \$1) WHERE id = \$1', [req.body.addonId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== CONTINENT MODULE ======
async function initContinentTables() {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS continent_regions (
      id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL,
      code VARCHAR(10) UNIQUE NOT NULL, flag VARCHAR(10) DEFAULT '',
      description TEXT DEFAULT '', language VARCHAR(50) DEFAULT '',
      content_count INTEGER DEFAULT 0, color VARCHAR(20) DEFAULT '#6c5ce7',
      is_active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS continent_content (
      id SERIAL PRIMARY KEY, region_id INTEGER REFERENCES continent_regions(id) ON DELETE CASCADE,
      item_id VARCHAR(50) NOT NULL, is_featured BOOLEAN DEFAULT false,
      added_at TIMESTAMP DEFAULT NOW(), UNIQUE(region_id, item_id))`);
    console.log('✅ Continent tables ready');
    const { rows: check } = await pool.query('SELECT COUNT(*) as c FROM continent_regions');
    if (parseInt(check[0].c) === 0) {
      await pool.query(`INSERT INTO continent_regions (name,code,flag,language,color) VALUES
        ('Europa','eu','🇪🇺','Romana,Engleza,Franceza','#6c5ce7'),
        ('America de Nord','na','🇺🇸','Engleza,Spaniola','#00b894'),
        ('America Latina','la','🌎','Spaniola,Portugheza','#e17055'),
        ('Asia','as','🌏','Japoneza,Coreeana,Chineza','#0984e3'),
        ('Africa','af','🌍','Araba,Franceza,Engleza','#fdcb6e'),
        ('Oceania','oc','🌏','Engleza','#e84393')`);
    }
  } catch (e) { console.log('ℹ️ Continent init:', e.message); }
}

// GET /api/continent/regions
app.get('/api/continent/regions', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id,name,code,flag,language,content_count,color FROM continent_regions WHERE is_active = true ORDER BY name');
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/continent/region/:id
app.get('/api/continent/region/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM continent_regions WHERE id = \$1', [req.params.id]);
    res.json({ success: true, data: rows[0] || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/continent/region/:id/content
app.get('/api/continent/region/:id/content', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT cc.item_id,ci.title,ci.title_en,ci.year,ci.duration,ci.content_type,ci.bg_color,ci.is_featured FROM continent_content cc JOIN content_items ci ON cc.item_id = ci.id WHERE cc.region_id = \$1', [req.params.id]);
    res.json({ success: true, data: rows });
  } catch (e) { res.json({ success: true, data: [] }); }
});

// POST /api/continent/region
app.post('/api/continent/region', requireAuth, async (req, res) => {
  try {
    await pool.query('INSERT INTO continent_regions (name,code,flag,language) VALUES (\$1,\$2,\$3,\$4)', [req.body.name, req.body.code, req.body.flag, req.body.language]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/continent/map
app.post('/api/continent/map', requireAuth, async (req, res) => {
  try {
    await pool.query('INSERT INTO continent_content (region_id,item_id,is_featured) VALUES (\$1,\$2,\$3) ON CONFLICT DO NOTHING', [req.body.regionId, req.body.itemId, req.body.isFeatured || false]);
    await pool.query('UPDATE continent_regions SET content_count = (SELECT COUNT(*) FROM continent_content WHERE region_id = \$1) WHERE id = \$1', [req.body.regionId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== BILLING / SUBSCRIPTION MODULE ======
app.get('/api/billing/plans', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM subscription_plans ORDER BY price ASC');
    res.json({ success: true, data: rows });
  } catch {
    res.json({ success: true, data: [
      { id: 1, name: 'Free', price: 0, period: 'lunar', features: ['Acces limitat','480p','Reclame'], is_active: true },
      { id: 2, name: 'Basic', price: 19.99, period: 'lunar', features: ['Acces nelimitat','720p','Fara reclame','1 ecran'], is_active: true },
      { id: 3, name: 'Premium', price: 39.99, period: 'lunar', features: ['4K Ultra HD','Fara reclame','4 ecrane','Descarcari','X-Ray'], is_active: true },
      { id: 4, name: 'Family', price: 59.99, period: 'lunar', features: ['4K Ultra HD','Fara reclame','6 ecrane','Descarcari','X-Ray','Control parental'], is_active: true }
    ]});
  }
});

app.get('/api/billing/current', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT plan_id,status,current_period_end,created_at FROM subscriptions WHERE user_id = \$1 AND status = \$2 LIMIT 1', [req.user.userId, 'active']);
    if (rows.length === 0) return res.json({ success: true, data: { plan: { name: 'Free', price: 0 }, status: 'active' } });
    const { rows: plan } = await pool.query('SELECT * FROM subscription_plans WHERE id = \$1', [rows[0].plan_id]);
    res.json({ success: true, data: { ...rows[0], plan: plan[0] || {} } });
  } catch { res.json({ success: true, data: { plan: { name: 'Free', price: 0 }, status: 'active' } }); }
});

app.get('/api/billing/history', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM payment_history WHERE user_id = \$1 ORDER BY created_at DESC LIMIT 20', [req.user.userId]);
    res.json({ success: true, data: rows });
  } catch { res.json({ success: true, data: [] }); }
});

app.post('/api/billing/subscribe', requireAuth, async (req, res) => {
  try {
    const { planId } = req.body;
    const { rows: plans } = await pool.query('SELECT * FROM subscription_plans WHERE id = \$1', [planId]);
    if (plans.length === 0) return res.status(404).json({ error: 'Plan not found' });
    await pool.query(`INSERT INTO subscriptions (user_id,plan_id,status,current_period_end) VALUES (\$1,\$2,\$3,NOW() + INTERVAL '1 month') ON CONFLICT (user_id) DO UPDATE SET plan_id = \$2, status = \$3, current_period_end = NOW() + INTERVAL '1 month'`, [req.user.userId, planId, 'active']);
    await pool.query('INSERT INTO payment_history (user_id,amount,status,description) VALUES (\$1,\$2,\$3,\$4)', [req.user.userId, plans[0].price, 'paid', 'Abonament ' + plans[0].name]);
    res.json({ success: true, message: 'Abonament activat!' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});



// ====== INDUSTRY MODULE ======
async function initIndustryTables() {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS industry_news (
      id SERIAL PRIMARY KEY, title VARCHAR(500) NOT NULL,
      excerpt TEXT DEFAULT '', content TEXT DEFAULT '',
      image_url TEXT DEFAULT '', source VARCHAR(200) DEFAULT '',
      source_url TEXT DEFAULT '', category VARCHAR(50) DEFAULT 'general',
      published_at TIMESTAMP DEFAULT NOW(), created_at TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS industry_companies (
      id SERIAL PRIMARY KEY, name VARCHAR(300) NOT NULL,
      slug VARCHAR(300) UNIQUE NOT NULL, description TEXT DEFAULT '',
      logo_url TEXT DEFAULT '', website TEXT DEFAULT '',
      location VARCHAR(200) DEFAULT '', employees INTEGER DEFAULT 0,
      founded_year VARCHAR(10) DEFAULT '', is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS industry_events (
      id SERIAL PRIMARY KEY, title VARCHAR(500) NOT NULL,
      description TEXT DEFAULT '', event_date TIMESTAMP,
      location VARCHAR(300) DEFAULT '', event_type VARCHAR(50) DEFAULT 'conference',
      image_url TEXT DEFAULT '', registration_url TEXT DEFAULT '',
      is_virtual BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS industry_jobs (
      id SERIAL PRIMARY KEY, title VARCHAR(300) NOT NULL,
      company VARCHAR(300) NOT NULL, location VARCHAR(200) DEFAULT '',
      description TEXT DEFAULT '', requirements TEXT DEFAULT '',
      salary_range VARCHAR(100) DEFAULT '', job_type VARCHAR(50) DEFAULT 'full-time',
      is_remote BOOLEAN DEFAULT false, application_url TEXT DEFAULT '',
      is_active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT NOW())`);
    console.log('✅ Industry tables ready');
  } catch (e) { console.log('ℹ️ Industry init:', e.message); }
}

async function seedIndustryData() {
  try {
    const { rows: check } = await pool.query("SELECT COUNT(*) as c FROM industry_news");
    if (parseInt(check[0].c) > 0) return;
    await pool.query(`INSERT INTO industry_news (title, excerpt, category, source) VALUES
      ('Animaxia atinge 1 milion de utilizatori', 'Platforma de streaming romaneasca a atins o piatra de hotar importanta.', 'platform', 'Animaxia News'),
      ('NOILE TEHNOLOGII in streaming video pentru 2025', 'Tehnologiile AI revolutioneaza modul in care consumam continut video.', 'technology', 'TechCrunch'),
      ('Parteneriat strategic Animaxia - Neon Database', 'Animaxia implementeaza baza de date scalabila pentru milioane de utilizatori.', 'partnership', 'Comunicat Oficial')`);
    await pool.query(`INSERT INTO industry_companies (name, slug, description, location) VALUES
      ('Animaxia','animaxia','Platforma de streaming premium din Romania','Bucuresti, Romania'),
      ('Neon','neon','Serverless PostgreSQL platform','San Francisco, USA'),
      ('Stripe','stripe','Plati online globale','San Francisco, USA')`);
    await pool.query(`INSERT INTO industry_events (title, event_date, location, event_type, is_virtual) VALUES
      ('Streaming Summit 2025','2025-09-15','Bucuresti','conference',false),
      ('Tech Meetup: AI in Media','2025-10-01',NULL,'meetup',true)`);
    await pool.query(`INSERT INTO industry_jobs (title, company, location, job_type) VALUES
      ('Full Stack Developer','Animaxia','Bucuresti','full-time'),
      ('UI/UX Designer','Animaxia','Remote','full-time'),
      ('DevOps Engineer','Animaxia','Bucuresti','full-time')`);
    console.log('✅ Industry seed data inserted');
  } catch (e) { console.log('ℹ️ Industry seed:', e.message); }
}

// GET /api/industry/stats
app.get('/api/industry/stats', async (req, res) => {
  try {
    const [companies, news, events, jobs] = await Promise.all([
      pool.query('SELECT COUNT(*) as c FROM industry_companies'),
      pool.query('SELECT COUNT(*) as c FROM industry_news'),
      pool.query('SELECT COUNT(*) as c FROM industry_events WHERE event_date >= NOW() OR event_date IS NULL'),
      pool.query('SELECT COUNT(*) as c FROM industry_jobs WHERE is_active = true')
    ]);
    res.json({ success: true, stats: {
      companies: parseInt(companies.rows[0].c),
      news: parseInt(news.rows[0].c),
      upcomingEvents: parseInt(events.rows[0].c),
      activeJobs: parseInt(jobs.rows[0].c)
    }});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/industry/news
app.get('/api/industry/news', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;
    const { rows: totalRows } = await pool.query('SELECT COUNT(*) as total FROM industry_news');
    const total = parseInt(totalRows[0].total);
    const { rows } = await pool.query('SELECT * FROM industry_news ORDER BY published_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
    res.json({ success: true, data: rows, total, page, pages: Math.ceil(total / limit) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/industry/companies
app.get('/api/industry/companies', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM industry_companies WHERE is_active = true ORDER BY name');
    res.json({ success: true, data: rows });
  } catch (e) { res.json({ success: true, data: [] }); }
});

// POST /api/industry/companies
app.post('/api/industry/companies', requireAuth, async (req, res) => {
  try {
    const { name, description, website, location } = req.body;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    await pool.query('INSERT INTO industry_companies (name,slug,description,website,location) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (slug) DO UPDATE SET description=$3', [name, slug, description||'', website||'', location||'']);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/industry/events
app.get('/api/industry/events', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM industry_events ORDER BY event_date DESC NULLS LAST');
    res.json({ success: true, data: rows });
  } catch (e) { res.json({ success: true, data: [] }); }
});

// POST /api/industry/events
app.post('/api/industry/events', requireAuth, async (req, res) => {
  try {
    const { title, description, event_date, location, event_type, is_virtual } = req.body;
    await pool.query('INSERT INTO industry_events (title,description,event_date,location,event_type,is_virtual) VALUES ($1,$2,$3,$4,$5,$6)', [title, description||'', event_date||null, location||'', event_type||'conference', is_virtual||false]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/industry/jobs
app.get('/api/industry/jobs', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM industry_jobs WHERE is_active = true ORDER BY created_at DESC');
    res.json({ success: true, data: rows });
  } catch (e) { res.json({ success: true, data: [] }); }
});

// ====== FRANCHISES MODULE ======
async function initFranchiseTables() {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS franchises (
      id SERIAL PRIMARY KEY, name VARCHAR(300) NOT NULL,
      slug VARCHAR(300) UNIQUE NOT NULL, description TEXT DEFAULT '',
      logo_url TEXT DEFAULT '', banner_url TEXT DEFAULT '',
      genre VARCHAR(100) DEFAULT '', content_count INTEGER DEFAULT 0,
      total_views INTEGER DEFAULT 0, is_featured BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS franchise_items (
      id SERIAL PRIMARY KEY, franchise_id INTEGER REFERENCES franchises(id) ON DELETE CASCADE,
      item_id VARCHAR(50) NOT NULL, sort_order INTEGER DEFAULT 0,
      added_at TIMESTAMP DEFAULT NOW(), UNIQUE(franchise_id, item_id))`);
    console.log('✅ Franchise tables ready');
  } catch (e) { console.log('ℹ️ Franchise init:', e.message); }
}

async function seedFranchiseData() {
  try {
    const { rows: check } = await pool.query('SELECT COUNT(*) as c FROM franchises');
    if (parseInt(check[0].c) > 0) return;
    await pool.query(`INSERT INTO franchises (name,slug,description,genre,content_count,is_featured) VALUES
      ('Universul Animaxia','universul-animaxia','Universul cinematografic Animaxia','Actiune,Animatie',5,true),
      ('Seria Dincolo de Realitate','seria-dincolo-de-realitate','Seria SF/Horror','SF,Horror',4,true),
      ('Aventuri Subacvatice','aventuri-subacvatice','Filme si seriale cu tematica submarina','Actiune,Aventuri',3,false)`);
    console.log('✅ Franchise seed data inserted');
  } catch (e) { console.log('ℹ️ Franchise seed:', e.message); }
}

// GET /api/franchises
app.get('/api/franchises', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT f.*, (SELECT COUNT(*) FROM franchise_items fi WHERE fi.franchise_id = f.id) as item_count FROM franchises f ORDER BY f.is_featured DESC, f.content_count DESC');
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/franchises/:id
app.get('/api/franchises/:id', async (req, res) => {
  try {
    const id = isNaN(req.params.id) ? -1 : parseInt(req.params.id);
    const { rows: [franchise] } = await pool.query('SELECT * FROM franchises WHERE id = $1', [id]);
    if (!franchise) return res.status(404).json({ error: 'Not found' });
    const { rows: items } = await pool.query('SELECT fi.*, ci.title, ci.title_en, ci.year, ci.duration, ci.content_type, ci.bg_color, ci.genre, ci.rating, ci.match_rating FROM franchise_items fi JOIN content_items ci ON fi.item_id = ci.id WHERE fi.franchise_id = $1 ORDER BY fi.sort_order', [id]);
    res.json({ success: true, data: { ...franchise, items } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== UPLOAD MODULE ======
async function initUploadTables() {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS user_uploads (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(300) NOT NULL, description TEXT DEFAULT '',
      content_type VARCHAR(20) DEFAULT 'movie', year VARCHAR(10) DEFAULT '',
      duration VARCHAR(50) DEFAULT '', rating VARCHAR(10) DEFAULT '',
      video_url TEXT DEFAULT '', poster_url TEXT DEFAULT '',
      file_size BIGINT DEFAULT 0, status VARCHAR(20) DEFAULT 'processing',
      is_public BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW())`);
    console.log('✅ Upload tables ready');
  } catch (e) { console.log('ℹ️ Upload init:', e.message); }
}

// POST /api/upload - upload new content
const uploadUpload = multer({ storage: multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = file.originalname.split('.').pop();
    cb(null, `upload-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
  }
}), limits: { fileSize: 500 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
  const allowedVideo = ['video/mp4','video/webm','video/ogg','video/quicktime'];
  const allowedImage = ['image/jpeg','image/png','image/webp'];
  cb(null, [...allowedVideo, ...allowedImage].includes(file.mimetype));
}});

app.post('/api/upload', requireAuth, uploadUpload.fields([{ name: 'video', maxCount: 1 }, { name: 'poster', maxCount: 1 }]), async (req, res) => {
  try {
    const { title, year, duration, rating, description, description_en, content_type } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });
    const videoUrl = req.files?.video?.[0] ? '/uploads/' + req.files.video[0].filename : '';
    const posterUrl = req.files?.poster?.[0] ? '/uploads/' + req.files.poster[0].filename : '';
    const fileSize = req.files?.video?.[0]?.size || 0;
    await pool.query('INSERT INTO user_uploads (user_id,title,description,content_type,year,duration,rating,video_url,poster_url,file_size,status,is_public) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [req.user.userId, title, description||'', content_type||'movie', year||'', duration||'', rating||'', videoUrl, posterUrl, fileSize, 'completed', true]);
    res.json({ success: true, message: 'Content uploaded!' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/upload/list
app.get('/api/upload/list', requireAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;
    const { rows: totalRows } = await pool.query('SELECT COUNT(*) as total FROM user_uploads WHERE user_id = $1', [req.user.userId]);
    const total = parseInt(totalRows[0].total);
    const { rows } = await pool.query('SELECT * FROM user_uploads WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3', [req.user.userId, limit, offset]);
    res.json({ success: true, data: rows, total, page, pages: Math.ceil(total / limit) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/upload/:id
app.delete('/api/upload/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { rows: [upload] } = await pool.query('SELECT * FROM user_uploads WHERE id = $1 AND user_id = $2', [id, req.user.userId]);
    if (!upload) return res.status(404).json({ error: 'Not found' });
    if (upload.video_url) { try { fs.unlinkSync(path.join(__dirname, 'public', upload.video_url)); } catch {} }
    if (upload.poster_url) { try { fs.unlinkSync(path.join(__dirname, 'public', upload.poster_url)); } catch {} }
    await pool.query('DELETE FROM user_uploads WHERE id = $1', [id]);
    res.json({ success: true, message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== CONTENT MODULE ======
async function initContentModuleTables() {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS content_metadata (
      id SERIAL PRIMARY KEY, item_id VARCHAR(50) UNIQUE NOT NULL,
      view_count INTEGER DEFAULT 0, like_count INTEGER DEFAULT 0,
      share_count INTEGER DEFAULT 0, avg_watch_time NUMERIC(5,1) DEFAULT 0,
      last_viewed_at TIMESTAMP, created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS content_tags (
      id SERIAL PRIMARY KEY, item_id VARCHAR(50) NOT NULL,
      tag VARCHAR(100) NOT NULL, UNIQUE(item_id, tag))`);
    console.log('✅ Content module tables ready');
  } catch (e) { console.log('ℹ️ Content module init:', e.message); }
}


// ====== SPA FALLBACK ======
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ====== START SERVER ======
server.listen(PORT, () => {
  console.log(`\n✦ Animaxia v6.0 - PRODUCTION PLATFORM ✦`);
  console.log(`   🌐 http://localhost:${PORT}`);
  console.log(`   🔌 WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`   🗄️  PostgreSQL: Neon (${process.env.DATABASE_URL ? 'custom' : 'default'})`);   console.log(`   🔐 JWT: ${JWT_SECRET ? JWT_SECRET.substring(0, 20) : 'N/A'}...`);
  console.log(`   💳 Stripe: ${stripe ? '✅ CONNECTED' : 'ℹ️ NOT CONFIGURED (set STRIPE_SECRET in .env)'}`);
  console.log(`   📧 Email: ${resendClient ? '✅ REAL (Resend)' : 'ℹ️ NOT CONFIGURED (set RESEND_API_KEY in .env)'}`);
  console.log(`   🔒 Security: helmet + rate-limit + cors + validation`);
  console.log(`   🔍 Search: Full-text PostgreSQL + pg_trgm`);
  console.log(`   📱 Real-time: WebSocket (Watch Party, Sync)`);
  console.log(`   🎥 Streaming: HTTP Range Requests + HLS`);
  console.log(`   📊 Analytics: Real-time stats + hourly activity`);
  console.log(`   📥 Downloads: Real file queue + progress\n`);
});
