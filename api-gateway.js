/**
 * Animaxia v6.0 - API Gateway Module
 * Integrates: TMDB, OMDB, Jikan, Kitsu, AniAPI, YouTube,
 * Algolia, OpenSubtitles, Football-Data, Balldontlie, Ergast F1,
 * Deezer, iTunes, Lyrics.ovh, OpenLibrary, TheAudioDB, TVMaze
 */

// Lazy-loaded fetch for node-fetch compatibility
let _fetch;
async function getFetch() {
  if (!_fetch) _fetch = (await import('node-fetch')).default;
  return _fetch;
}

// ====== API KEYS ======
const KEYS = {
  TMDB: process.env.TMDB_API_KEY || '3dd880e229e7b83d8e63c4b6f08f77a4',
  OMDB: process.env.OMDB_API_KEY || '6a73f6e7',
  YOUTUBE: process.env.YOUTUBE_API_KEY || 'AIzaSyB0QWWDu3BAkKROnlC6Iy6h_8i8M1moacw',
  FOOTBALL_DATA: process.env.FOOTBALL_DATA_API_KEY || '8053ce106f444e9ca7d1bdf859b81b99',
  BALLDONTLIE: process.env.BALLDONTLIE_API_KEY || '552b85f6-65b9-4aa7-b058-8201ebc06e47',
  OPENSUBTITLES: process.env.OPENSUBTITLES_API_KEY || 'iHdrgVgNTYZQXZhW75Clfa62A5knFn7n',
  ALGOLIA_APP_ID: process.env.ALGOLIA_APP_ID || 'UXJ7AIE2YY',
  ALGOLIA_ADMIN_KEY: process.env.ALGOLIA_ADMIN_KEY || '07c3230cc588cc0037442ea25b2a1591',
  ALGOLIA_SEARCH_KEY: process.env.ALGOLIA_SEARCH_KEY || '6c57a5cedeba761a7c19271903d92e15',
};

// ====== CACHE ======
const cache = new Map();
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes
const MAX_CACHE_SIZE = 2000;

function cached(key, ttl = CACHE_TTL) {
  const item = cache.get(key);
  if (item && Date.now() - item.ts < ttl) return item.data;
  if (item) cache.delete(key); // Clean expired
  return null;
}

function setCache(key, data, ttl = CACHE_TTL) {
  // Evict oldest entries if cache is too large
  if (cache.size >= MAX_CACHE_SIZE) {
    const now = Date.now();
    let deleted = 0;
    for (const [k, v] of cache) {
      if (now - v.ts > v.ttl || deleted < 100) {
        cache.delete(k);
        deleted++;
      }
      if (deleted >= 100) break;
    }
  }
  cache.set(key, { data, ts: Date.now(), ttl });
}

// ====== HELPER ======
async function apiFetch(url, options = {}) {
  const cachedData = cached(url);
  if (cachedData) return cachedData;
  
  try {
    const fetch = await getFetch();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        ...options.headers
      }
    });
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      console.warn(`API ${res.status}: ${url.substring(0, 100)}`);
      return null;
    }
    const data = await res.json();
    setCache(url, data);
    return data;
  } catch (e) {
    console.error(`API fetch error: ${e.message}`);
    return null;
  }
}

// ====== 1. TMDB - MOVIES & TV SERIES ======
async function tmdbSearch(query, page = 1) {
  return apiFetch(
    `https://api.themoviedb.org/3/search/multi?api_key=${KEYS.TMDB}&query=${encodeURIComponent(query)}&language=ro-RO&page=${page}`
  );
}

async function tmdbDetails(tmdbId, type = 'movie') {
  return apiFetch(
    `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${KEYS.TMDB}&language=ro-RO&append_to_response=credits,videos,similar,recommendations,external_ids,release_dates,content_ratings`
  );
}

async function tmdbPopular(type = 'movie', page = 1, lang = 'ro-RO') {
  return apiFetch(
    `https://api.themoviedb.org/3/${type}/popular?api_key=${KEYS.TMDB}&language=${lang}&page=${page}`
  );
}

async function tmdbTrending(timeWindow = 'week', page = 1) {
  return apiFetch(
    `https://api.themoviedb.org/3/trending/all/${timeWindow}?api_key=${KEYS.TMDB}&page=${page}`
  );
}

async function tmdbTopRated(type = 'movie', page = 1) {
  return apiFetch(
    `https://api.themoviedb.org/3/${type}/top_rated?api_key=${KEYS.TMDB}&language=ro-RO&page=${page}`
  );
}

async function tmdbDiscover(params = {}) {
  const query = new URLSearchParams({ api_key: KEYS.TMDB, language: 'ro-RO', ...params });
  return apiFetch(`https://api.themoviedb.org/3/discover/movie?${query}`);
}

async function tmdbGenreList(type = 'movie') {
  return apiFetch(
    `https://api.themoviedb.org/3/genre/${type}/list?api_key=${KEYS.TMDB}&language=ro-RO`
  );
}

async function tmdbByGenre(genreId, page = 1) {
  return apiFetch(
    `https://api.themoviedb.org/3/discover/movie?api_key=${KEYS.TMDB}&with_genres=${genreId}&language=ro-RO&page=${page}&sort_by=vote_count.desc`
  );
}

async function tmdbRecommendations(tmdbId, type = 'movie') {
  return apiFetch(
    `https://api.themoviedb.org/3/${type}/${tmdbId}/recommendations?api_key=${KEYS.TMDB}&language=ro-RO`
  );
}

async function tmdbSimilar(tmdbId, type = 'movie') {
  return apiFetch(
    `https://api.themoviedb.org/3/${type}/${tmdbId}/similar?api_key=${KEYS.TMDB}&language=ro-RO`
  );
}

// ====== 2. OMDB - MOVIE METADATA BACKUP ======
async function omdbSearch(query) {
  return apiFetch(`https://www.omdbapi.com/?apikey=${KEYS.OMDB}&s=${encodeURIComponent(query)}&type=movie`);
}

async function omdbDetails(imdbId) {
  return apiFetch(`https://www.omdbapi.com/?apikey=${KEYS.OMDB}&i=${imdbId}&plot=full`);
}

async function omdbByTitle(title) {
  return apiFetch(`https://www.omdbapi.com/?apikey=${KEYS.OMDB}&t=${encodeURIComponent(title)}&plot=full`);
}

// ====== 3. YOUTUBE - TRAILERS & VIDEOS ======
async function youtubeSearchTrailer(query) {
  const data = await apiFetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query + ' trailer oficial')}&key=${KEYS.YOUTUBE}&type=video&maxResults=3&regionCode=RO&relevanceLanguage=ro`
  );
  if (data?.items?.length > 0) {
    return data.items.map(item => ({
      id: item.id?.videoId,
      title: item.snippet?.title,
      thumbnail: item.snippet?.thumbnails?.high?.url,
      url: `https://www.youtube.com/watch?v=${item.id?.videoId}`
    }));
  }
  return [];
}

async function youtubeVideoDetails(videoId) {
  return apiFetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=${KEYS.YOUTUBE}`
  );
}

async function youtubeChannelVideos(channelId, maxResults = 10) {
  return apiFetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&key=${KEYS.YOUTUBE}&type=video&maxResults=${maxResults}&order=date`
  );
}

// ====== 4. JIKAN - ANIME (with rate limiting) ======
let jikanLastCall = 0;
const JIKAN_RATE_LIMIT = 1200; // 1.2 seconds between calls (respects 1 req/sec)

async function jikanFetch(url) {
  const wait = JIKAN_RATE_LIMIT - (Date.now() - jikanLastCall);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  jikanLastCall = Date.now();
  return apiFetch(url);
}

async function jikanSearch(query) {
  return jikanFetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&sfw=true`);
}

async function jikanTop(page = 1) {
  return jikanFetch(`https://api.jikan.moe/v4/top/anime?page=${page}&filter=bypopularity`);
}

async function jikanById(malId) {
  return jikanFetch(`https://api.jikan.moe/v4/anime/${malId}/full`);
}

async function jikanRecommendations(malId) {
  return jikanFetch(`https://api.jikan.moe/v4/anime/${malId}/recommendations`);
}

async function jikanSeasonal(year, season) {
  const s = season || ['winter','spring','summer','fall'][Math.floor(new Date().getMonth() / 3)];
  const y = year || new Date().getFullYear();
  return jikanFetch(`https://api.jikan.moe/v4/seasons/${y}/${s}`);
}

async function jikanSchedules(day) {
  return jikanFetch(`https://api.jikan.moe/v4/schedules?filter=${day || 'monday'}&sfw=true`);
}

// ====== 5. KITSU - ANIME (ALTERNATIVE) ======
async function kitsuSearch(query) {
  return apiFetch(`https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(query)}&page[limit]=10`);
}

async function kitsuTrending() {
  return apiFetch('https://kitsu.io/api/edge/trending/anime?limit=10');
}

// ====== 6. ANIAPI - ANIME ======
async function aniapiSearch(query) {
  return apiFetch(`https://aniapi.com/v1/anime?title=${encodeURIComponent(query)}`);
}

async function aniapiRandom() {
  return apiFetch('https://aniapi.com/v1/random/anime');
}

// ====== 7. TVMAZE - TV SHOWS ======
async function tvmazeSearch(query) {
  return apiFetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`);
}

async function tvmazeById(tvmazeId) {
  return apiFetch(`https://api.tvmaze.com/shows/${tvmazeId}?embed[]=episodes&embed[]=cast&embed[]=seasons`);
}

async function tvmazeSchedule(country = 'US') {
  return apiFetch(`https://api.tvmaze.com/schedule?country=${country}`);
}

async function tvmazeShowByImdb(imdbId) {
  return apiFetch(`https://api.tvmaze.com/lookup/shows?imdb=${imdbId}`);
}

// ====== 8. ALGOLIA - SEARCH ======
const algoliaHeaders = {
  'X-Algolia-Application-Id': KEYS.ALGOLIA_APP_ID,
  'X-Algolia-API-Key': KEYS.ALGOLIA_SEARCH_KEY,
};

async function algoliaSearch(indexName, query, page = 0, hitsPerPage = 20) {
  const cacheKey = `algolia:${indexName}:${query}:${page}`;
  const cached = cached(cacheKey);
  if (cached) return cached;
  
  try {
    const fetch = await getFetch();
    const res = await fetch(
      `https://${KEYS.ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${indexName}/query`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...algoliaHeaders },
        body: JSON.stringify({ query, page, hitsPerPage })
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    setCache(cacheKey, data);
    return data;
  } catch { return null; }
}

async function algoliaSaveObject(indexName, obj) {
  try {
    const res = await fetch(
      `https://${KEYS.ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${indexName}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Algolia-Application-Id': KEYS.ALGOLIA_APP_ID, 'X-Algolia-API-Key': KEYS.ALGOLIA_ADMIN_KEY },
        body: JSON.stringify(obj)
      }
    );
    return res.ok;
  } catch { return false; }
}

// ====== 9. OPENSUBTITLES ======
async function opensubtitlesSearch(query, lang = 'ro') {
  return apiFetch(
    `https://api.opensubtitles.com/api/v1/subtitles?query=${encodeURIComponent(query)}&languages=${lang}`,
    { headers: { 'Api-Key': KEYS.OPENSUBTITLES } }
  );
}

async function opensubtitlesDownload(fileId) {
  try {
    const res = await fetch('https://api.opensubtitles.com/api/v1/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Api-Key': KEYS.OPENSUBTITLES },
      body: JSON.stringify({ file_id: fileId })
    });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

// ====== 10. FOOTBALL-DATA.ORG ======
async function footballMatches(dateFrom, dateTo) {
  const params = new URLSearchParams();
  if (dateFrom) params.set('dateFrom', dateFrom);
  if (dateTo) params.set('dateTo', dateTo);
  return apiFetch(
    `https://api.football-data.org/v4/matches?${params}`,
    { headers: { 'X-Auth-Token': KEYS.FOOTBALL_DATA } }
  );
}

async function footballStandings(competitionCode = 'PL') {
  return apiFetch(
    `https://api.football-data.org/v4/competitions/${competitionCode}/standings`,
    { headers: { 'X-Auth-Token': KEYS.FOOTBALL_DATA } }
  );
}

async function footballCompetitions() {
  return apiFetch(
    'https://api.football-data.org/v4/competitions',
    { headers: { 'X-Auth-Token': KEYS.FOOTBALL_DATA } }
  );
}

async function footballTeam(teamId) {
  return apiFetch(
    `https://api.football-data.org/v4/teams/${teamId}`,
    { headers: { 'X-Auth-Token': KEYS.FOOTBALL_DATA } }
  );
}

// ====== 11. BALLDONTLIE (NBA) ======
async function nbaTeams() {
  return apiFetch('https://www.balldontlie.io/api/v1/teams');
}

async function nbaGames(season, page = 1, perPage = 25) {
  const params = new URLSearchParams({ page, per_page: perPage });
  if (season) params.set('season', season);
  return apiFetch(`https://www.balldontlie.io/api/v1/games?${params}`);
}

async function nbaPlayers(page = 1) {
  return apiFetch(`https://www.balldontlie.io/api/v1/players?page=${page}&per_page=50`);
}

async function nbaStats(gameId) {
  return apiFetch(`https://www.balldontlie.io/api/v1/stats?game_ids[]=${gameId}`);
}

// ====== 12. ERGAST F1 ======
async function f1CurrentSeason() {
  return apiFetch('https://ergast.com/api/f1/current.json');
}

async function f1Drivers(year) {
  const y = year || new Date().getFullYear();
  return apiFetch(`https://ergast.com/api/f1/${y}/drivers.json`);
}

async function f1Results(year, round) {
  const y = year || new Date().getFullYear();
  const r = round || 'last';
  return apiFetch(`https://ergast.com/api/f1/${y}/${r}/results.json`);
}

async function f1ConstructorStandings(year) {
  const y = year || new Date().getFullYear();
  return apiFetch(`https://ergast.com/api/f1/${y}/constructorStandings.json`);
}

async function f1DriverStandings(year) {
  const y = year || new Date().getFullYear();
  return apiFetch(`https://ergast.com/api/f1/${y}/driverStandings.json`);
}

// ====== 13. DEEZER - MUSIC ======
async function deezerSearch(query) {
  return apiFetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=15`);
}

async function deezerArtist(artistId) {
  return apiFetch(`https://api.deezer.com/artist/${artistId}`);
}

async function deezerAlbum(albumId) {
  return apiFetch(`https://api.deezer.com/album/${albumId}`);
}

async function deezerChart() {
  return apiFetch('https://api.deezer.com/chart/0');
}

async function deezerRadio(genreId = 0) {
  return apiFetch(`https://api.deezer.com/radio/genre/${genreId}`);
}

// ====== 14. ITUNES - MUSIC ======
async function itunesSearch(query, entity = 'song', limit = 15) {
  return apiFetch(
    `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=${entity}&limit=${limit}&country=RO`
  );
}

async function itunesLookup(id) {
  return apiFetch(`https://itunes.apple.com/lookup?id=${id}`);
}

// ====== 15. LYRICS.OVH ======
async function lyricsGet(artist, title) {
  return apiFetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`);
}

// ====== 16. OPENLIBRARY - BOOKS ======
async function openlibrarySearch(query) {
  return apiFetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=10`);
}

async function openlibraryWork(workId) {
  return apiFetch(`https://openlibrary.org/works/${workId}.json`);
}

async function openlibraryAuthor(authorId) {
  return apiFetch(`https://openlibrary.org/authors/${authorId}.json`);
}

async function openlibraryTrending() {
  return apiFetch('https://openlibrary.org/trending/now.json');
}

// ====== 17. THEAUDIODB ======
async function audioDbArtist(artistName) {
  return apiFetch(`https://www.theaudiodb.com/api/v1/json/2/search.php?s=${encodeURIComponent(artistName)}`);
}

async function audioDbAlbum(albumName) {
  return apiFetch(`https://www.theaudiodb.com/api/v1/json/2/searchalbum.php?a=${encodeURIComponent(albumName)}`);
}

async function audioDbTrending() {
  return apiFetch('https://www.theaudiodb.com/api/v1/json/2/trending.php?country=us&type=itunes');
}

// ====== 18. THESPORTSDB ======
async function sportsDbTeams(sport = 'soccer') {
  return apiFetch(`https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(sport)}`);
}

async function sportsDbEvents(leagueId) {
  return apiFetch(`https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=${leagueId}`);
}

// ====== 19. WIKIPEDIA - API SCRAPING ======
async function wikipediaSearch(query) {
  return apiFetch(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=5`
  );
}

async function wikipediaPage(title) {
  const data = await apiFetch(
    `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=extracts|pageimages|info&exintro=true&explaintext=true&format=json&pithumbsize=400`
  );
  if (data?.query?.pages) {
    const pages = Object.values(data.query.pages);
    return pages[0];
  }
  return null;
}

// ====== 20. RSS FEED PARSING (proxy for sites without API) ======
async function rssFetch(feedUrl) {
  try {
    const data = await apiFetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`);
    return data?.items || [];
  } catch { return []; }
}

// ====== 21. MYDRAMALIST / K-DRAMA SCRAPING ======
async function mydramalistSearch(query) {
  // Uses MyDramaList public search endpoint
  const data = await apiFetch(
    `https://www.mydramalist.com/search?q=${encodeURIComponent(query)}&ajax=1`,
    { headers: { 'User-Agent': 'Mozilla/5.0', 'X-Requested-With': 'XMLHttpRequest' } }
  );
  return data;
}

async function mydramalistTrending() {
  return apiFetch(
    'https://www.mydramalist.com/ajax/top100.php?type=trending',
    { headers: { 'User-Agent': 'Mozilla/5.0', 'X-Requested-With': 'XMLHttpRequest' } }
  );
}

// ====== 22. VIKI - DRAMA METADATA ======
async function vikiSearch(query) {
  const data = await apiFetch(
    `https://www.viki.com/api/search?q=${encodeURIComponent(query)}&type=all&per_page=10`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } }
  );
  if (data?.items) {
    return data.items.map(item => ({
      id: `viki_${item.id}`,
      title: item.title || item.name,
      year: item.year || '',
      description: item.description || '',
      genre: item.genres || [],
      rating: item.rating ? `${item.rating}/10` : 'N/A',
      bg_color: '#e84393',
      content_type: 'series',
      image_url: item.images?.thumbnail_url,
      source: 'viki'
    }));
  }
  return [];
}

// ====== 23. ANIMECHAN (anime animechan.vercel.app) ======
async function animeChanSearch(animeTitle) {
  return apiFetch(`https://animechan.vercel.app/api/quotes/anime?title=${encodeURIComponent(animeTitle)}`);
}

// ====== 24. WAIFU.PICS / NEKOS.BEST / CATBOYS ANIME ======
async function waifuPics(category = 'waifu', type = 'sfw') {
  return apiFetch(`https://api.waifu.pics/${type}/${category}`);
}

async function nekosBest(type = 'neko') {
  return apiFetch(`https://nekos.best/api/v2/${type}?amount=5`);
}

// ====== 25. OPENLIGADB ======
async function openLigaSearch(leagueShortcut) {
  return apiFetch(`https://api.openligadb.de/api/getmatchdata/${encodeURIComponent(leagueShortcut)}`);
}

async function openLigaTeams(leagueShortcut) {
  return apiFetch(`https://api.openligadb.de/api/getavailableteams/${encodeURIComponent(leagueShortcut)}`);
}

// ====== 26. REDDIT - SUBREDDIT FEED ======
async function redditSearch(query, subreddit = 'all', sort = 'relevance') {
  return apiFetch(
    `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(query)}&sort=${sort}&limit=10`,
    { headers: { 'User-Agent': 'Animaxia/6.0' } }
  );
}

async function redditHot(subreddit = 'popular') {
  return apiFetch(
    `https://www.reddit.com/r/${subreddit}/hot.json?limit=10`,
    { headers: { 'User-Agent': 'Animaxia/6.0' } }
  );
}

// ====== CONTENT PIPELINE: Build unified content items ======
async function searchAll(query, limit = 20) {
  const results = [];
  const seen = new Set();
  
  function addIfUnique(item) {
    const key = (item.title || '').toLowerCase().trim().replace(/\s+/g, ' ');
    if (seen.has(key)) return;
    seen.add(key);
    results.push(item);
  }
  
  // Search TMDB (movies & TV)
  try {
    const tmdb = await tmdbSearch(query);
    if (tmdb?.results) {
      for (const item of tmdb.results.slice(0, 5)) {
        if (item.media_type === 'movie' || item.media_type === 'tv') {
          const type = item.media_type === 'movie' ? 'movie' : 'series';
          addIfUnique({
            id: `tmdb_${item.id}`,
            title: item.title || item.name,
            title_en: item.original_title || item.original_name,
            year: (item.release_date || item.first_air_date || '').substring(0, 4),
            description: item.overview || '',
            genre: item.genre_ids || [],
            rating: item.vote_average ? `${item.vote_average.toFixed(1)}/10` : 'N/A',
            bg_color: '#1e1e2e',
            content_type: type,
            backdrop_color: '#16213e',
            match_rating: `${Math.round((item.vote_average || 5) * 10)}%`,
            poster_path: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
            backdrop_path: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
            source: 'tmdb',
            tmdb_id: item.id
          });
        }
      }
    }
  } catch {}

  // Search Jikan (anime)
  try {
    const jikan = await jikanSearch(query);
    if (jikan?.data) {
      for (const item of jikan.data.slice(0, 3)) {
        addIfUnique({
          id: `jikan_${item.mal_id}`,
          title: item.title_ro || item.title,
          title_en: item.title_english || item.title,
          year: item.year ? `${item.year}` : (item.aired?.from || '').substring(0, 4),
          description: item.synopsis || '',
          genre: item.genres?.map(g => g.name) || [],
          rating: item.score ? `${item.score}/10` : 'N/A',
          bg_color: '#2d3436',
          content_type: 'series',
          backdrop_color: '#636e72',
          match_rating: item.score ? `${Math.round(item.score * 10)}%` : '90%',
          episodes: item.episodes || 0,
          image_url: item.images?.jpg?.large_image_url,
          source: 'jikan',
          mal_id: item.mal_id
        });
      }
    }
  } catch {}

  // Search TVMaze (TV shows)
  try {
    const tvmaze = await tvmazeSearch(query);
    if (tvmaze) {
      for (const item of tvmaze.slice(0, 3)) {
        const show = item.show;
        addIfUnique({
          id: `tvmaze_${show.id}`,
          title: show.name,
          year: show.premiered?.substring(0, 4) || '',
          description: show.summary?.replace(/<[^>]*>/g, '') || '',
          genre: show.genres || [],
          rating: show.rating?.average ? `${show.rating.average}/10` : 'N/A',
          bg_color: '#2c3e50',
          content_type: 'series',
          backdrop_color: '#34495e',
          match_rating: show.rating?.average ? `${Math.round(show.rating.average * 10)}%` : '85%',
          status: show.status,
          network: show.network?.name || '',
          image_url: show.image?.original,
          source: 'tvmaze',
          tvmaze_id: show.id,
          imdb_id: show.externals?.imdb
        });
      }
    }
  } catch {}

  return results.slice(0, limit);
}

// Build movie detail from multiple sources
async function buildContentDetail(contentId) {
  const underscoreIdx = contentId.indexOf('_');
  if (underscoreIdx === -1) return null;
  const source = contentId.substring(0, underscoreIdx);
  const id = contentId.substring(underscoreIdx + 1);

  switch (source) {
    case 'tmdb': {
      const details = await tmdbDetails(id, 'movie');
      const tvDetails = !details ? await tmdbDetails(id, 'tv') : null;
      const d = details || tvDetails;
      if (!d) return null;
      return {
        id: contentId,
        title: d.title || d.name,
        title_en: d.original_title || d.original_name,
        year: (d.release_date || d.first_air_date || '').substring(0, 4),
        duration: d.runtime ? `${Math.floor(d.runtime / 60)}h ${d.runtime % 60}min` : 'N/A',
        rating: d.vote_average ? `${d.vote_average.toFixed(1)}/10` : 'N/A',
        genre: d.genres?.map(g => g.name) || [],
        description: d.overview || '',
        cast_members: d.credits?.cast?.slice(0, 10).map(c => c.name) || [],
        poster: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : null,
        backdrop: d.backdrop_path ? `https://image.tmdb.org/t/p/w1280${d.backdrop_path}` : null,
        trailer: d.videos?.results?.find(v => v.type === 'Trailer')?.key 
          ? `https://www.youtube.com/watch?v=${d.videos.results.find(v => v.type === 'Trailer').key}`
          : null,
        seasons: d.seasons?.filter(s => s.season_number > 0).map(s => ({
          number: s.season_number,
          episodes: s.episode_count,
          name: s.name
        })) || [],
        content_type: d.title ? 'movie' : 'series',
        source: 'tmdb',
        imdb_id: d.external_ids?.imdb_id
      };
    }

    case 'jikan': {
      const details = await jikanById(id);
      if (!details?.data) return null;
      const a = details.data;
      return {
        id: contentId,
        title: a.title_ro || a.title,
        title_en: a.title_english || a.title,
        year: a.year || (a.aired?.from || '').substring(0, 4),
        duration: a.duration || '24min',
        rating: a.score ? `${a.score}/10` : 'N/A',
        genre: a.genres?.map(g => g.name) || [],
        description: a.synopsis || '',
        cast_members: a.studios?.map(s => s.name) || [],
        poster: a.images?.jpg?.large_image_url,
        episodes: a.episodes || 0,
        status: a.status,
        trailer: a.trailer?.url,
        content_type: 'series',
        source: 'jikan'
      };
    }

    case 'tvmaze': {
      const details = await tvmazeById(id);
      if (!details) return null;
      return {
        id: contentId,
        title: details.name,
        year: details.premiered?.substring(0, 4) || '',
        duration: details.averageRuntime ? `${details.averageRuntime}min` : 'N/A',
        rating: details.rating?.average ? `${details.rating.average}/10` : 'N/A',
        genre: details.genres || [],
        description: details.summary?.replace(/<[^>]*>/g, '') || '',
        cast_members: details._embedded?.cast?.slice(0, 10).map(c => c.person?.name) || [],
        poster: details.image?.original,
        status: details.status,
        network: details.network?.name || details.webChannel?.name || '',
        seasons: details._embedded?.seasons?.map(s => ({
          number: s.number,
          episodes: s.episodeOrder,
          name: s.name
        })) || [],
        content_type: 'series',
        source: 'tvmaze',
        imdb_id: details.externals?.imdb
      };
    }

    default:
      return null;
  }
}

// Export all API functions
module.exports = {
  // TMDB
  tmdbSearch, tmdbDetails, tmdbPopular, tmdbTrending, tmdbTopRated,
  tmdbDiscover, tmdbGenreList, tmdbByGenre, tmdbRecommendations, tmdbSimilar,
  // OMDB
  omdbSearch, omdbDetails, omdbByTitle,
  // YouTube
  youtubeSearchTrailer, youtubeVideoDetails, youtubeChannelVideos,
  // Jikan (Anime)
  jikanSearch, jikanTop, jikanById, jikanRecommendations, jikanSeasonal, jikanSchedules,
  // Kitsu (Anime)
  kitsuSearch, kitsuTrending,
  // AniAPI (Anime)
  aniapiSearch, aniapiRandom,
  // TVMaze
  tvmazeSearch, tvmazeById, tvmazeSchedule, tvmazeShowByImdb,
  // Algolia
  algoliaSearch, algoliaSaveObject,
  // OpenSubtitles
  opensubtitlesSearch, opensubtitlesDownload,
  // Football
  footballMatches, footballStandings, footballCompetitions, footballTeam,
  // NBA
  nbaTeams, nbaGames, nbaPlayers, nbaStats,
  // F1
  f1CurrentSeason, f1Drivers, f1Results, f1ConstructorStandings, f1DriverStandings,
  // Music
  deezerSearch, deezerArtist, deezerAlbum, deezerChart, deezerRadio,
  itunesSearch, itunesLookup, lyricsGet,
  // Books
  openlibrarySearch, openlibraryWork, openlibraryAuthor, openlibraryTrending,
  // AudioDB
  audioDbArtist, audioDbAlbum, audioDbTrending,
  // SportsDB
  sportsDbTeams, sportsDbEvents,
  // Content Pipeline
  searchAll, buildContentDetail,
  // New Sources (19-26)
  wikipediaSearch, wikipediaPage,
  rssFetch,
  mydramalistSearch, mydramalistTrending,
  vikiSearch,
  animeChanSearch,
  waifuPics, nekosBest,
  openLigaSearch, openLigaTeams,
  redditSearch, redditHot
};
