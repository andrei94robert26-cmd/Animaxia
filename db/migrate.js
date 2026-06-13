/**
 * Animaxia v7.0 - Database Migration (REWRITTEN)
 * Creates all tables and seeds with rich demo content.
 * Admin Dashboard + Reviews + Watch History + Recommendations + Downloads
 */

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/animaxia';

// ====== SEED DATA ======
const SEED_PROFILES = [
  { id: 'p1', name: 'Andrei', color: '#6c5ce7', kid: false },
  { id: 'p2', name: 'Maria', color: '#e17055', kid: false },
  { id: 'p3', name: 'Alex', color: '#00b894', kid: true },
];

const SEED_CONTENT = [
  { id: 'f1', title: 'Legendele Animaxiei', title_en: 'Legends of Animaxia', year: '2025', duration: '2h 15min', rating: 'PG-13', genre: ['Animație', 'Aventuri', 'Fantasy'], match: '98%', bgColor: '#6c5ce7', type: 'movie', episodes: 0, cast: ['Elena Popescu', 'Andrei Ionescu', 'Maria Dima'], description: 'O călătorie epică prin tărâmuri magice, unde eroi legendari se unesc pentru a salva Animaxia de forțele întunericului.', backdropColor: 'linear-gradient(135deg, #6c5ce7, #a29bfe)', trailer_url: 'https://www.youtube.com/watch?v=d4ZIz7UyGp4' },
  { id: 'f2', title: 'Animaxia: Începutul', title_en: 'Animaxia: The Beginning', year: '2024', duration: '1h 48min', rating: 'PG', genre: ['Animație', 'Familie', 'Aventuri'], match: '96%', bgColor: '#00b894', type: 'movie', episodes: 0, cast: ['George Clooney', 'Meryl Streep'], description: 'Povestea originii universului Animaxia și a primelor creaturi magice.', backdropColor: 'linear-gradient(135deg, #00b894, #00cec9)', trailer_url: 'https://www.youtube.com/watch?v=g4Hbz2jLxvQ' },
  { id: 'f3', title: 'Cronicile Animaxiei', title_en: 'Chronicles of Animaxia', year: '2025', duration: '1h 55min', rating: 'PG-13', genre: ['Animație', 'Aventuri', 'Dramă'], match: '95%', bgColor: '#e17055', type: 'movie', episodes: 0, cast: ['Tom Hanks', 'Emma Watson'], description: 'Trei generații de eroi își unesc puterile într-o bătălie care va decide soarta întregului univers.', backdropColor: 'linear-gradient(135deg, #e17055, #fdcb6e)', trailer_url: 'https://www.youtube.com/watch?v=Cb4WV4aXBpk' },
  { id: 'm1', title: 'Subacvatic', title_en: 'Subaquatic', year: '2024', duration: '2h 24min', rating: 'PG-13', genre: ['Acțiune', 'Aventuri', 'SF'], match: '92%', bgColor: '#0984e3', type: 'movie', episodes: 0, cast: ['Jason Momoa', 'Amber Heard', 'Patrick Wilson'], description: 'O aventură subacvatică spectaculoasă în adâncurile necunoscute ale oceanului.', backdropColor: 'linear-gradient(135deg, #0984e3, #74b9ff)', trailer_url: 'https://www.youtube.com/watch?v=AhD0jeMfd4s' },
  { id: 'm2', title: 'Imperiul Stelelor', title_en: 'Empire of Stars', year: '2024', duration: '2h 35min', rating: 'PG-13', genre: ['SF', 'Aventuri', 'Dramă'], match: '94%', bgColor: '#2d3436', type: 'movie', episodes: 0, cast: ['Timothée Chalamet', 'Zendaya', 'Oscar Isaac'], description: 'Pe planeta deșert Arrakis, un tânăr ereditar descoperă destinul său într-o luptă pentru controlul celei mai valoroase resurse din univers.', backdropColor: 'linear-gradient(135deg, #2d3436, #636e72)', trailer_url: 'https://www.youtube.com/watch?v=Ue4PCI0BhIY' },
  { id: 'se1', title: 'Dincolo de Realitate', title_en: 'Beyond Reality', year: '2022', duration: '4 Sezoane', rating: 'TV-MA', genre: ['SF', 'Horror', 'Dramă'], match: '97%', bgColor: '#1e1e2e', type: 'series', episodes: 34, seasons: 4, cast: ['Winona Ryder', 'David Harbour', 'Millie Bobby Brown'], description: 'În anii 80, un grup de copii descoperă secrete terifiante în micul lor oraș american.', backdropColor: 'linear-gradient(135deg, #1e1e2e, #2c3e50)', trailer_url: 'https://www.youtube.com/watch?v=9gvHk3s0kAA' },
  { id: 'se3', title: 'Noua Eră', title_en: 'New Era', year: '2023', duration: '3 Sezoane', rating: 'TV-14', genre: ['SF', 'Acțiune', 'Aventuri'], match: '96%', bgColor: '#e17055', type: 'series', episodes: 24, seasons: 3, cast: ['Pedro Pascal', 'Gina Carano', 'Carl Weathers'], description: 'La marginea galaxiei, un vânător de recompense solitar protejează un copil misterios cu puteri extraordinare.', backdropColor: 'linear-gradient(135deg, #e17055, #e84393)', trailer_url: 'https://www.youtube.com/watch?v=5E9Wf7T3F6A' },
  { id: 'm5', title: 'Ultimul Orizont', title_en: 'Last Horizon', year: '2014', duration: '2h 49min', rating: 'PG-13', genre: ['SF', 'Dramă', 'Aventuri'], match: '99%', bgColor: '#0a0a1a', type: 'movie', episodes: 0, cast: ['Matthew McConaughey', 'Anne Hathaway', 'Jessica Chastain'], description: 'O echipă de exploratori traversează o gaură de vierme spațială în încercarea de a salva umanitatea.', backdropColor: 'linear-gradient(135deg, #0a0a1a, #1a1a3e)', trailer_url: 'https://www.youtube.com/watch?v=BV-WEb_qhhA' },
  { id: 'm6', title: 'Labirintul Viselor', title_en: 'Labyrinth of Dreams', year: '2010', duration: '2h 28min', rating: 'PG-13', genre: ['SF', 'Acțiune', 'Thriller'], match: '97%', bgColor: '#1a1a2e', type: 'movie', episodes: 0, cast: ['Leonardo DiCaprio', 'Joseph Gordon-Levitt', 'Elliot Page'], description: 'Un hoț specializat în furtul de informații din subconștient primește o misiune aproape imposibilă.', backdropColor: 'linear-gradient(135deg, #1a1a2e, #2d3436)', trailer_url: 'https://www.youtube.com/watch?v=QWB0D_BGFHg' },
  { id: 'ac1', title: 'Furtuna Deșertului', title_en: 'Desert Storm', year: '2024', duration: '2h 35min', rating: 'PG-13', genre: ['Acțiune', 'SF', 'Aventuri'], match: '93%', bgColor: '#2d3436', type: 'movie', episodes: 0, cast: ['Timothée Chalamet', 'Rebecca Ferguson', 'Stellan Skarsgård'], description: 'Pe planeta deșert, Războiul pentru controlul Condimentului continuă.', backdropColor: 'linear-gradient(135deg, #2d3436, #636e72)', trailer_url: 'https://www.youtube.com/watch?v=Ue4PCI0BhIY' },
  { id: 'ac6', title: 'Viteza Maximă', title_en: 'Maximum Speed', year: '2023', duration: '2h 21min', rating: 'PG-13', genre: ['Acțiune', 'Aventuri', 'Crimă'], match: '91%', bgColor: '#d63031', type: 'movie', episodes: 0, cast: ['Vin Diesel', 'Jason Momoa', 'Brie Larson'], description: 'Familia Dominic Toretto se confruntă cu cea mai mare amenințare de până acum.', backdropColor: 'linear-gradient(135deg, #d63031, #e17055)', trailer_url: 'https://www.youtube.com/watch?v=udKE1BwFAnU' },
  { id: 'd1', title: 'Planeta Albastră', title_en: 'Blue Planet', year: '2023', duration: '1h 30min', rating: 'G', genre: ['Documentar', 'Natură'], match: '95%', bgColor: '#0984e3', type: 'movie', episodes: 0, cast: ['David Attenborough'], description: 'O călătorie fascinantă prin cele mai spectaculoase ecosisteme marine ale planetei noastre.', backdropColor: 'linear-gradient(135deg, #0984e3, #74b9ff)', trailer_url: 'https://www.youtube.com/watch?v=TJ2YhH-fZSw' },
  { id: 'k2', title: 'Școala Magicilor', title_en: 'School of Magic', year: '2001', duration: '2h 32min', rating: 'PG', genre: ['Familie', 'Fantasy', 'Aventuri'], match: '100%', bgColor: '#2d3436', type: 'movie', episodes: 0, cast: ['Daniel Radcliffe', 'Emma Watson', 'Rupert Grint'], description: 'Un băiat obișnuit descoperă că este un mag celebru și începe o nouă viață la Școala de Magie.', backdropColor: 'linear-gradient(135deg, #2d3436, #636e72)', trailer_url: 'https://www.youtube.com/watch?v=2jLxG7ls3tE' },
  { id: 'an1', title: 'Sakura: Războiul Florilor', title_en: 'Sakura: Flower War', year: '2019', duration: '4 Sezoane', rating: 'TV-MA', genre: ['Animație', 'Acțiune', 'Fantasy'], match: '98%', bgColor: '#e84393', type: 'series', episodes: 44, seasons: 4, cast: ['Natsuki Hanae', 'Akari Kitō', 'Hiro Shimono'], description: 'Un tânăr vânător de demoni luptă pentru a-și salva sora și a răzbuna familia într-o Japonie istorică fantastică.', backdropColor: 'linear-gradient(135deg, #e84393, #6c5ce7)', trailer_url: 'https://www.youtube.com/watch?v=K6B3B0iLh4s' },
  { id: 'sf1', title: 'Conexiunea Marte', title_en: 'Mars Connection', year: '2015', duration: '2h 24min', rating: 'PG-13', genre: ['SF', 'Aventuri', 'Dramă'], match: '94%', bgColor: '#e17055', type: 'movie', episodes: 0, cast: ['Matt Damon', 'Jessica Chastain', 'Jeff Daniels'], description: 'Un astronaut rămâne blocat singur pe Marte și trebuie să găsească o modalitate de a supraviețui și de a se întoarce acasă.', backdropColor: 'linear-gradient(135deg, #e17055, #fdcb6e)', trailer_url: 'https://www.youtube.com/watch?v=8Ln3jHjK3_s' },
  { id: 'hr1', title: 'Casa Bântuită', title_en: 'The Haunted House', year: '2013', duration: '1h 52min', rating: 'R', genre: ['Horror', 'Thriller', 'Mister'], match: '90%', bgColor: '#1a1a1a', type: 'movie', episodes: 0, cast: ['Vera Farmiga', 'Patrick Wilson', 'Lili Taylor'], description: 'O familie se mută într-o casă de vis care ascunde secrete terifiante.', backdropColor: 'linear-gradient(135deg, #1a1a1a, #2d3436)', trailer_url: 'https://www.youtube.com/watch?v=Uf-vW_jnNw8' },
  { id: 'cm1', title: 'Comedie la Cheie', title_en: 'Comedy Key', year: '2009', duration: '1h 40min', rating: 'R', genre: ['Comedie', 'Acțiune'], match: '88%', bgColor: '#fdcb6e', type: 'movie', episodes: 0, cast: ['Bradley Cooper', 'Ed Helms', 'Zach Galifianakis'], description: 'Trei prieteni pornesc într-o aventură nebună înainte de o nuntă.', backdropColor: 'linear-gradient(135deg, #fdcb6e, #e17055)', trailer_url: 'https://www.youtube.com/watch?v=UBQ4GSC_wVk' },
  { id: 'sct1', title: 'Fizica Distracției', title_en: 'Fun Physics', year: '2024', duration: '45min', rating: 'G', genre: ['Educational', 'Documentar', 'Știință'], match: '93%', bgColor: '#00cec9', type: 'movie', episodes: 0, cast: ['Neil deGrasse Tyson'], description: 'Descoperă cele mai fascinante experimente și fenomene fizice într-un mod distractiv și ușor de înțeles.', backdropColor: 'linear-gradient(135deg, #00cec9, #00b894)', trailer_url: 'https://www.youtube.com/watch?v=0fKBhvDjuy0' },
  { id: 'th1', title: 'Pânza Păianjenului', title_en: 'Spider\'s Web', year: '2011', duration: '2h 38min', rating: 'R', genre: ['Thriller', 'Dramă', 'Mister'], match: '91%', bgColor: '#2d3436', type: 'movie', episodes: 0, cast: ['Rooney Mara', 'Daniel Craig', 'Christopher Plummer'], description: 'O hackeră și un jurnalist investighează un caz complex de corupție care ascunde secrete periculoase.', backdropColor: 'linear-gradient(135deg, #2d3436, #636e72)' },
  { id: 'mu1', title: 'Ritmurile Orașului', title_en: 'City Rhythms', year: '2024', duration: '1h 30min', rating: 'PG', genre: ['Muzică', 'Documentar'], match: '87%', bgColor: '#e84393', type: 'movie', episodes: 0, cast: ['Muzicieni internaționali'], description: 'O incursiune în cele mai vibrante scene muzicale ale lumii.', backdropColor: 'linear-gradient(135deg, #e84393, #6c5ce7)' },
  { id: 'ap1', title: 'Inimi Pereche', title_en: 'Soulmates', year: '2004', duration: '2h 3min', rating: 'PG-13', genre: ['Dragoste', 'Dramă'], match: '95%', bgColor: '#e17055', type: 'movie', episodes: 0, cast: ['Ryan Gosling', 'Rachel McAdams'], description: 'O poveste de dragoste emoționantă care traversează decenii.', backdropColor: 'linear-gradient(135deg, #e17055, #fdcb6e)', trailer_url: 'https://www.youtube.com/watch?v=BFQ2ZIr8m4I' },
  { id: 'sp1', title: 'Goool! - Povestea Fotbalului', title_en: 'Goal! The Football Story', year: '2024', duration: '1h 20min', rating: 'G', genre: ['Sport', 'Documentar'], match: '90%', bgColor: '#00b894', type: 'movie', episodes: 0, cast: ['Cristiano Ronaldo', 'Lionel Messi'], description: 'Povestea celor mai mari fotbaliști ai lumii și a celor mai spectaculoase momente din istoria fotbalului.', backdropColor: 'linear-gradient(135deg, #00b894, #00cec9)' },
  { id: 'hr2', title: 'Umbre în Întuneric', title_en: 'Shadows in the Dark', year: '2018', duration: '1h 30min', rating: 'PG-13', genre: ['Horror', 'Thriller', 'Dramă'], match: '93%', bgColor: '#2d3436', type: 'movie', episodes: 0, cast: ['Emily Blunt', 'John Krasinski'], description: 'O familie trăiește în tăcere absolută pentru a supraviețui unor creaturi care vânează după sunet.', backdropColor: 'linear-gradient(135deg, #2d3436, #636e72)', trailer_url: 'https://www.youtube.com/watch?v=8F-eVnJwCbQ' },
  { id: 'se2', title: 'Corupția', title_en: 'Corruption', year: '2013', duration: '6 Sezoane', rating: 'TV-MA', genre: ['Dramă', 'Thriller', 'Politic'], match: '94%', bgColor: '#1e1e2e', type: 'series', episodes: 73, seasons: 6, cast: ['Kevin Spacey', 'Robin Wright', 'Michael Kelly'], description: 'Un politician fără scrupule manipulează și conspiră pentru a ajunge la putere.', backdropColor: 'linear-gradient(135deg, #1e1e2e, #2c3e50)', trailer_url: 'https://www.youtube.com/watch?v=M5hC2JeB3iQ' },
  { id: 'an3', title: 'Lumea Digitală', title_en: 'Digital World', year: '2021', duration: '2 Sezoane', rating: 'TV-14', genre: ['Animație', 'SF', 'Acțiune'], match: '97%', bgColor: '#e84393', type: 'series', episodes: 18, seasons: 2, cast: ['Hailee Steinfeld', 'Ella Purnell', 'Kevin Alejandro'], description: 'Într-un oraș underground, două surori descoperă o puternică armă magică ce leagă lumea umană de lumea digitală.', backdropColor: 'linear-gradient(135deg, #e84393, #6c5ce7)', trailer_url: 'https://www.youtube.com/watch?v=K1ceVF2zhfA' },
];

const SEED_CATEGORIES = [
  { id: 'popular', title: '🔥 Popular pe Animaxia', items: ['m2', 'f1', 'se1', 'm5', 'se3', 'm1', 'm6', 'an1'] },
  { id: 'trending', title: '📈 Tendințe', items: ['f2', 'ac1', 'd1', 'sf1', 'k2', 'cm1', 'hr2'] },
  { id: 'series', title: '📺 Seriale', items: ['se1', 'se3', 'se2', 'an1', 'an3'] },
  { id: 'action', title: '💥 Acțiune', items: ['ac1', 'ac6', 'm1', 'm2', 'hr2'] },
  { id: 'animated', title: '🎨 Animație', items: ['f1', 'f2', 'f3', 'an1', 'an3'] },
  { id: 'scifi', title: '🚀 SF & Fantasy', items: ['m2', 'm5', 'm6', 'sf1', 'se1', 'se3'] },
  { id: 'documentary', title: '🌍 Documentare', items: ['d1', 'sct1', 'mu1', 'sp1'] },
  { id: 'comedy', title: '😂 Comedie', items: ['cm1', 'k2', 'f2'] },
  { id: 'top10', title: '⭐ Top 10', items: ['m5', 'f1', 'se1', 'm2', 'an1', 'm6', 'ac6', 'k2', 'd1', 'sf1'] },
];

const SEED_NOTIFICATIONS = [
  { id: 'n1', type: 'new', message: 'Episodul 5 din "Dincolo de Realitate" a fost adăugat!', message_en: 'Episode 5 of "Beyond Reality" added!', time: 'Acum 10 min' },
  { id: 'n2', type: 'recommendation', message: 'Bazat pe preferințele tale, ți-ar plăcea "Imperiul Stelelor"', message_en: 'Based on your preferences, try "Empire of Stars"', time: 'Acum 1h' },
  { id: 'n3', type: 'continue', message: 'Continuă vizionarea "Legendele Animaxiei"', message_en: 'Continue watching "Legends of Animaxia"', time: 'Acum 3h' },
  { id: 'n4', type: 'offer', message: 'Actualizează la Premium și economisești 20%!', message_en: 'Upgrade to Premium and save 20%!', time: 'Acum 1 zi' },
  { id: 'n5', type: 'system', message: 'Bine ai venit pe Animaxia! Explorează conținutul nostru.', message_en: 'Welcome to Animaxia! Explore our content.', time: 'Acum 2 zile' },
];

async function migrate() {
  const isLocal = DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1');
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: isLocal ? false : { rejectUnauthorized: false } });
  console.log('🚀 Animaxia v7.0 Database Migration\n');

  try {
    const { rows: [t] } = await pool.query('SELECT NOW() as time');
    console.log(`✅ Connected at ${t.time}`);

    // ====== CLEANUP ======
    await pool.query(`DROP TABLE IF EXISTS programs, channels, notifications, continue_watching, 
      ratings, watchlists, category_items, categories, content_items, 
      profiles, password_resets, email_verifications, google_auth, 
      users, api_keys, episodes, kids_pins, user_languages, 
      user_device_sessions, content_reviews, download_queue,
      watch_history, admin_logs, content_suggestions CASCADE`);
    console.log('✅ Cleaned existing tables');

    // ====== USERS ======
    await pool.query(`CREATE TABLE users (id SERIAL PRIMARY KEY, email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL DEFAULT '', name VARCHAR(100) NOT NULL DEFAULT '',
      plan VARCHAR(50) DEFAULT 'Free', email_verified BOOLEAN DEFAULT false,
      google_id VARCHAR(255) UNIQUE DEFAULT NULL, avatar_url TEXT DEFAULT '',
      preferred_language VARCHAR(5) DEFAULT 'ro', role VARCHAR(20) DEFAULT 'user',
      created_at TIMESTAMP DEFAULT NOW(), last_login TIMESTAMP DEFAULT NOW())`);
    console.log('✅ users');

    // ====== PROFILES ======
    await pool.query(`CREATE TABLE profiles (id VARCHAR(10) PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, name VARCHAR(50) NOT NULL,
      color VARCHAR(20) DEFAULT '#e17055', is_kid BOOLEAN DEFAULT false,
      kids_pin VARCHAR(6) DEFAULT '', avatar_url TEXT DEFAULT '',
      preferred_language VARCHAR(5) DEFAULT 'ro')`);
    console.log('✅ profiles');

    // ====== AUTH TABLES ======
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
    console.log('✅ auth tables');

    // ====== CONTENT ======
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
    console.log('✅ content_items');

    // ====== EPISODES ======
    await pool.query(`CREATE TABLE episodes (id SERIAL PRIMARY KEY,
      item_id VARCHAR(20) REFERENCES content_items(id) ON DELETE CASCADE,
      season_number INTEGER NOT NULL DEFAULT 1, episode_number INTEGER NOT NULL DEFAULT 1,
      title VARCHAR(255) NOT NULL, title_en VARCHAR(255) DEFAULT '',
      description TEXT DEFAULT '', description_en TEXT DEFAULT '',
      duration VARCHAR(20) DEFAULT '45min', video_url VARCHAR(500) DEFAULT '',
      thumbnail_color VARCHAR(20) DEFAULT '#2d3436',
      UNIQUE(item_id, season_number, episode_number))`);
    console.log('✅ episodes');

    // ====== CATEGORIES ======
    await pool.query(`CREATE TABLE categories (id VARCHAR(50) PRIMARY KEY,
      title VARCHAR(255) NOT NULL, title_en VARCHAR(255) DEFAULT '', display_order INTEGER DEFAULT 0)`);
    await pool.query(`CREATE TABLE category_items (category_id VARCHAR(50) REFERENCES categories(id) ON DELETE CASCADE,
      item_id VARCHAR(20) REFERENCES content_items(id) ON DELETE CASCADE,
      item_order INTEGER DEFAULT 0, PRIMARY KEY (category_id, item_id))`);
    console.log('✅ categories');

    // ====== USER DATA TABLES ======
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

    await pool.query(`CREATE TABLE content_reviews (id SERIAL PRIMARY KEY,
      profile_id VARCHAR(10) REFERENCES profiles(id) ON DELETE CASCADE,
      item_id VARCHAR(20) REFERENCES content_items(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL DEFAULT 5 CHECK (rating >= 1 AND rating <= 5),
      comment TEXT DEFAULT '', created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(), UNIQUE(profile_id, item_id))`);

    await pool.query(`CREATE TABLE watch_history (id SERIAL PRIMARY KEY,
      profile_id VARCHAR(10) REFERENCES profiles(id) ON DELETE CASCADE,
      item_id VARCHAR(20) REFERENCES content_items(id) ON DELETE CASCADE,
      episode_id INTEGER REFERENCES episodes(id) ON DELETE SET NULL,
      watched_at TIMESTAMP DEFAULT NOW(), duration_seconds INTEGER DEFAULT 0,
      completed BOOLEAN DEFAULT false)`);

    await pool.query(`CREATE TABLE download_queue (id SERIAL PRIMARY KEY,
      profile_id VARCHAR(10) REFERENCES profiles(id) ON DELETE CASCADE,
      item_id VARCHAR(20) REFERENCES content_items(id) ON DELETE CASCADE,
      episode_id INTEGER REFERENCES episodes(id) ON DELETE SET NULL,
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','downloading','completed','failed')),
      progress INTEGER DEFAULT 0, size_mb INTEGER DEFAULT 0,
      added_at TIMESTAMP DEFAULT NOW(), completed_at TIMESTAMP)`);

    await pool.query(`CREATE TABLE admin_logs (id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      action VARCHAR(100) NOT NULL, details TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW())`);

    await pool.query(`CREATE TABLE content_suggestions (id SERIAL PRIMARY KEY,
      profile_id VARCHAR(10) REFERENCES profiles(id) ON DELETE CASCADE,
      item_id VARCHAR(20) REFERENCES content_items(id) ON DELETE CASCADE,
      score DECIMAL(5,2) DEFAULT 0, reason VARCHAR(100) DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW())`);

    // ====== ADDITIONAL TABLES ======
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
    console.log('✅ All 27 tables created');

    // ====== SEED DATA ======
    console.log('\n🌱 Seeding database...');

    // Users
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
    console.log('✅ Users: demo@animaxia.ro / animaxia123 (admin) | test@animaxia.ro / test123456');

    // Profiles
    for (const p of SEED_PROFILES) {
      await pool.query(
        `INSERT INTO profiles (id, user_id, name, color, is_kid, kids_pin) 
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
        [p.id, userId, p.name, p.color, p.kid, p.kid ? '1234' : '']);
    }
    console.log('✅ Profiles');

    // Featured content
    const featuredIds = ['f1', 'f2', 'f3', 'm1', 'm2', 'm5'];
    for (const item of SEED_CONTENT) {
      const isFeatured = featuredIds.includes(item.id);
      const isKidFriendly = !item.genre?.some(g => 
        ['horror', 'thriller', 'crimă', 'război'].includes(g?.toLowerCase?.() || ''));
      
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
         item.backdropColor||'', item.trailer_url||'', isFeatured, isKidFriendly]);
    }
    console.log(`✅ ${SEED_CONTENT.length} content items seeded`);

    // Categories
    for (let idx = 0; idx < SEED_CATEGORIES.length; idx++) {
      const cat = SEED_CATEGORIES[idx];
      await pool.query(
        `INSERT INTO categories (id, title, title_en, display_order) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [cat.id, cat.title, cat.title, idx]);
      
      for (let i = 0; i < cat.items.length; i++) {
        await pool.query(
          `INSERT INTO category_items (category_id, item_id, item_order) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [cat.id, cat.items[i], i]);
      }
    }
    console.log(`✅ ${SEED_CATEGORIES.length} categories seeded`);

    // Episodes for series
    const seriesItems = SEED_CONTENT.filter(item => item.type === 'series');
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
             `Episod ${epCount} din ${series.title}`,
             `${40 + Math.floor(Math.random() * 20)}min`,
             series.bgColor || '#2d3436']);
        }
      }
    }
    console.log('✅ Episodes seeded');

    // Reviews
    const profileIds = ['p1', 'p2', 'p3'];
    const reviewComments = [
      { rating: 5, text: 'Excelent! O producție de nota 10. 👏' },
      { rating: 4, text: 'Foarte bun, recomand cu căldură!' },
      { rating: 5, text: 'Superb! Merită văzut.' },
      { rating: 3, text: 'OK, putea fi mai bun.' },
      { rating: 4, text: 'Film bun pentru o seară relaxantă.' },
      { rating: 5, text: 'Cel mai bun film al anului! 🏆' },
      { rating: 4, text: 'Distractiv și captivant.' },
      { rating: 3, text: 'Mediu, așteptări mai mari.' },
      { rating: 5, text: 'O capodoperă! Visual stunning.' },
      { rating: 4, text: 'Recomand cu încredere.' },
    ];
    
    for (let i = 0; i < SEED_CONTENT.length && i < reviewComments.length; i++) {
      const profileId = profileIds[i % profileIds.length];
      const review = reviewComments[i % reviewComments.length];
      await pool.query(
        `INSERT INTO content_reviews (profile_id, item_id, rating, comment)
         VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [profileId, SEED_CONTENT[i].id, review.rating, review.text]);
    }
    console.log('✅ Reviews seeded');

    // Watch History
    for (let i = 0; i < 30; i++) {
      const item = SEED_CONTENT[Math.floor(Math.random() * SEED_CONTENT.length)];
      const profileId = profileIds[Math.floor(Math.random() * profileIds.length)];
      const daysAgo = Math.floor(Math.random() * 14);
      const completed = Math.random() > 0.4;
      await pool.query(
        `INSERT INTO watch_history (profile_id, item_id, watched_at, duration_seconds, completed)
         VALUES ($1, $2, NOW() - INTERVAL '1 day' * $3, $4, $5)`,
        [profileId, item.id, daysAgo, Math.floor(Math.random() * 7200) + 300, completed]);
    }
    console.log('✅ Watch History seeded (30 entries)');

    // Admin logs
    await pool.query(`INSERT INTO admin_logs (user_id, action, details) VALUES ($1, 'platform_launch', 'Animaxia v7.0 launched successfully')`, [userId]);
    await pool.query(`INSERT INTO admin_logs (user_id, action, details) VALUES ($1, 'content_added', 'Seeded 25+ content items')`, [userId]);
    await pool.query(`INSERT INTO admin_logs (user_id, action, details) VALUES ($1, 'admin_login', 'Admin dashboard initialized')`, [userId]);
    console.log('✅ Admin logs');

    // Notifications
    for (const n of SEED_NOTIFICATIONS) {
      await pool.query(
        `INSERT INTO notifications (id, type, message, message_en, time_ago, is_read) 
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
        [n.id, n.type, n.message, n.message_en, n.time, false]);
    }
    console.log('✅ Notifications seeded');

    console.log('\n🎉 Migration v7.0 complete!');
    console.log(`   - 27 tables created`);
    console.log(`   - ${SEED_CONTENT.length} content items seeded`);
    console.log(`   - ${SEED_CATEGORIES.length} categories`);
    console.log(`   - Admin: demo@animaxia.ro / animaxia123 (role: admin)`);
    console.log(`   - Test: test@animaxia.ro / test123456`);

  } catch (e) {
    console.error('❌ Migration failed:', e.message);
    console.error(e.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
