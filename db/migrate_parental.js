/**
 * Animaxia v5.1 - Parental Controls Migration
 * Screen time limits, content restrictions, activity reports
 */

const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/animaxia';

async function migrate() {
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  console.log('🚀 Parental Controls Migration...\n');

  try {
    // Screen time limits: daily limit per profile (in minutes)
    await pool.query(`CREATE TABLE IF NOT EXISTS screen_time_limits (
      id SERIAL PRIMARY KEY,
      profile_id VARCHAR(10) REFERENCES profiles(id) ON DELETE CASCADE,
      daily_limit_minutes INTEGER DEFAULT 120,
      monday INTEGER DEFAULT 120, tuesday INTEGER DEFAULT 120,
      wednesday INTEGER DEFAULT 120, thursday INTEGER DEFAULT 120,
      friday INTEGER DEFAULT 120, saturday INTEGER DEFAULT 180,
      sunday INTEGER DEFAULT 180,
      bedtime_start VARCHAR(5) DEFAULT '21:00',
      bedtime_end VARCHAR(5) DEFAULT '07:00',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(profile_id))`);
    console.log('✅ screen_time_limits');

    // Daily usage tracking: tracks actual watch time per day
    await pool.query(`CREATE TABLE IF NOT EXISTS daily_usage (
      id SERIAL PRIMARY KEY,
      profile_id VARCHAR(10) REFERENCES profiles(id) ON DELETE CASCADE,
      date DATE NOT NULL DEFAULT CURRENT_DATE,
      minutes_watched INTEGER DEFAULT 0,
      sessions_count INTEGER DEFAULT 0,
      UNIQUE(profile_id, date))`);
    console.log('✅ daily_usage');

    // Content blocklist: parents can block specific content or genres
    await pool.query(`CREATE TABLE IF NOT EXISTS content_blocklist (
      id SERIAL PRIMARY KEY,
      profile_id VARCHAR(10) REFERENCES profiles(id) ON DELETE CASCADE,
      item_id VARCHAR(20) REFERENCES content_items(id) ON DELETE CASCADE,
      genre VARCHAR(50) DEFAULT NULL,
      reason VARCHAR(100) DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(profile_id, item_id))`);
    console.log('✅ content_blocklist');

    // Content approval requests: child requests parent approval
    await pool.query(`CREATE TABLE IF NOT EXISTS approval_requests (
      id SERIAL PRIMARY KEY,
      profile_id VARCHAR(10) REFERENCES profiles(id) ON DELETE CASCADE,
      item_id VARCHAR(20) REFERENCES content_items(id) ON DELETE CASCADE,
      parent_profile_id VARCHAR(10) REFERENCES profiles(id) ON DELETE CASCADE,
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
      created_at TIMESTAMP DEFAULT NOW(),
      responded_at TIMESTAMP)`);
    console.log('✅ approval_requests');

    // Activity reports summary (pre-computed for performance)
    await pool.query(`CREATE TABLE IF NOT EXISTS activity_summary (
      id SERIAL PRIMARY KEY,
      profile_id VARCHAR(10) REFERENCES profiles(id) ON DELETE CASCADE,
      week_start DATE NOT NULL,
      total_minutes INTEGER DEFAULT 0,
      total_sessions INTEGER DEFAULT 0,
      unique_items INTEGER DEFAULT 0,
      favorite_genre VARCHAR(50) DEFAULT '',
      peak_hour INTEGER DEFAULT 0,
      UNIQUE(profile_id, week_start))`);
    console.log('✅ activity_summary');

    console.log('\n🎉 Parental Controls Migration Complete!');
  } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); }
  finally { await pool.end(); }
}

migrate();
