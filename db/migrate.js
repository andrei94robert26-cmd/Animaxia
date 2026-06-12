/**
 * Animaxia v5.0 - Database Migration
 * Admin Dashboard + Reviews + Watch History + Recommendations + Downloads
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATABASE_URL = process.env.DATABASE_URL || 
  'postgresql://neondb_owner:npg_mHoXu7N8AYWT@ep-odd-flower-a2ks7aoy-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require';

async function migrate() {
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  console.log('🚀 Animaxia v5.0 Migration Starting...\n');

  try {
    const { rows: [t] } = await pool.query('SELECT NOW() as time');
    console.log(`✅ Connected at ${t.time}`);

    await pool.query(`DROP TABLE IF EXISTS programs, channels, notifications, continue_watching, 
      ratings, watchlists, category_items, categories, content_items, 
      profiles, password_resets, email_verifications, google_auth, 
      users, api_keys, episodes, kids_pins, user_languages, 
      user_device_sessions, content_reviews, download_queue,
      watch_history, admin_logs, content_suggestions CASCADE`);

    // USERS
    await pool.query(`CREATE TABLE users (id SERIAL PRIMARY KEY, email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL DEFAULT '', name VARCHAR(100) NOT NULL DEFAULT '',
      plan VARCHAR(50) DEFAULT 'Free', email_verified BOOLEAN DEFAULT false,
      google_id VARCHAR(255) UNIQUE DEFAULT NULL, avatar_url TEXT DEFAULT '',
      preferred_language VARCHAR(5) DEFAULT 'ro', role VARCHAR(20) DEFAULT 'user',
      created_at TIMESTAMP DEFAULT NOW(), last_login TIMESTAMP DEFAULT NOW())`);
    console.log('✅ users (with role field)');

    // PROFILES
    await pool.query(`CREATE TABLE profiles (id VARCHAR(10) PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, name VARCHAR(50) NOT NULL,
      color VARCHAR(20) DEFAULT '#e17055', is_kid BOOLEAN DEFAULT false,
      kids_pin VARCHAR(6) DEFAULT '', avatar_url TEXT DEFAULT '',
      preferred_language VARCHAR(5) DEFAULT 'ro')`);
    console.log('✅ profiles');

    await pool.query(`CREATE TABLE email_verifications (id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, token VARCHAR(64) UNIQUE NOT NULL,
      expires_at TIMESTAMP NOT NULL, created_at TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE password_resets (id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, token VARCHAR(64) UNIQUE NOT NULL,
      expires_at TIMESTAMP NOT NULL, used BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE google_auth (id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, google_id VARCHAR(255) UNIQUE NOT NULL,
      email VARCHAR(255) NOT NULL, name VARCHAR(100) DEFAULT '', picture TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW())`);

    // CONTENT
    await pool.query(`CREATE TABLE content_items (id VARCHAR(20) PRIMARY KEY,
      title VARCHAR(255) NOT NULL, title_en VARCHAR(255) DEFAULT '',
      year VARCHAR(20) DEFAULT '', duration VARCHAR(50) DEFAULT '',
      rating VARCHAR(10) DEFAULT '', genre TEXT[] DEFAULT '{}',
      match_rating VARCHAR(5) DEFAULT '95%', bg_color VARCHAR(20) DEFAULT '#1e1e2e',
      content_type VARCHAR(20) DEFAULT 'movie', episodes INTEGER DEFAULT 0,
      seasons INTEGER DEFAULT 1, cast_members TEXT[] DEFAULT '{}',
      description TEXT DEFAULT '', description_en TEXT DEFAULT '',
      backdrop_color VARCHAR(200) DEFAULT 'linear-gradient(135deg, #667eea, #764ba2)',
      trailer_url VARCHAR(500) DEFAULT '', poster_url VARCHAR(500) DEFAULT '',
      is_featured BOOLEAN DEFAULT false, is_kid_friendly BOOLEAN DEFAULT true,
      view_count INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT NOW())`);

    // EPISODES
    await pool.query(`CREATE TABLE episodes (id SERIAL PRIMARY KEY,
      item_id VARCHAR(20) REFERENCES content_items(id) ON DELETE CASCADE,
      season_number INTEGER NOT NULL DEFAULT 1, episode_number INTEGER NOT NULL DEFAULT 1,
      title VARCHAR(255) NOT NULL, title_en VARCHAR(255) DEFAULT '',
      description TEXT DEFAULT '', description_en TEXT DEFAULT '',
      duration VARCHAR(20) DEFAULT '45min', video_url VARCHAR(500) DEFAULT '',
      thumbnail_color VARCHAR(20) DEFAULT '#2d3436',
      UNIQUE(item_id, season_number, episode_number))`);

    // CATEGORIES
    await pool.query(`CREATE TABLE categories (id VARCHAR(50) PRIMARY KEY,
      title VARCHAR(255) NOT NULL, title_en VARCHAR(255) DEFAULT '', display_order INTEGER DEFAULT 0)`);
    await pool.query(`CREATE TABLE category_items (category_id VARCHAR(50) REFERENCES categories(id) ON DELETE CASCADE,
      item_id VARCHAR(20) REFERENCES content_items(id) ON DELETE CASCADE,
      item_order INTEGER DEFAULT 0, PRIMARY KEY (category_id, item_id))`);

    // WATCHLISTS & RATINGS & CONTINUE
    await pool.query(`CREATE TABLE watchlists (id SERIAL PRIMARY KEY,
      profile_id VARCHAR(10) REFERENCES profiles(id) ON DELETE CASCADE,
      item_id VARCHAR(20) REFERENCES content_items(id) ON DELETE CASCADE,
      added_at TIMESTAMP DEFAULT NOW(), UNIQUE(profile_id, item_id))`);
    await pool.query(`CREATE TABLE ratings (id SERIAL PRIMARY KEY,
      profile_id VARCHAR(10) REFERENCES profiles(id) ON DELETE CASCADE,
      item_id VARCHAR(20) REFERENCES content_items(id) ON DELETE CASCADE,
      liked BOOLEAN NOT NULL, created_at TIMESTAMP DEFAULT NOW(), UNIQUE(profile_id, item_id))`);
    await pool.query(`CREATE TABLE continue_watching (id SERIAL PRIMARY KEY,
      profile_id VARCHAR(10) REFERENCES profiles(id) ON DELETE CASCADE,
      item_id VARCHAR(20) REFERENCES content_items(id) ON DELETE CASCADE,
      progress INTEGER DEFAULT 0, episode VARCHAR(20) DEFAULT '',
      season_number INTEGER DEFAULT 1, episode_number INTEGER DEFAULT 1,
      updated_at TIMESTAMP DEFAULT NOW(), UNIQUE(profile_id, item_id))`);

    // ====== NEW TABLES ======

    // CONTENT REVIEWS (star rating + comment)
    await pool.query(`CREATE TABLE content_reviews (id SERIAL PRIMARY KEY,
      profile_id VARCHAR(10) REFERENCES profiles(id) ON DELETE CASCADE,
      item_id VARCHAR(20) REFERENCES content_items(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL DEFAULT 5 CHECK (rating >= 1 AND rating <= 5),
      comment TEXT DEFAULT '', created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(), UNIQUE(profile_id, item_id))`);
    console.log('✅ content_reviews');

    // WATCH HISTORY
    await pool.query(`CREATE TABLE watch_history (id SERIAL PRIMARY KEY,
      profile_id VARCHAR(10) REFERENCES profiles(id) ON DELETE CASCADE,
      item_id VARCHAR(20) REFERENCES content_items(id) ON DELETE CASCADE,
      episode_id INTEGER REFERENCES episodes(id) ON DELETE SET NULL,
      watched_at TIMESTAMP DEFAULT NOW(), duration_seconds INTEGER DEFAULT 0,
      completed BOOLEAN DEFAULT false)`);
    console.log('✅ watch_history');

    // DOWNLOAD QUEUE
    await pool.query(`CREATE TABLE download_queue (id SERIAL PRIMARY KEY,
      profile_id VARCHAR(10) REFERENCES profiles(id) ON DELETE CASCADE,
      item_id VARCHAR(20) REFERENCES content_items(id) ON DELETE CASCADE,
      episode_id INTEGER REFERENCES episodes(id) ON DELETE SET NULL,
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','downloading','completed','failed')),
      progress INTEGER DEFAULT 0, size_mb INTEGER DEFAULT 0,
      added_at TIMESTAMP DEFAULT NOW(), completed_at TIMESTAMP)`);
    console.log('✅ download_queue');

    // ADMIN LOGS
    await pool.query(`CREATE TABLE admin_logs (id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      action VARCHAR(100) NOT NULL, details TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW())`);
    console.log('✅ admin_logs');

    // CONTENT SUGGESTIONS (recommendations)
    await pool.query(`CREATE TABLE content_suggestions (id SERIAL PRIMARY KEY,
      profile_id VARCHAR(10) REFERENCES profiles(id) ON DELETE CASCADE,
      item_id VARCHAR(20) REFERENCES content_items(id) ON DELETE CASCADE,
      score DECIMAL(5,2) DEFAULT 0, reason VARCHAR(100) DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW())`);
    console.log('✅ content_suggestions');

    // NOTIFICATIONS + CHANNELS + PROGRAMS + KIDS PINS + USER LANGUAGES + DEVICE SESSIONS
    await pool.query(`CREATE TABLE notifications (id VARCHAR(10) PRIMARY KEY,
      type VARCHAR(50) DEFAULT 'info', message TEXT NOT NULL, message_en TEXT DEFAULT '',
      time_ago VARCHAR(20) DEFAULT '', is_read BOOLEAN DEFAULT false,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE DEFAULT NULL,
      link_url VARCHAR(500) DEFAULT '', created_at TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE channels (id VARCHAR(10) PRIMARY KEY,
      name VARCHAR(100) NOT NULL, name_en VARCHAR(100) DEFAULT '',
      category VARCHAR(50) DEFAULT 'General', icon VARCHAR(50) DEFAULT 'tv',
      bg_color VARCHAR(20) DEFAULT '#e17055')`);
    await pool.query(`CREATE TABLE programs (id SERIAL PRIMARY KEY,
      channel_id VARCHAR(10) REFERENCES channels(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL, title_en VARCHAR(255) DEFAULT '',
      start_time VARCHAR(10) DEFAULT '00:00', end_time VARCHAR(10) DEFAULT '01:00',
      program_type VARCHAR(50) DEFAULT 'talk')`);
    await pool.query(`CREATE TABLE kids_pins (id SERIAL PRIMARY KEY,
      profile_id VARCHAR(10) REFERENCES profiles(id) ON DELETE CASCADE, pin VARCHAR(6) NOT NULL DEFAULT '0000',
      max_watch_hours INTEGER DEFAULT 2, content_filter VARCHAR(20) DEFAULT 'kids_only',
      is_active BOOLEAN DEFAULT true, UNIQUE(profile_id))`);
    await pool.query(`CREATE TABLE user_languages (id SERIAL PRIMARY KEY,
      profile_id VARCHAR(10) REFERENCES profiles(id) ON DELETE CASCADE,
      language VARCHAR(5) NOT NULL DEFAULT 'ro', subtitles_enabled BOOLEAN DEFAULT true,
      subtitle_language VARCHAR(5) DEFAULT 'ro', audio_language VARCHAR(5) DEFAULT 'ro',
      UNIQUE(profile_id))`);
    await pool.query(`CREATE TABLE user_device_sessions (id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      device_name VARCHAR(100) DEFAULT '', device_type VARCHAR(50) DEFAULT 'web',
      ip_address VARCHAR(50) DEFAULT '', last_active TIMESTAMP DEFAULT NOW())`);
    console.log('✅ All 25 tables created');

    // ====== SEED ======
    console.log('\n🌱 Seeding...');
    const dataContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'data.js'), 'utf-8');
    const match = dataContent.match(/const AnimaxiaData\s*=\s*({[\s\S]*?});/);
    const data = new Function('return (' + match[1] + ')')();

    // Demo user (admin)
    const demoHash = await bcrypt.hash('animaxia123', 10);
    const { rows: [user] } = await pool.query(
      `INSERT INTO users (email, password_hash, name, plan, email_verified, preferred_language, role) 
       VALUES ($1, $2, $3, $4, true, 'ro', 'admin') RETURNING id`,
      ['demo@animaxia.ro', demoHash, 'Andrei Popescu', 'Premium']);
    const userId = user.id;

    const testHash = await bcrypt.hash('test123456', 10);
    await pool.query(
      `INSERT INTO users (email, password_hash, name, plan, email_verified, preferred_language, role) 
       VALUES ($1, $2, $3, $4, true, 'en', 'user') RETURNING id`,
      ['test@animaxia.ro', testHash, 'Maria Ionescu', 'Standard']);
    console.log('✅ Users (demo=admin role)');

    // Profiles
    for (const p of data.profiles || []) {
      await pool.query(`INSERT INTO profiles (id, user_id, name, color, is_kid, kids_pin) 
        VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
        [p.id, userId, p.name, p.color, p.kid || false, p.kid ? '1234' : '']);
    }

    // Content
    for (const item of [...(data.featured||[]), ...data.categories.flatMap(c => c.items||[])]) {
      await pool.query(
        `INSERT INTO content_items (id, title, title_en, year, duration, rating, genre, match_rating, bg_color,
         content_type, episodes, seasons, cast_members, description, description_en, backdrop_color, 
         trailer_url, is_featured, is_kid_friendly, view_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,CEIL(RANDOM()*5000))
         ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title`,
        [item.id, item.title, item.title_en || item.title, item.year||'', item.duration||'', 
         item.rating||'', item.genre||[], item.match||'95%', item.bgColor||'#1e1e2e',
         item.type||'movie', item.episodes||0, item.seasons || (item.type === 'series' ? 3 : 1),
         item.cast||[], item.description||'', item.description_en || item.description || '',
         item.backdropColor||'', item.trailer_url||'', data.featured?.includes(item) || false,
         !item.genre?.some(g => ['thriller','crima'].includes(g?.toLowerCase?.()||''))]);
    }
    console.log('✅ Content seeded');

    // Categories
    for (const cat of data.categories || []) {
      await pool.query(`INSERT INTO categories (id, title, title_en, display_order) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [cat.id, cat.title, cat.title_en || cat.title, data.categories.indexOf(cat)]);
      for (let i = 0; i < cat.items.length; i++) {
        await pool.query(`INSERT INTO category_items (category_id, item_id, item_order) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [cat.id, cat.items[i].id, i]);
      }
    }

    // Episodes for series
    const seriesItems = [...new Map([...(data.featured||[]), ...data.categories.flatMap(c => c.items||[])]
      .filter(item => item.type === 'series').map(s => [s.id, s])).values()].slice(0, 5);
    for (const series of seriesItems) {
      const totalEps = series.episodes || 10;
      const totalSeasons = Math.ceil(totalEps / 8);
      let epCount = 0;
      for (let s = 1; s <= totalSeasons; s++) {
        const eps = Math.min(8, totalEps - epCount);
        for (let e = 1; e <= eps; e++) {
          epCount++;
          await pool.query(
            `INSERT INTO episodes (item_id, season_number, episode_number, title, title_en, description, duration, thumbnail_color)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
            [series.id, s, e, `Episodul ${epCount}`, `Episode ${epCount}`,
             `Episod ${epCount} din ${series.title}`, `${40+Math.floor(Math.random()*20)}min`, series.bgColor||'#2d3436']);
        }
      }
    }
    console.log('✅ Episodes');

    // Sample reviews
    const allItems = [...(data.featured||[]), ...data.categories.flatMap(c => c.items||[])];
    const profiles = ['p1','p2','p3'];
    for (let i = 0; i < Math.min(15, allItems.length); i++) {
      const item = allItems[i];
      const profileId = profiles[i % profiles.length];
      const stars = Math.floor(Math.random() * 3) + 3; // 3-5 stars
      const comments = {
        5: 'Excelent! O producție de nota 10. 👏',
        4: 'Foarte bun, recomand cu căldură!',
        3: 'OK, putea fi mai bun.',
      };
      await pool.query(
        `INSERT INTO content_reviews (profile_id, item_id, rating, comment)
         VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [profileId, item.id, stars, comments[stars] || 'Film bun!']);
    }
    // Bulk insert watch history
    for (let i = 0; i < 20; i++) {
      const item = allItems[Math.floor(Math.random() * allItems.length)];
      const profileId = profiles[Math.floor(Math.random() * profiles.length)];
      const daysAgo = Math.floor(Math.random() * 14);
      const completed = Math.random() > 0.4;
      await pool.query(
        `INSERT INTO watch_history (profile_id, item_id, watched_at, duration_seconds, completed)
         VALUES ($1, $2, NOW() - INTERVAL '1 day' * $3, $4, $5)`,
        [profileId, item.id, daysAgo, Math.floor(Math.random() * 7200), completed]);
    }
    console.log('✅ Reviews & Watch History seeded');

    // Admin log
    await pool.query(`INSERT INTO admin_logs (user_id, action, details) VALUES ($1, 'platform_launch', 'Animaxia v5.0 launched successfully')`, [userId]);
    await pool.query(`INSERT INTO admin_logs (user_id, action, details) VALUES ($1, 'content_added', 'Seeded 59 content items')`, [userId]);
    await pool.query(`INSERT INTO admin_logs (user_id, action, details) VALUES ($1, 'admin_login', 'Admin dashboard initialized')`, [userId]);
    console.log('✅ Admin logs');

    // Notifications
    const notifs = [
      ...(data.notifications||[]).map(n => ({id:n.id, type:n.type, message:n.message, message_en:n.message_en||n.message, time:n.time, read:n.read||false})),
      {id:'n5', type:'new_episode', message:'Episodul 8 din "Noua Era" a fost adăugat!', message_en:'Episode 8 of "New Era" added!', time:'30min ago'},
      {id:'n6', type:'recommendation', message:'Bazat pe ce ai vizionat, ți-ar plăcea "Regatul Magic"', message_en:'Based on your history, try "Magic Kingdom"', time:'2h ago'},
    ];
    for (const n of notifs) await pool.query(
      `INSERT INTO notifications (id, type, message, message_en, time_ago, is_read) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
      [n.id, n.type, n.message, n.message_en, n.time, n.read]);

    console.log('\n🎉 Migration v5.0 complete!');
    console.log(`   - 25 tables (reviews, watch_history, downloads, admin_logs, suggestions)`);
    console.log(`   - Admin: demo@animaxia.ro / animaxia123 (role: admin)`);
    console.log(`   - Reviews: 15 sample reviews seeded`);
    console.log(`   - Watch History: 20 entries seeded`);
    console.log(`   - Admin logs: 3 initial entries`);
  } catch (e) { console.error('❌ Failed:', e.message); process.exit(1); }
  finally { await pool.end(); }
}
migrate();
