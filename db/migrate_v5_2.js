/**
 * Animaxia v5.2 - New Features Migration
 * Search History, Age Verification, Collections, Watch Party, 
 * Content Ratings, Enhanced Episode Progress
 */

require('dotenv').config();
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/animaxia';

async function migrate() {
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1') ? false : { rejectUnauthorized: false } });
  console.log('🚀 Animaxia v5.2 Migration Starting...\n');

  try {
    const { rows: [t] } = await pool.query('SELECT NOW() as time');
    console.log(`✅ Connected at ${t.time}`);

    // ====== 1. SEARCH HISTORY ======
    await pool.query(`CREATE TABLE IF NOT EXISTS search_history (
      id SERIAL PRIMARY KEY,
      profile_id VARCHAR(10) REFERENCES profiles(id) ON DELETE CASCADE,
      query TEXT NOT NULL,
      results_count INTEGER DEFAULT 0,
      searched_at TIMESTAMP DEFAULT NOW()
    )`);
    console.log('✅ search_history');

    await pool.query(`CREATE TABLE IF NOT EXISTS trending_searches (
      id SERIAL PRIMARY KEY,
      query TEXT NOT NULL UNIQUE,
      search_count INTEGER DEFAULT 1,
      last_searched_at TIMESTAMP DEFAULT NOW()
    )`);
    console.log('✅ trending_searches');

    // ====== 2. AGE VERIFICATION ======
    await pool.query(`CREATE TABLE IF NOT EXISTS age_verifications (
      id SERIAL PRIMARY KEY,
      profile_id VARCHAR(10) REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
      birth_date DATE,
      age_verified BOOLEAN DEFAULT false,
      verified_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )`);
    console.log('✅ age_verifications');

    // ====== 3. USER COLLECTIONS ======
    await pool.query(`CREATE TABLE IF NOT EXISTS collections (
      id SERIAL PRIMARY KEY,
      profile_id VARCHAR(10) REFERENCES profiles(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      description TEXT DEFAULT '',
      is_public BOOLEAN DEFAULT false,
      cover_color VARCHAR(20) DEFAULT '#6c5ce7',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`);
    console.log('✅ collections');

    await pool.query(`CREATE TABLE IF NOT EXISTS collection_items (
      id SERIAL PRIMARY KEY,
      collection_id INTEGER REFERENCES collections(id) ON DELETE CASCADE,
      item_id VARCHAR(20) REFERENCES content_items(id) ON DELETE CASCADE,
      added_at TIMESTAMP DEFAULT NOW(),
      note TEXT DEFAULT '',
      UNIQUE(collection_id, item_id)
    )`);
    console.log('✅ collection_items');

    // ====== 4. WATCH PARTY (GroupWatch) ======
    await pool.query(`CREATE TABLE IF NOT EXISTS watch_party_rooms (
      id VARCHAR(20) PRIMARY KEY,
      profile_id VARCHAR(10) REFERENCES profiles(id) ON DELETE CASCADE,
      item_id VARCHAR(20) REFERENCES content_items(id) ON DELETE CASCADE,
      episode_id INTEGER REFERENCES episodes(id) ON DELETE SET NULL,
      status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting','playing','paused','ended')),
      playhead_time DECIMAL(10,2) DEFAULT 0,
      is_playing BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      ended_at TIMESTAMP
    )`);
    console.log('✅ watch_party_rooms');

    await pool.query(`CREATE TABLE IF NOT EXISTS watch_party_participants (
      id SERIAL PRIMARY KEY,
      room_id VARCHAR(20) REFERENCES watch_party_rooms(id) ON DELETE CASCADE,
      profile_id VARCHAR(10) REFERENCES profiles(id) ON DELETE CASCADE,
      profile_name VARCHAR(50) DEFAULT '',
      profile_color VARCHAR(20) DEFAULT '#6c5ce7',
      is_host BOOLEAN DEFAULT false,
      is_ready BOOLEAN DEFAULT false,
      joined_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(room_id, profile_id)
    )`);
    console.log('✅ watch_party_participants');

    await pool.query(`CREATE TABLE IF NOT EXISTS watch_party_messages (
      id SERIAL PRIMARY KEY,
      room_id VARCHAR(20) REFERENCES watch_party_rooms(id) ON DELETE CASCADE,
      profile_id VARCHAR(10) REFERENCES profiles(id) ON DELETE CASCADE,
      profile_name VARCHAR(50) DEFAULT '',
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`);
    console.log('✅ watch_party_messages');

    // ====== 5. ENHANCED EPISODE PROGRESS ======
    await pool.query(`CREATE TABLE IF NOT EXISTS episode_progress (
      id SERIAL PRIMARY KEY,
      profile_id VARCHAR(10) REFERENCES profiles(id) ON DELETE CASCADE,
      episode_id INTEGER REFERENCES episodes(id) ON DELETE CASCADE,
      item_id VARCHAR(20) REFERENCES content_items(id) ON DELETE CASCADE,
      progress_seconds INTEGER DEFAULT 0,
      duration_seconds INTEGER DEFAULT 0,
      completed BOOLEAN DEFAULT false,
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(profile_id, episode_id)
    )`);
    console.log('✅ episode_progress');

    // ====== 6. EMAIL NOTIFICATIONS LOG ======
    await pool.query(`CREATE TABLE IF NOT EXISTS email_notification_log (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      email_type VARCHAR(50) NOT NULL,
      recipient_email VARCHAR(255) NOT NULL,
      subject VARCHAR(255) NOT NULL,
      sent_at TIMESTAMP DEFAULT NOW(),
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
      error_message TEXT DEFAULT ''
    )`);
    console.log('✅ email_notification_log');

    // ====== 7. CONTENT RATINGS ENHANCED ======
    await pool.query(`CREATE TABLE IF NOT EXISTS content_age_ratings (
      id SERIAL PRIMARY KEY,
      item_id VARCHAR(20) REFERENCES content_items(id) ON DELETE CASCADE UNIQUE,
      mpaa_rating VARCHAR(10) DEFAULT '',
      min_age INTEGER DEFAULT 0,
      has_violence BOOLEAN DEFAULT false,
      has_language BOOLEAN DEFAULT false,
      has_sexual_content BOOLEAN DEFAULT false,
      has_drugs BOOLEAN DEFAULT false,
      has_fear BOOLEAN DEFAULT false
    )`);
    console.log('✅ content_age_ratings');

    console.log('\n🎉 Migration v5.2 complete!');
    console.log('   - 12 new tables (search, age, collections, watch party, progress, email log, ratings)');
  } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); }
  finally { await pool.end(); }
}
migrate();
