/**
 * Animaxia v6.0 - Production Features Migration
 * Real streaming, payments, notifications, analytics
 */
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const DATABASE_URL = process.env.DATABASE_URL || 
  'postgresql://neondb_owner:npg_mHoXu7N8AYWT@ep-odd-flower-a2ks7aoy-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require';

async function migrate() {
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  console.log('🚀 Animaxia v6.0 Production Migration...\n');

  try {
    // Notification preferences for push/email
    await pool.query(`CREATE TABLE IF NOT EXISTS notification_preferences (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
      push_enabled BOOLEAN DEFAULT true,
      email_notifications BOOLEAN DEFAULT true,
      marketing_emails BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`);
    console.log('✅ notification_preferences');

    // Payment transactions log
    await pool.query(`CREATE TABLE IF NOT EXISTS payment_transactions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      stripe_session_id VARCHAR(255),
      plan VARCHAR(50) NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      currency VARCHAR(10) DEFAULT 'ron',
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','refunded')),
      payment_method VARCHAR(50) DEFAULT 'card',
      created_at TIMESTAMP DEFAULT NOW(),
      completed_at TIMESTAMP
    )`);
    console.log('✅ payment_transactions');

    // User activity log for analytics
    await pool.query(`CREATE TABLE IF NOT EXISTS user_activity_log (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      profile_id VARCHAR(10) REFERENCES profiles(id) ON DELETE CASCADE,
      activity_type VARCHAR(50) NOT NULL,
      item_id VARCHAR(20) REFERENCES content_items(id) ON DELETE SET NULL,
      metadata JSONB DEFAULT '{}',
      ip_address VARCHAR(50) DEFAULT '',
      user_agent TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW()
    )`);
    console.log('✅ user_activity_log');

    // Create indexes for performance
    await pool.query('CREATE INDEX IF NOT EXISTS idx_watch_history_profile_date ON watch_history(profile_id, watched_at DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_content_type ON content_items(content_type)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_content_genre ON content_items USING gin(genre)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_activity_log_user ON user_activity_log(user_id, created_at DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_payment_user ON payment_transactions(user_id, created_at DESC)');
    console.log('✅ Performance indexes created');

    // Ensure demo admin account exists
    const { rows: [existingAdmin] } = await pool.query('SELECT id FROM users WHERE email = $1', ['demo@animaxia.ro']);
    if (!existingAdmin) {
      const demoHash = await bcrypt.hash('animaxia123', 10);
      await pool.query(
        `INSERT INTO users (email, password_hash, name, plan, email_verified, preferred_language, role) 
         VALUES ($1, $2, $3, $4, true, 'ro', 'admin')`,
        ['demo@animaxia.ro', demoHash, 'Andrei Popescu', 'Premium']);
      console.log('✅ Admin user created');
    }

    console.log('\n🎉 Migration v6.0 complete!');
    console.log('   - 3 new tables (notification_preferences, payment_transactions, user_activity_log)');
    console.log('   - Performance indexes added');
  } catch (e) { console.error('❌ Failed:', e.message); process.exit(1); }
  finally { await pool.end(); }
}
migrate();
