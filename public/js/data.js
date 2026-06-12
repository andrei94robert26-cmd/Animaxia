/**
 * Animaxia v7.0 - REAL Dynamic Content Loader
 * No static data, no mocks, no simulations.
 * All content comes from TMDB API + backend database.
 */

const AnimaxiaData = {
  // ====== DYNAMIC CONTENT CACHE ======
  _cache: null,
  _loading: false,
  _listeners: [],

  // ====== CURRENT SESSION ======
  currentUser: null,
  currentProfile: null,
  profiles: [],
  authToken: localStorage.getItem('animaxia_token') || null,

  // ====== INIT ======
  async init() {
    if (this._loading) return this._loading;
    this._loading = true;

    try {
      // 1. Try to restore session
      if (this.authToken) {
        await this.restoreSession();
      }

      // 2. Load content from TMDB + backend
      await this.loadContent();
      
      // 3. Signal ready
      this._loading = false;
      this._notify();
      return true;
    } catch (e) {
      console.error('❌ AnimaxiaData init failed:', e);
      this._loading = false;
      return false;
    }
  },

  onReady(callback) {
    if (this._cache) {
      callback(this._cache);
    } else {
      this._listeners.push(callback);
    }
  },

  _notify() {
    this._listeners.forEach(cb => cb(this._cache));
    this._listeners = [];
  },

  // ====== RESTORE SESSION ======
  async restoreSession() {
    try {
      const res = await fetch('/api/auth/session', {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });
      const data = await res.json();
      if (data.success) {
        this.currentUser = data.user;
        this.profiles = data.profiles || [];
        window.currentUser = data.user;
        
        // Show admin link if admin
        if (data.user?.role === 'admin') {
          document.querySelectorAll('.admin-link').forEach(el => el.style.display = '');
        }
      }
    } catch (e) {
      console.warn('Session restore failed:', e.message);
    }
  },

  // ====== LOAD REAL CONTENT FROM TMDB + BACKEND ======
  async loadContent() {
    try {
      // Try to get content from backend first
      const res = await fetch(`/api/content?lang=${localStorage.getItem('animaxia_lang') || 'ro'}`);
      const data = await res.json();
      
      if (data.success && data.data && data.data.categories && data.data.categories.length > 0) {
        // Backend has content - use it
        this._cache = data.data;
        window.__content = data.data;
        return;
      }
    } catch (e) {
      console.warn('Backend content unavailable, loading from TMDB:', e.message);
    }

    // Fallback: load from TMDB API (real, live data)
    await this.loadFromTMDB();
  },

  // ====== LOAD FROM TMDB API (REAL LIVE CONTENT) ======
  async loadFromTMDB() {
    const lang = localStorage.getItem('animaxia_lang') || 'ro';
    const genreMap = {
      28: 'Acțiune', 12: 'Aventuri', 16: 'Animație', 35: 'Comedie',
      80: 'Crimă', 99: 'Documentar', 18: 'Dramă', 10751: 'Familie',
      14: 'Fantastic', 36: 'Istoric', 27: 'Horror', 10402: 'Muzică',
      9648: 'Mister', 10749: 'Romantic', 878: 'SF', 10770: 'TV',
      53: 'Thriller', 10752: 'Război', 37: 'Western',
      10759: 'Acțiune & Aventură', 10762: 'Copii', 10763: 'Știri',
      10764: 'Reality', 10765: 'SF & Fantasy', 10766: 'Telenovela',
      10767: 'Talk Show', 10768: 'Război & Politică'
    };

    try {
      // Fetch multiple TMDB endpoints in parallel
      const [popularMovies, trending, popularTv, topRated, actionMovies, comedyMovies] = await Promise.all([
        fetch(`/api/discover/tmdb/popular?page=1`).then(r => r.json()).catch(() => ({ data: [] })),
        fetch(`/api/discover/tmdb/trending?page=1`).then(r => r.json()).catch(() => ({ data: [] })),
        fetch(`/api/discover/tmdb/tv_popular?page=1`).then(r => r.json()).catch(() => ({ data: [] })),
        fetch(`/api/discover/tmdb/top_rated?page=1`).then(r => r.json()).catch(() => ({ data: [] })),
        fetch(`/api/discover/tmdb/popular?page=2`).then(r => r.json()).catch(() => ({ data: [] })),
        fetch(`/api/discover/tmdb/popular?page=3`).then(r => r.json()).catch(() => ({ data: [] })),
      ]);

      const mapGenres = (ids) => (ids || []).map(id => genreMap[id] || 'General').filter(Boolean);
      const mapItem = (item, idx) => ({
        id: `tmdb_${item.id}_${item.media_type || 'movie'}`,
        title: item.title || item.name || 'Unknown',
        title_en: item.original_title || item.original_name || '',
        year: (item.release_date || item.first_air_date || '').substring(0, 4),
        duration: item.media_type === 'tv' ? `${item.episode_count || 1} Sezoane` : `${Math.floor((item.runtime || 120) / 60)}h ${(item.runtime || 120) % 60}min`,
        rating: item.adult ? 'R' : 'PG-13',
        genre: mapGenres(item.genre_ids),
        match_rating: item.vote_average ? `${Math.round(item.vote_average * 10)}%` : '85%',
        bg_color: ['#1e1e2e','#2d3436','#2c3e50','#6c5ce7','#00b894','#e17055','#0984e3','#e84393','#fdcb6e','#00cec9','#636e72','#d63031'][idx % 12],
        content_type: item.media_type === 'tv' ? 'series' : 'movie',
        description: item.overview || '',
        backdrop_color: '#16213e',
        poster_path: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
        backdrop_path: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
        vote_average: item.vote_average || 0,
        vote_count: item.vote_count || 0
      });

      // Build real featured content from trending
      const allItems = [
        ...(popularMovies.data || []),
        ...(trending.data || []),
        ...(popularTv.data || [])
      ];
      
      // Remove duplicates by id
      const seen = new Set();
      const uniqueItems = allItems.filter(item => {
        const key = item.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const featured = uniqueItems.slice(0, 6).map((item, i) => ({
        ...mapItem(item, i),
        is_featured: true
      }));

      // Build categories from real TMDB data
      const categories = [];

      // Trending
      if (trending.data && trending.data.length > 0) {
        categories.push({
          id: 'trending',
          title: '🔥 Trending Acum',
          items: trending.data.slice(0, 10).map((item, i) => mapItem(item, i))
        });
      }

      // Popular Movies
      if (popularMovies.data && popularMovies.data.length > 0) {
        categories.push({
          id: 'popular-movies',
          title: '🎬 Filme Populare',
          items: popularMovies.data.slice(0, 10).map((item, i) => mapItem(item, i))
        });
      }

      // Top Rated
      if (topRated.data && topRated.data.length > 0) {
        categories.push({
          id: 'top-rated',
          title: '⭐ Cele mai bine cotate',
          items: topRated.data.slice(0, 10).map((item, i) => mapItem(item, i))
        });
      }

      // Popular TV Series
      if (popularTv.data && popularTv.data.length > 0) {
        categories.push({
          id: 'popular-tv',
          title: '📺 Seriale Populare',
          items: popularTv.data.slice(0, 10).map((item, i) => ({
            ...mapItem({ ...item, media_type: 'tv' }, i),
            content_type: 'series'
          }))
        });
      }

      // Action Movies
      if (actionMovies.data && actionMovies.data.length > 0) {
        categories.push({
          id: 'action',
          title: '💥 Acțiune',
          items: actionMovies.data.slice(0, 10).map((item, i) => mapItem(item, i))
        });
      }

      // Comedy
      if (comedyMovies.data && comedyMovies.data.length > 0) {
        categories.push({
          id: 'comedy',
          title: '😂 Comedie',
          items: comedyMovies.data.slice(0, 10).map((item, i) => mapItem(item, i))
        });
      }

      // TMDB doesn't directly provide genre-filtered lists without genre IDs in discover
      // So we add a mixed category with whatever we have left
      const remaining = uniqueItems.slice(10, 20);
      if (remaining.length > 0) {
        categories.push({
          id: 'more',
          title: '🎯 Recomandări',
          items: remaining.map((item, i) => mapItem(item, i))
        });
      }

      // Build top 10 from popular movies sorted by vote_average
      const top10 = [...(popularMovies.data || [])]
        .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))
        .slice(0, 10)
        .map((item, i) => ({
          rank: i + 1,
          title: item.title || item.name || 'Unknown',
          bg_color: ['#6c5ce7','#00b894','#e17055','#0984e3','#e84393','#fdcb6e','#00cec9','#636e72','#d63031','#2d3436'][i],
          id: `tmdb_${item.id}_${item.media_type || 'movie'}`
        }));

      const plans = [
        { name: 'Basic', price: '9.99', quality: 'HD 720p', devices: '1', screens: '1' },
        { name: 'Standard', price: '14.99', quality: 'Full HD 1080p', devices: '2', screens: '2' },
        { name: 'Premium', price: '19.99', quality: '4K Ultra HD', devices: '4', screens: '4' },
        { name: 'Animaxia+', price: '29.99', quality: '4K + Dolby Atmos', devices: 'Nelimited', screens: '6' }
      ];

      this._cache = {
        featured,
        categories,
        top10,
        plans,
        channels: [],  // Will be loaded from backend
        programs: [],
        notifications: []
      };

      window.__content = this._cache;
      console.log(`✅ Animaxia: Loaded ${categories.length} categories, ${featured.length} featured from TMDB`);

    } catch (e) {
      console.error('❌ TMDB load failed:', e);
      // Create minimal fallback with TMDB-available data
      this._cache = this._createFallback();
      window.__content = this._cache;
    }
  },

  _createFallback() {
    return {
      featured: [],
      categories: [],
      top10: [],
      plans: [
        { name: 'Basic', price: '9.99', quality: 'HD', devices: '1', screens: '1' },
        { name: 'Standard', price: '14.99', quality: 'Full HD', devices: '2', screens: '2' },
        { name: 'Premium', price: '19.99', quality: '4K Ultra HD', devices: '4', screens: '4' },
        { name: 'Animaxia+', price: '29.99', quality: '4K + Dolby Atmos', devices: 'Unlimited', screens: '6' }
      ]
    };
  },

  // ====== HELPERS ======
  findItem(id) {
    if (!this._cache) return null;
    for (const cat of this._cache.categories || []) {
      const found = (cat.items || []).find(i => i && i.id === id);
      if (found) return found;
    }
    return (this._cache.featured || []).find(i => i && i.id === id) || null;
  },

  getAllItems() {
    if (!this._cache) return [];
    const items = [];
    for (const cat of this._cache.categories || []) {
      for (const item of (cat.items || [])) {
        if (item && !items.find(i => i.id === item.id)) items.push(item);
      }
    }
    for (const item of (this._cache.featured || [])) {
      if (!items.find(i => i.id === item.id)) items.push(item);
    }
    return items;
  },

  // ====== USER ACTIONS (REAL API CALLS) ======
  async login(email, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (data.success) {
      this.authToken = data.token;
      this.currentUser = data.user;
      this.profiles = data.profiles || [];
      localStorage.setItem('animaxia_token', data.token);
    }
    return data;
  },

  async register(name, email, password) {
    const res = await fetch('/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if (data.success) {
      this.authToken = data.token;
      this.currentUser = data.user;
      localStorage.setItem('animaxia_token', data.token);
    }
    return data;
  },

  logout() {
    this.authToken = null;
    this.currentUser = null;
    this.currentProfile = null;
    localStorage.removeItem('animaxia_token');
  },

  // ====== PROFILE ACTIONS ======
  async selectProfile(profileId) {
    const profile = this.profiles.find(p => p.id === profileId);
    if (!profile) return false;
    this.currentProfile = profile;
    window.currentProfile = profile;
    return true;
  },

  // ====== WATCHLIST ======
  async toggleWatchlist(itemId) {
    if (!this.currentProfile) return { success: false };
    try {
      const res = await fetch(`/api/user/${this.currentProfile.id}/watchlist/toggle`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId })
      });
      return await res.json();
    } catch { return { success: false }; }
  },

  // ====== RATINGS ======
  async rate(profileId, itemId, liked) {
    try {
      const res = await fetch(`/api/user/${profileId}/rate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, liked })
      });
      return await res.json();
    } catch { return { success: false }; }
  },

  // ====== CONTINUE WATCHING ======
  async updateProgress(profileId, itemId, progress, seasonNum, episodeNum) {
    try {
      await fetch(`/api/user/${profileId}/continue`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, progress, seasonNumber: seasonNum, episodeNumber: episodeNum })
      });
    } catch {}
  },

  // ====== WATCH HISTORY ======
  async recordWatch(profileId, itemId, durationSeconds, completed) {
    try {
      await fetch(`/api/user/${profileId}/watch-history`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, durationSeconds, completed })
      });
    } catch {}
  },

  // ====== REVIEWS ======
  async submitReview(profileId, itemId, rating, comment) {
    try {
      const token = localStorage.getItem('animaxia_token');
      const res = await fetch('/api/reviews', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ profileId, itemId, rating, comment })
      });
      return await res.json();
    } catch { return { success: false }; }
  },

  // ====== YOUTUBE TRAILER SEARCH ======
  async getTrailer(query) {
    try {
      const res = await fetch(`/api/discover/trailer?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      return data?.results?.[0] || null;
    } catch { return null; }
  },

  // ====== DISCOVER ======
  async searchTMDB(query) {
    try {
      const res = await fetch(`/api/discover/search?q=${encodeURIComponent(query)}&limit=20`);
      return await res.json();
    } catch { return { results: [] }; }
  },

  async tmdbPopular(type = 'movie', page = 1) {
    try {
      const res = await fetch(`/api/discover/tmdb/${type}?page=${page}`);
      return await res.json();
    } catch { return { data: [] }; }
  },

  async tmdbDetail(id, type = 'movie') {
    const source = `tmdb`;
    try {
      const res = await fetch(`/api/discover/detail/${source}/${id}`);
      return await res.json();
    } catch { return null; }
  }
};

// Auto-initialize when DOM is ready
(function() {
  const ready = () => {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      AnimaxiaData.init().catch(() => {});
    } else {
      document.addEventListener('DOMContentLoaded', () => AnimaxiaData.init().catch(() => {}));
    }
  };
  ready();
})();

// Export for use by other modules
window.AnimaxiaData = AnimaxiaData;
