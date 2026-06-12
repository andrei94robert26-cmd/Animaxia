/**
 * Animaxia v7.0 - Live TV Channels & EPG Seed
 * Real IPTV-style channels with Electronic Program Guide (EPG)
 * Similar to: Stremio Live TV, Sweet TV, Pluto TV
 */

const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 
  'postgresql://neondb_owner:npg_mHoXu7N8AYWT@ep-odd-flower-a2ks7aoy-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require';

// Channel IDs are VARCHAR(10) max in the DB schema
const CHANNELS = [
  { id: 'ch1', name: 'Animaxia One', name_en: 'Animaxia One', category: 'General', icon: 'star', bg_color: '#6c5ce7' },
  { id: 'ch2', name: 'Animaxia Cinema', name_en: 'Animaxia Cinema', category: 'Movies', icon: 'film', bg_color: '#e17055' },
  { id: 'ch3', name: 'Animaxia Series', name_en: 'Animaxia Series', category: 'Series', icon: 'tv', bg_color: '#00b894' },
  { id: 'ch4', name: 'Animaxia Kids', name_en: 'Animaxia Kids', category: 'Kids', icon: 'child', bg_color: '#fdcb6e' },
  { id: 'ch5', name: 'Animaxia Nature', name_en: 'Animaxia Nature', category: 'Documentary', icon: 'globe', bg_color: '#0984e3' },
  { id: 'ch6', name: 'Animaxia Sports', name_en: 'Animaxia Sports', category: 'Sports', icon: 'futbol', bg_color: '#d63031' },
  { id: 'ch7', name: 'Animaxia News', name_en: 'Animaxia News', category: 'News', icon: 'newspaper', bg_color: '#636e72' },
  { id: 'ch8', name: 'Animaxia Music', name_en: 'Animaxia Music', category: 'Music', icon: 'music', bg_color: '#e84393' },
  { id: 'ch9', name: 'Animaxia History', name_en: 'Animaxia History', category: 'Educational', icon: 'book', bg_color: '#2d3436' },
  { id: 'ch10', name: 'Animaxia Sci-Fi', name_en: 'Animaxia Sci-Fi', category: 'Sci-Fi', icon: 'rocket', bg_color: '#00cec9' },
  { id: 'ch11', name: 'Animaxia Comedy', name_en: 'Animaxia Comedy', category: 'Comedy', icon: 'laugh', bg_color: '#fdcb6e' },
  { id: 'ch12', name: 'Animaxia Action', name_en: 'Animaxia Action', category: 'Action', icon: 'fire', bg_color: '#d63031' },
  { id: 'ch13', name: 'Animaxia Anime', name_en: 'Animaxia Anime', category: 'Anime', icon: 'dragon', bg_color: '#6c5ce7' },
  { id: 'ch14', name: 'Animaxia 24/7', name_en: 'Animaxia 24/7', category: 'Marathon', icon: 'infinity', bg_color: '#e17055' },
  { id: 'ch15', name: 'Animaxia Premium', name_en: 'Animaxia Premium', category: 'Premium', icon: 'crown', bg_color: '#f39c12' },
];

function generatePrograms(channelId, category) {
  const programs = [];
  
  const programByCategory = {
    'Movies': [
      { ro: 'Marea Aventură', en: 'The Great Adventure', type: 'movie' },
      { ro: 'Imperiul Stelelor', en: 'Empire of Stars', type: 'movie' },
      { ro: 'Legendele Animaxiei', en: 'Legends of Animaxia', type: 'movie' },
      { ro: 'Furtuna Desertului', en: 'Desert Storm', type: 'movie' },
      { ro: 'Labirintul Viselor', en: 'Labyrinth of Dreams', type: 'movie' },
      { ro: 'Viteza Maxima', en: 'Maximum Speed', type: 'movie' },
    ],
    'Series': [
      { ro: 'Dincolo de Realitate', en: 'Beyond Reality', type: 'series' },
      { ro: 'Noua Era', en: 'New Era', type: 'series' },
      { ro: 'Corupția', en: 'Corruption', type: 'series' },
      { ro: 'Stele Căzătoare', en: 'Falling Stars', type: 'series' },
      { ro: 'Codul Onoarei', en: 'Honor Code', type: 'series' },
      { ro: 'Frontiera', en: 'The Frontier', type: 'series' },
    ],
    'Kids': [
      { ro: 'Pufosii Aventurieri', en: 'Fluffy Adventurers', type: 'kids' },
      { ro: 'Lumea lui Ben', en: 'Ben\'s World', type: 'kids' },
      { ro: 'Grădina Animalelor', en: 'Animal Garden', type: 'kids' },
      { ro: 'Scoala Magicilor', en: 'School of Magic', type: 'kids' },
      { ro: 'Misiunea Puiului', en: 'Chicken Mission', type: 'kids' },
    ],
    'Documentary': [
      { ro: 'Planeta Noastră', en: 'Our Planet', type: 'doc' },
      { ro: 'Oceanele Adânci', en: 'Deep Oceans', type: 'doc' },
      { ro: 'Inovații care Schimbă', en: 'Innovations Changing', type: 'doc' },
      { ro: 'Fizica Distracției', en: 'Fun Physics', type: 'doc' },
      { ro: 'Universul în Expansiune', en: 'Expanding Universe', type: 'doc' },
    ],
    'Sports': [
      { ro: 'Jurnal Sportiv', en: 'Sports Journal', type: 'sports' },
      { ro: 'Meciul Serii Live', en: 'Match of the Evening', type: 'sports' },
      { ro: 'Analiză Sportivă', en: 'Sports Analysis', type: 'sports' },
      { ro: 'Formula 1: GP', en: 'Formula 1: GP', type: 'sports' },
      { ro: 'NBA Highlights', en: 'NBA Highlights', type: 'sports' },
    ],
    'News': [
      { ro: 'Știrile Dimineții', en: 'Morning News', type: 'news' },
      { ro: 'Actualitatea', en: 'Current Affairs', type: 'news' },
      { ro: 'Știrile Serii', en: 'Evening News', type: 'news' },
      { ro: 'Dezbaterea Zilei', en: 'Debate of the Day', type: 'news' },
    ],
    'Music': [
      { ro: 'Top 40 Hits', en: 'Top 40 Hits', type: 'music' },
      { ro: 'Concert Acustic', en: 'Acoustic Concert', type: 'music' },
      { ro: 'Rock Classics', en: 'Rock Classics', type: 'music' },
      { ro: 'Jazz & Blues', en: 'Jazz & Blues', type: 'music' },
    ],
    'Educational': [
      { ro: 'Documentar Istoric', en: 'Historical Doc', type: 'edu' },
      { ro: 'Mari Invenții', en: 'Great Inventions', type: 'edu' },
      { ro: 'Civilizații Pierdute', en: 'Lost Civilizations', type: 'edu' },
      { ro: 'Știința pe Înțeles', en: 'Science Simple', type: 'edu' },
    ],
    'General': [
      { ro: 'Marea Aventură', en: 'The Great Adventure', type: 'movie' },
      { ro: 'Știrile Dimineții', en: 'Morning News', type: 'news' },
      { ro: 'Dincolo de Realitate', en: 'Beyond Reality', type: 'series' },
      { ro: 'Documentar Istoric', en: 'Historical Doc', type: 'edu' },
      { ro: 'Top 40 Hits', en: 'Top 40 Hits', type: 'music' },
      { ro: 'Meciul Serii Live', en: 'Match of the Evening', type: 'sports' },
    ],
    'Sci-Fi': [
      { ro: 'Conexiunea Marte', en: 'Mars Connection', type: 'movie' },
      { ro: 'Programul Artemis', en: 'Artemis Program', type: 'movie' },
      { ro: 'Gravitatia Zero', en: 'Zero Gravity', type: 'movie' },
      { ro: 'Imperiul Stelelor', en: 'Empire of Stars', type: 'movie' },
    ],
    'Comedy': [
      { ro: 'Vacanta in Familie', en: 'Family Vacation', type: 'comedy' },
      { ro: 'Vecinul Perfect', en: 'Perfect Neighbor', type: 'comedy' },
      { ro: 'Agentul Haotic', en: 'Chaos Agent', type: 'comedy' },
      { ro: 'Comedie la Cheie', en: 'Comedy Key', type: 'comedy' },
    ],
    'Action': [
      { ro: 'Viteza Maxima', en: 'Maximum Speed', type: 'action' },
      { ro: 'Codul Pericolului', en: 'Danger Code', type: 'action' },
      { ro: 'Echipa de Fier', en: 'Iron Team', type: 'action' },
      { ro: 'Operatiunea Fulger', en: 'Operation Flash', type: 'action' },
    ],
    'Anime': [
      { ro: 'Sakura: Războiul', en: 'Sakura: Flower War', type: 'anime' },
      { ro: 'Umbra Samuraiului', en: 'Shadow Samurai', type: 'anime' },
      { ro: 'Lumea Digitală', en: 'Digital World', type: 'anime' },
      { ro: 'Atacul Titanilor', en: 'Attack Titans', type: 'anime' },
    ],
    'Marathon': [
      { ro: 'Maraton: Harry Potter', en: 'Marathon: Harry Potter', type: 'marathon' },
      { ro: 'Maraton: Star Wars', en: 'Marathon: Star Wars', type: 'marathon' },
      { ro: 'Maraton: Marvel', en: 'Marathon: Marvel', type: 'marathon' },
      { ro: 'Maraton: Disney', en: 'Marathon: Disney', type: 'marathon' },
    ],
    'Premium': [
      { ro: '[P] Marea Aventură', en: '[P] The Great Adventure', type: 'movie' },
      { ro: '[P] Imperiul Stelelor', en: '[P] Empire of Stars', type: 'movie' },
      { ro: '[P] Legendele Animaxiei', en: '[P] Legends of Animaxia', type: 'movie' },
      { ro: '[P] Furtuna Desertului', en: '[P] Desert Storm', type: 'movie' },
      { ro: '[P] Labirintul Viselor', en: '[P] Labyrinth of Dreams', type: 'movie' },
    ],
  };

  const pool = programByCategory[category] || programByCategory['General'];

  // Generate 24h schedule (1-hour slots)
  for (let hour = 0; hour < 24; hour++) {
    const startHour = String(hour).padStart(2, '0');
    const endHour = String(hour + 1).padStart(2, '0');
    const prog = pool[hour % pool.length];
    
    programs.push({
      channel_id: channelId,
      title: prog.ro,
      title_en: prog.en,
      start_time: `${startHour}:00`,
      end_time: `${endHour}:00`,
      program_type: prog.type
    });
  }

  return programs;
}

async function seedChannels() {
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  console.log('🚀 Animaxia v7.0 - Live TV Channels & EPG Seed\n');

  try {
    // Clear existing channels and programs
    await pool.query('DELETE FROM programs');
    await pool.query('DELETE FROM channels');
    console.log('✅ Cleared existing channels & programs');

    // Insert channels
    for (const ch of CHANNELS) {
      await pool.query(
        'INSERT INTO channels (id, name, name_en, category, icon, bg_color) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name',
        [ch.id, ch.name, ch.name_en, ch.category, ch.icon, ch.bg_color]
      );
    }
    console.log(`✅ ${CHANNELS.length} channels created`);

    // Generate and insert programs
    let programCount = 0;
    for (const ch of CHANNELS) {
      const programs = generatePrograms(ch.id, ch.category);
      for (const prog of programs) {
        await pool.query(
          'INSERT INTO programs (channel_id, title, title_en, start_time, end_time, program_type) VALUES ($1, $2, $3, $4, $5, $6)',
          [prog.channel_id, prog.title, prog.title_en, prog.start_time, prog.end_time, prog.program_type]
        );
        programCount++;
      }
    }
    console.log(`✅ ${programCount} EPG programs created (24h per channel)`);

    // Verify
    const { rows: chCount } = await pool.query('SELECT COUNT(*) as c FROM channels');
    const { rows: prCount } = await pool.query('SELECT COUNT(*) as c FROM programs');
    console.log(`\n🎉 Live TV Seed Complete!`);
    console.log(`   - ${chCount[0].c} channels`);
    console.log(`   - ${prCount[0].c} programs`);
    console.log(`   - Categories: ${[...new Set(CHANNELS.map(c => c.category))].join(', ')}`);

    await pool.end();
  } catch (e) {
    console.error('❌ Seed failed:', e.message);
    process.exit(1);
  }
}

seedChannels();
