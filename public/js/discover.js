/**
 * Animaxia v7.0 - Discover Module
 * Unified discovery hub: TMDB, Wikipedia, Reddit, RSS,
 * Anime (Jikan/Kitsu), Music (Deezer/iTunes), Sports (Football/NBA/F1)
 */
(function() {
  'use strict';

  const Discover = {
    currentTab: 'trending',

    showPage() {
      if (window.App?.stopHero) window.App.stopHero();
      const existing = document.getElementById('discoverScreen');
      if (existing) existing.remove();
      const lang = window.appLang || 'ro';

      const screen = document.createElement('div');
      screen.id = 'discoverScreen';
      screen.className = 'full-page-screen';
      screen.style.zIndex = '1000';
      screen.innerHTML = `
        <div class="full-page-header">
          <div class="full-page-header-content">
            <button class="full-page-back" id="discoverBack"><i class="fas fa-arrow-left"></i></button>
            <h1><i class="fas fa-compass" style="color:var(--green);"></i> ${lang === 'ro' ? 'Descoperă' : 'Discover'}</h1>
          </div>
        </div>
        <div class="full-page-body">
          <div class="disc-tabs" id="discTabs">
            <button class="disc-tab active" data-tab="trending"><i class="fas fa-fire"></i> <span>${lang === 'ro' ? 'Tendințe' : 'Trending'}</span></button>
            <button class="disc-tab" data-tab="search"><i class="fas fa-search"></i> <span>${lang === 'ro' ? 'Caută' : 'Search'}</span></button>
            <button class="disc-tab" data-tab="anime"><i class="fas fa-dragon"></i> <span>Anime</span></button>
            <button class="disc-tab" data-tab="music"><i class="fas fa-music"></i> <span>${lang === 'ro' ? 'Muzică' : 'Music'}</span></button>
            <button class="disc-tab" data-tab="sports"><i class="fas fa-futbol"></i> <span>${lang === 'ro' ? 'Sport' : 'Sports'}</span></button>
            <button class="disc-tab" data-tab="web"><i class="fas fa-globe"></i> <span>Web</span></button>
          </div>
          <div id="discContent">
            <div style="text-align:center;padding:60px;"><i class="fas fa-spinner fa-spin" style="font-size:32px;color:var(--text-tertiary);"></i></div>
          </div>
        </div>`;

      document.body.appendChild(screen);
      document.getElementById('discoverBack').addEventListener('click', () => {
        screen.remove();
        if (window.App?.startHero) window.App.startHero();
      });

      // Bind tabs
      screen.querySelectorAll('.disc-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          screen.querySelectorAll('.disc-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          this.currentTab = tab.dataset.tab;
          this.renderTab(this.currentTab);
        });
      });

      this.renderTab('trending');
    },

    renderTab(tab) {
      switch (tab) {
        case 'trending': this.renderTrending(); break;
        case 'search': this.renderSearch(); break;
        case 'anime': this.renderAnime(); break;
        case 'music': this.renderMusic(); break;
        case 'sports': this.renderSports(); break;
        case 'web': this.renderWeb(); break;
      }
    },

    // ====== TRENDING TAB ======
    async renderTrending() {
      const el = document.getElementById('discContent');
      const lang = window.appLang || 'ro';
      el.innerHTML = '<div style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin" style="font-size:24px;"></i></div>';

      try {
        const [tmdbMovie, tmdbTv, tmdbTrending] = await Promise.all([
          fetch('/api/discover/tmdb/popular?page=1').then(r => r.json()),
          fetch('/api/discover/tmdb/tv_popular?page=1').then(r => r.json()),
          fetch('/api/discover/tmdb/trending?page=1').then(r => r.json()),
        ]);

        const renderCard = (item, source) => `
          <div class="disc-card" data-id="${source}_${item.id}" data-source="${source}">
            <div class="disc-card-thumb" style="background:linear-gradient(135deg,#1a1a2e,#16213e)">
              ${item.poster_path ? `<img src="https://image.tmdb.org/t/p/w200${item.poster_path}" alt="${item.title || item.name}" loading="lazy">` : '<span style="font-size:32px;">🎬</span>'}
              <div class="disc-card-overlay">
                <span class="disc-card-rating">★ ${item.vote_average?.toFixed(1) || 'N/A'}</span>
              </div>
            </div>
            <div class="disc-card-info">
              <div class="disc-card-title">${item.title || item.name || ''}</div>
              <div class="disc-card-meta">${(item.release_date || item.first_air_date || '').substring(0, 4)}</div>
            </div>
          </div>`;

        el.innerHTML = `
          <div class="disc-section">
            <h3 class="disc-section-title"><i class="fas fa-fire" style="color:var(--orange);"></i> ${lang === 'ro' ? 'Tendințe' : 'Trending'}</h3>
            <div class="disc-grid">${(tmdbTrending.data || []).slice(0, 8).map(i => renderCard(i, 'tmdb')).join('') || '<div class="disc-empty">No data</div>'}</div>
          </div>
          <div class="disc-section">
            <h3 class="disc-section-title"><i class="fas fa-film"></i> ${lang === 'ro' ? 'Filme Populare' : 'Popular Movies'}</h3>
            <div class="disc-grid">${(tmdbMovie.data || []).slice(0, 6).map(i => renderCard(i, 'tmdb')).join('') || '<div class="disc-empty">No data</div>'}</div>
          </div>
          <div class="disc-section">
            <h3 class="disc-section-title"><i class="fas fa-tv"></i> ${lang === 'ro' ? 'Seriale Populare' : 'Popular TV'}</h3>
            <div class="disc-grid">${(tmdbTv.data || []).slice(0, 6).map(i => renderCard(i, 'tmdb')).join('') || '<div class="disc-empty">No data</div>'}</div>
          </div>`;

        el.querySelectorAll('.disc-card').forEach(card => {
          card.addEventListener('click', () => {
            const id = card.dataset.id;
            const source = card.dataset.source;
            this.showExternalDetail(id, source);
          });
        });
      } catch (e) {
        el.innerHTML = `<div class="disc-empty"><i class="fas fa-exclamation-circle"></i><h4>${e.message}</h4></div>`;
      }
    },

    // ====== SEARCH TAB ======
    renderSearch() {
      const el = document.getElementById('discContent');
      const lang = window.appLang || 'ro';
      el.innerHTML = `
        <div class="disc-search-section">
          <div class="disc-search-bar">
            <i class="fas fa-search"></i>
            <input type="text" id="discSearchInput" placeholder="${lang === 'ro' ? 'Caută în TMDB, Wikipedia, Anime...' : 'Search TMDB, Wikipedia, Anime...'}" autofocus>
          </div>
          <div class="disc-search-filters">
            <select id="discSearchSource">
              <option value="all">${lang === 'ro' ? 'Toate sursele' : 'All sources'}</option>
              <option value="tmdb">TMDB</option>
              <option value="anime">Anime (Jikan)</option>
              <option value="tv">TV (TVMaze)</option>
              <option value="wikipedia">Wikipedia</option>
              <option value="reddit">Reddit</option>
              <option value="music">${lang === 'ro' ? 'Muzică' : 'Music'}</option>
            </select>
          </div>
          <div id="discSearchResults"></div>
        </div>`;

      let searchTimer;
      const input = document.getElementById('discSearchInput');
      const source = document.getElementById('discSearchSource');

      const doSearch = async () => {
        const q = input.value.trim();
        const src = source.value;
        const results = document.getElementById('discSearchResults');
        if (!q) { results.innerHTML = '<div class="disc-empty"><i class="fas fa-search"></i><p>' + (lang === 'ro' ? 'Introdu un termen de căutare' : 'Enter a search term') + '</p></div>'; return; }
        results.innerHTML = '<div style="text-align:center;padding:30px;"><i class="fas fa-spinner fa-spin" style="font-size:20px;"></i></div>';

        try {
          let data;
          if (src === 'all') {
            const res = await fetch(`/api/discover/search?q=${encodeURIComponent(q)}&limit=12`);
            data = await res.json();
            results.innerHTML = (data.results || []).length === 0
              ? `<div class="disc-empty"><i class="fas fa-search"></i><h4>${lang === 'ro' ? 'Niciun rezultat' : 'No results'}</h4></div>`
              : `<div class="disc-grid">${(data.results || []).map(item => `
                <div class="disc-card" data-id="${item.id}" data-source="${item.source || 'tmdb'}">
                  <div class="disc-card-thumb" style="background:linear-gradient(135deg,${item.bg_color||'#1a1a2e'},${item.backdrop_color||'#16213e'})">
                    ${item.image_url || item.poster_path ? `<img src="${item.image_url || item.poster_path}" alt="${item.title}" loading="lazy">` : '<span style="font-size:28px;">🎬</span>'}
                    <div class="disc-card-overlay"><span class="disc-card-source">${item.source || 'tmdb'}</span></div>
                  </div>
                  <div class="disc-card-info">
                    <div class="disc-card-title">${item.title || ''}</div>
                    <div class="disc-card-meta">${item.year || ''} ${item.rating ? '• ' + item.rating : ''}</div>
                  </div>
                </div>`).join('')}</div>`;
          } else if (src === 'wikipedia') {
            const res = await fetch(`/api/discover/wikipedia?q=${encodeURIComponent(q)}`);
            data = await res.json();
            results.innerHTML = (data.results || []).length === 0
              ? `<div class="disc-empty"><i class="fas fa-search"></i><h4>No Wikipedia results</h4></div>`
              : `<div class="disc-web-list">${(data.results || []).map(r => `
                <div class="disc-web-card" onclick="window.open('https://en.wikipedia.org/wiki/${encodeURIComponent(r.title)}','_blank')">
                  <h4>${r.title}</h4>
                  <p>${r.snippet?.replace(/<[^>]*>/g,'') || ''}</p>
                  <span class="disc-web-source">Wikipedia</span>
                </div>`).join('')}</div>`;
          } else if (src === 'reddit') {
            const res = await fetch(`/api/discover/reddit?subreddit=${encodeURIComponent(q)}`);
            data = await res.json();
            results.innerHTML = (data.results || []).length === 0
              ? `<div class="disc-empty"><i class="fas fa-search"></i><h4>No Reddit results</h4></div>`
              : `<div class="disc-web-list">${(data.results || []).slice(0, 12).map(r => `
                <div class="disc-web-card" onclick="window.open('https://reddit.com${r.permalink || ''}','_blank')">
                  <h4>${r.title || ''}</h4>
                  <p>👍 ${r.ups || 0} • 💬 ${r.num_comments || 0}</p>
                  <span class="disc-web-source">r/${q}</span>
                </div>`).join('')}</div>`;
          } else if (src === 'music') {
            const res = await fetch(`/api/music/itunes?q=${encodeURIComponent(q)}`);
            data = await res.json();
            results.innerHTML = (data.results || []).length === 0
              ? `<div class="disc-empty"><i class="fas fa-music"></i><h4>No music results</h4></div>`
              : `<div class="disc-grid">${(data.results || []).slice(0, 12).map(r => `
                <div class="disc-card" onclick="window.open('${r.collectionViewUrl || r.trackViewUrl || ''}','_blank')">
                  <div class="disc-card-thumb" style="background:#1e1e2e">
                    ${r.artworkUrl60 ? `<img src="${r.artworkUrl60}" alt="${r.trackName || r.collectionName}" loading="lazy">` : '<span style="font-size:28px;">🎵</span>'}
                  </div>
                  <div class="disc-card-info">
                    <div class="disc-card-title">${r.trackName || r.collectionName || ''}</div>
                    <div class="disc-card-meta">${r.artistName || ''}</div>
                  </div>
                </div>`).join('')}</div>`;
          } else if (src === 'anime') {
            const res = await fetch(`/api/discover/anime?q=${encodeURIComponent(q)}`);
            data = await res.json();
            results.innerHTML = ((data.data || []).length === 0)
              ? `<div class="disc-empty"><i class="fas fa-dragon"></i><h4>No anime results</h4></div>`
              : `<div class="disc-grid">${(data.data || []).slice(0, 12).map(a => `
                <div class="disc-card" data-id="jikan_${a.mal_id}">
                  <div class="disc-card-thumb" style="background:#2d3436">
                    ${a.images?.jpg?.image_url ? `<img src="${a.images.jpg.image_url}" alt="${a.title}" loading="lazy">` : '<span style="font-size:28px;">🎌</span>'}
                    <div class="disc-card-overlay"><span class="disc-card-rating">★ ${a.score || 'N/A'}</span></div>
                  </div>
                  <div class="disc-card-info">
                    <div class="disc-card-title">${a.title || ''}</div>
                    <div class="disc-card-meta">${a.year || ''} • ${a.episodes || '?'} eps</div>
                  </div>
                </div>`).join('')}</div>`;
          } else {
            // TMDB or TV
            const endpoint = src === 'tv' ? '/api/discover/tv' : '/api/discover/tmdb/popular';
            const queryParam = src === 'tv' ? `q=${encodeURIComponent(q)}` : '';
            const res = await fetch(`${endpoint}?${queryParam}&page=1`);
            data = await res.json();
            const items = src === 'tv' ? (data.data || []) : (data.data || []);
            results.innerHTML = items.length === 0
              ? `<div class="disc-empty"><i class="fas fa-search"></i><h4>No results</h4></div>`
              : `<div class="disc-grid">${items.slice(0, 12).map(item => `
                <div class="disc-card">
                  <div class="disc-card-thumb" style="background:#1e1e2e">
                    <span style="font-size:28px;">📺</span>
                  </div>
                  <div class="disc-card-info">
                    <div class="disc-card-title">${item.show?.name || item.title || item.name || ''}</div>
                    <div class="disc-card-meta">${item.show?.rating?.average ? '★ ' + item.show.rating.average : ''}</div>
                  </div>
                </div>`).join('')}</div>`;
          }

          results.querySelectorAll('.disc-card').forEach(card => {
            if (card.dataset.id) {
              card.addEventListener('click', () => this.showExternalDetail(card.dataset.id, card.dataset.source || 'tmdb'));
            }
          });
        } catch (e) {
          results.innerHTML = `<div class="disc-empty"><i class="fas fa-exclamation-circle"></i><h4>${e.message}</h4></div>`;
        }
      };

      input.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(doSearch, 400); });
      source.addEventListener('change', doSearch);
    },

    // ====== ANIME TAB ======
    async renderAnime() {
      const el = document.getElementById('discContent');
      const lang = window.appLang || 'ro';
      el.innerHTML = '<div style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin" style="font-size:24px;"></i></div>';

      try {
        const [topAnime, seasonal, kitsu] = await Promise.all([
          fetch('/api/discover/anime?type=top&page=1').then(r => r.json()),
          fetch('/api/discover/anime?type=seasonal').then(r => r.json()),
          fetch('/api/discover/anime/kitsu').then(r => r.json()),
        ]);

        const renderAnimeCard = (a, source) => `
          <div class="disc-card" data-id="${source}_${a.mal_id || a.id}" data-source="${source}">
            <div class="disc-card-thumb" style="background:#2d3436">
              ${a.images?.jpg?.image_url || a.attributes?.posterImage?.tiny ? `<img src="${a.images?.jpg?.image_url || a.attributes?.posterImage?.tiny}" alt="${a.title || a.attributes?.canonicalTitle}" loading="lazy">` : '<span style="font-size:28px;">🎌</span>'}
              <div class="disc-card-overlay"><span class="disc-card-rating">★ ${a.score || (a.attributes?.averageRating ? (a.attributes.averageRating/10).toFixed(1) : 'N/A')}</span></div>
            </div>
            <div class="disc-card-info">
              <div class="disc-card-title">${a.title || a.attributes?.canonicalTitle || ''}</div>
              <div class="disc-card-meta">${a.year || (a.aired?.from || '').substring(0,4) || ''} ${a.episodes ? '• '+a.episodes+' eps' : ''}</div>
            </div>
          </div>`;

        el.innerHTML = `
          <div class="disc-section">
            <h3 class="disc-section-title"><i class="fas fa-fire" style="color:var(--orange);"></i> ${lang === 'ro' ? 'Top Anime' : 'Top Anime'}</h3>
            <div class="disc-grid">${(topAnime.data || []).slice(0, 6).map(a => renderAnimeCard(a, 'jikan')).join('') || '<div class="disc-empty">No data</div>'}</div>
          </div>
          <div class="disc-section">
            <h3 class="disc-section-title"><i class="fas fa-calendar-alt"></i> ${lang === 'ro' ? 'Sezonul Curent' : 'Current Season'}</h3>
            <div class="disc-grid">${(seasonal.data || []).slice(0, 6).map(a => renderAnimeCard(a, 'jikan')).join('') || '<div class="disc-empty">No data</div>'}</div>
          </div>
          <div class="disc-section">
            <h3 class="disc-section-title"><span style="font-size:18px;">🍵</span> Kitsu Trending</h3>
            <div class="disc-grid">${(kitsu.data || []).slice(0, 6).map(a => renderAnimeCard(a, 'kitsu')).join('') || '<div class="disc-empty">No data</div>'}</div>
          </div>`;

        el.querySelectorAll('.disc-card').forEach(card => {
          if (card.dataset.id) card.addEventListener('click', () => this.showExternalDetail(card.dataset.id, card.dataset.source || 'jikan'));
        });
      } catch (e) {
        el.innerHTML = `<div class="disc-empty"><i class="fas fa-exclamation-circle"></i><h4>${e.message}</h4></div>`;
      }
    },

    // ====== MUSIC TAB ======
    async renderMusic() {
      const el = document.getElementById('discContent');
      const lang = window.appLang || 'ro';
      el.innerHTML = '<div style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin" style="font-size:24px;"></i></div>';

      try {
        const [chart, itunes] = await Promise.all([
          fetch('/api/music/deezer/chart').then(r => r.json()),
          fetch('/api/music/itunes?q=top').then(r => r.json()),
        ]);

        el.innerHTML = `
          <div class="disc-section">
            <h3 class="disc-section-title"><i class="fas fa-chart-bar" style="color:var(--accent-secondary);"></i> Deezer ${lang === 'ro' ? 'Chart' : 'Chart'}</h3>
            <div class="disc-music-list">${((chart.data?.tracks?.data || [])).slice(0, 10).map((t, i) => `
              <div class="disc-music-card" onclick="window.open('${t.link || ''}','_blank')">
                <span class="disc-music-rank">${i + 1}</span>
                ${t.album?.cover_small ? `<img src="${t.album.cover_small}" alt="${t.title}" class="disc-music-cover">` : '<span class="disc-music-cover" style="font-size:24px;">🎵</span>'}
                <div class="disc-music-info">
                  <div class="disc-music-title">${t.title || ''}</div>
                  <div class="disc-music-artist">${t.artist?.name || ''}</div>
                </div>
                <span class="disc-music-duration">${t.duration ? Math.floor(t.duration/60) + ':' + String(t.duration%60).padStart(2,'0') : ''}</span>
              </div>`).join('') || '<div class="disc-empty">No data</div>'}</div>
          </div>
          <div class="disc-section">
            <h3 class="disc-section-title"><i class="fab fa-apple"></i> iTunes ${lang === 'ro' ? 'Căutare' : 'Search'}</h3>
            <div class="disc-search-bar" style="margin-bottom:12px;">
              <i class="fas fa-search"></i>
              <input type="text" id="discItunesSearch" placeholder="${lang === 'ro' ? 'Caută muzică...' : 'Search music...'}">
            </div>
            <div id="discItunesResults" class="disc-music-list">${((itunes.results || []).slice(1, 11)).map(r => `
              <div class="disc-music-card" onclick="window.open('${r.trackViewUrl || ''}','_blank')">
                ${r.artworkUrl60 ? `<img src="${r.artworkUrl60}" alt="${r.trackName}" class="disc-music-cover">` : '<span class="disc-music-cover" style="font-size:24px;">🎵</span>'}
                <div class="disc-music-info">
                  <div class="disc-music-title">${r.trackName || r.collectionName || ''}</div>
                  <div class="disc-music-artist">${r.artistName || ''}</div>
                </div>
                <span class="disc-music-duration">${r.trackTimeMillis ? Math.floor(r.trackTimeMillis/60000) + ':' + String(Math.floor(r.trackTimeMillis%60000/1000)).padStart(2,'0') : ''}</span>
              </div>`).join('') || '<div class="disc-empty">No data</div>'}</div>`;

        const itunesSearch = document.getElementById('discItunesSearch');
        if (itunesSearch) {
          let timer;
          itunesSearch.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(async () => {
              const q = itunesSearch.value.trim();
              const res = document.getElementById('discItunesResults');
              if (!q) return;
              const data = await (await fetch(`/api/music/itunes?q=${encodeURIComponent(q)}`)).json();
              res.innerHTML = ((data.results || []).slice(0, 10)).map(r => `
                <div class="disc-music-card" onclick="window.open('${r.trackViewUrl || ''}','_blank')">
                  ${r.artworkUrl60 ? `<img src="${r.artworkUrl60}" class="disc-music-cover">` : '<span class="disc-music-cover" style="font-size:24px;">🎵</span>'}
                  <div class="disc-music-info">
                    <div class="disc-music-title">${r.trackName || r.collectionName || ''}</div>
                    <div class="disc-music-artist">${r.artistName || ''}</div>
                  </div>
                </div>`).join('') || '<div class="disc-empty">No results</div>';
            }, 400);
          });
        }
      } catch (e) {
        el.innerHTML = `<div class="disc-empty"><i class="fas fa-exclamation-circle"></i><h4>${e.message}</h4></div>`;
      }
    },

    // ====== SPORTS TAB ======
    async renderSports() {
      const el = document.getElementById('discContent');
      const lang = window.appLang || 'ro';
      el.innerHTML = `
        <div class="disc-sports-nav">
          <button class="disc-sports-btn active" data-sport="football"><i class="fas fa-futbol"></i> Football</button>
          <button class="disc-sports-btn" data-sport="nba"><i class="fas fa-basketball-ball"></i> NBA</button>
          <button class="disc-sports-btn" data-sport="f1"><i class="fas fa-flag-checkered"></i> F1</button>
        </div>
        <div id="discSportsContent"><div style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin" style="font-size:24px;"></i></div></div>`;

      this.loadSports('football');

      el.querySelectorAll('.disc-sports-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          el.querySelectorAll('.disc-sports-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.loadSports(btn.dataset.sport);
        });
      });
    },

    async loadSports(sport) {
      const el = document.getElementById('discSportsContent');
      const lang = window.appLang || 'ro';
      if (!el) return;
      el.innerHTML = '<div style="text-align:center;padding:30px;"><i class="fas fa-spinner fa-spin" style="font-size:20px;"></i></div>';

      try {
        if (sport === 'football') {
          const data = await (await fetch('/api/sports/football/standings?league=PL')).json();
          const standings = data.data?.standings?.[0]?.table || [];
          el.innerHTML = standings.length === 0
            ? `<div class="disc-empty"><i class="fas fa-futbol"></i><h4>${lang === 'ro' ? 'Date indisponibile' : 'Data unavailable'}</h4><p>${lang === 'ro' ? 'Configură FOOTBALL_DATA_API_KEY în .env' : 'Set FOOTBALL_DATA_API_KEY in .env'}</p></div>`
            : `<div class="disc-section"><h3 class="disc-section-title"><i class="fas fa-trophy" style="color:var(--yellow);"></i> Premier League Standings</h3>
              <div class="disc-sports-table">${standings.slice(0, 10).map((t, i) => `
                <div class="disc-sports-row">
                  <span class="disc-sports-pos">${i + 1}</span>
                  <span class="disc-sports-team">${t.team?.name || t.team?.shortName || ''}</span>
                  <span class="disc-sports-stat">P: ${t.playedGames || 0}</span>
                  <span class="disc-sports-stat">W: ${t.won || 0}</span>
                  <span class="disc-sports-stat">D: ${t.draw || 0}</span>
                  <span class="disc-sports-stat">L: ${t.lost || 0}</span>
                  <span class="disc-sports-pts">${t.points || 0}</span>
                </div>`).join('')}</div></div>`;
        } else if (sport === 'nba') {
          const data = await (await fetch('/api/sports/nba/teams')).json();
          const teams = data.data || [];
          el.innerHTML = teams.length === 0
            ? `<div class="disc-empty"><i class="fas fa-basketball-ball"></i><h4>${lang === 'ro' ? 'Date indisponibile' : 'Data unavailable'}</h4></div>`
            : `<div class="disc-section"><h3 class="disc-section-title"><i class="fas fa-basketball-ball" style="color:var(--orange);"></i> NBA Teams</h3>
              <div class="disc-grid">${teams.map(t => `
                <div class="disc-card">
                  <div class="disc-card-thumb" style="background:#1e1e2e;font-size:32px;">🏀</div>
                  <div class="disc-card-info">
                    <div class="disc-card-title">${t.full_name || t.name || ''}</div>
                    <div class="disc-card-meta">${t.conference || ''} • ${t.division || ''}</div>
                  </div>
                </div>`).join('')}</div></div>`;
        } else if (sport === 'f1') {
          const data = await (await fetch('/api/sports/f1/current')).json();
          const races = data.data?.MRData?.RaceTable?.Races || [];
          el.innerHTML = races.length === 0
            ? `<div class="disc-empty"><i class="fas fa-flag-checkered"></i><h4>${lang === 'ro' ? 'Date indisponibile' : 'Data unavailable'}</h4></div>`
            : `<div class="disc-section"><h3 class="disc-section-title"><i class="fas fa-flag-checkered" style="color:var(--red);"></i> F1 ${new Date().getFullYear()} Calendar</h3>
              <div class="disc-music-list">${races.slice(0, 12).map(r => `
                <div class="disc-music-card" onclick="window.open('${r.url || ''}','_blank')">
                  <span class="disc-music-rank">${r.round || '?'}</span>
                  <div class="disc-music-info">
                    <div class="disc-music-title">${r.raceName || ''}</div>
                    <div class="disc-music-artist">${r.Circuit?.circuitName || ''} • ${r.date || ''}</div>
                  </div>
                </div>`).join('')}</div></div>`;
        }
      } catch (e) {
        el.innerHTML = `<div class="disc-empty"><i class="fas fa-exclamation-circle"></i><h4>${e.message}</h4></div>`;
      }
    },

    // ====== WEB TAB (Wikipedia, Reddit, RSS) ======
    renderWeb() {
      const el = document.getElementById('discContent');
      const lang = window.appLang || 'ro';
      el.innerHTML = `
        <div class="disc-section">
          <h3 class="disc-section-title"><i class="fab fa-wikipedia-w"></i> Wikipedia</h3>
          <div class="disc-search-bar" style="margin-bottom:12px;">
            <i class="fas fa-search"></i>
            <input type="text" id="discWikiSearch" placeholder="${lang === 'ro' ? 'Caută pe Wikipedia...' : 'Search Wikipedia...'}">
          </div>
          <div id="discWikiResults"></div>
        </div>
        <div class="disc-section">
          <h3 class="disc-section-title"><i class="fab fa-reddit" style="color:var(--orange);"></i> Reddit</h3>
          <div class="disc-search-bar" style="margin-bottom:12px;">
            <i class="fas fa-search"></i>
            <input type="text" id="discRedditSearch" placeholder="r/${lang === 'ro' ? 'subreddit...' : 'subreddit...'}">
          </div>
          <div id="discRedditResults"></div>
        </div>
        <div class="disc-section">
          <h3 class="disc-section-title"><i class="fas fa-rss" style="color:var(--orange);"></i> RSS Feed</h3>
          <div class="disc-search-bar" style="margin-bottom:12px;">
            <i class="fas fa-rss"></i>
            <input type="text" id="discRssInput" placeholder="${lang === 'ro' ? 'URL feed RSS...' : 'RSS feed URL...'}">
          </div>
          <div id="discRssResults"></div>
        </div>`;

      // Wikipedia search
      let wikiTimer;
      const wikiInput = document.getElementById('discWikiSearch');
      if (wikiInput) {
        wikiInput.addEventListener('input', () => {
          clearTimeout(wikiTimer);
          wikiTimer = setTimeout(async () => {
            const q = wikiInput.value.trim();
            const res = document.getElementById('discWikiResults');
            if (!q || q.length < 3) { res.innerHTML = ''; return; }
            const data = await (await fetch(`/api/discover/wikipedia?q=${encodeURIComponent(q)}`)).json();
            res.innerHTML = (data.results || []).length === 0
              ? '<div class="disc-empty"><p>No results</p></div>'
              : `<div class="disc-web-list">${(data.results || []).map(r => `
                <div class="disc-web-card" onclick="window.open('https://en.wikipedia.org/wiki/${encodeURIComponent(r.title)}','_blank')">
                  <h4>${r.title}</h4>
                  <p>${(r.snippet || '').replace(/<[^>]*>/g,'')}</p>
                </div>`).join('')}</div>`;
          }, 500);
        });
      }

      // Reddit search
      let redditTimer;
      const redditInput = document.getElementById('discRedditSearch');
      if (redditInput) {
        redditInput.addEventListener('input', () => {
          clearTimeout(redditTimer);
          redditTimer = setTimeout(async () => {
            const q = redditInput.value.trim();
            const res = document.getElementById('discRedditResults');
            if (!q) { res.innerHTML = ''; return; }
            const data = await (await fetch(`/api/discover/reddit?subreddit=${encodeURIComponent(q)}`)).json();
            res.innerHTML = (data.results || []).length === 0
              ? '<div class="disc-empty"><p>No results</p></div>'
              : `<div class="disc-web-list">${(data.results || []).slice(0, 10).map(r => `
                <div class="disc-web-card" onclick="window.open('https://reddit.com${r.permalink || ''}','_blank')">
                  <h4>${r.title || ''}</h4>
                  <p>👍 ${r.ups || 0} • 💬 ${r.num_comments || 0}</p>
                  <span class="disc-web-source">r/${q}</span>
                </div>`).join('')}</div>`;
          }, 500);
        });
      }

      // RSS feed
      let rssTimer;
      const rssInput = document.getElementById('discRssInput');
      if (rssInput) {
        rssInput.addEventListener('input', () => {
          clearTimeout(rssTimer);
          rssTimer = setTimeout(async () => {
            const url = rssInput.value.trim();
            const res = document.getElementById('discRssResults');
            if (!url || !url.startsWith('http')) { res.innerHTML = ''; return; }
            const data = await (await fetch(`/api/discover/rss?url=${encodeURIComponent(url)}`)).json();
            res.innerHTML = (data.items || []).length === 0
              ? '<div class="disc-empty"><p>No feed items</p></div>'
              : `<div class="disc-web-list">${(data.items || []).slice(0, 8).map(item => `
                <div class="disc-web-card" onclick="window.open('${item.link || ''}','_blank')">
                  <h4>${item.title || ''}</h4>
                  <p>${(item.description || '').replace(/<[^>]*>/g,'').substring(0, 200)}</p>
                </div>`).join('')}</div>`;
          }, 600);
        });
      }
    },

    // ====== EXTERNAL DETAIL ======
    async showExternalDetail(id, source) {
      const lang = window.appLang || 'ro';
      try {
        const res = await fetch(`/api/discover/detail/${source}/${id.replace(/^[^_]+_/, '')}`);
        const data = await res.json();
        if (!data.success || !data.data) {
          window.open(`https://www.themoviedb.org/${source === 'tmdb' ? (id.startsWith('tmdb_tv') ? 'tv' : 'movie') + '/' + id.replace(/^[^_]+_/, '') : ''}`, '_blank');
          return;
        }
        const d = data.data;
        const container = document.createElement('div');
        container.className = 'disc-modal-overlay';
        container.style.cssText = 'position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;padding:24px;';
        container.onclick = (e) => { if (e.target === container) container.remove(); };
        container.innerHTML = `
          <div style="background:var(--bg-primary);border-radius:16px;max-width:520px;width:100%;max-height:80vh;overflow-y:auto;padding:24px;">
            <div style="display:flex;gap:16px;margin-bottom:16px;">
              ${d.poster ? `<img src="${d.poster}" alt="${d.title}" style="width:120px;height:180px;object-fit:cover;border-radius:8px;flex-shrink:0;">` : `<div style="width:120px;height:180px;background:#1e1e2e;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:36px;flex-shrink:0;">🎬</div>`}
              <div style="flex:1;min-width:0;">
                <h2 style="font-size:20px;font-weight:700;margin-bottom:4px;">${d.title || ''}</h2>
                <p style="font-size:13px;color:var(--text-tertiary);margin-bottom:8px;">${d.year || ''} ${d.rating ? '• ' + d.rating : ''} ${d.duration ? '• ' + d.duration : ''}</p>
                <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;">${(d.genre || []).map(g => `<span style="padding:2px 8px;border-radius:4px;font-size:10px;background:rgba(255,255,255,0.06);">${g}</span>`).join('')}</div>
                <p style="font-size:13px;color:var(--text-secondary);line-height:1.5;">${(d.description || '').substring(0, 300)}</p>
              </div>
            </div>
            ${d.trailer ? `<a href="${d.trailer}" target="_blank" class="btn btn-primary" style="display:flex;align-items:center;gap:8px;justify-content:center;"><i class="fab fa-youtube"></i> ${lang === 'ro' ? 'Vezi Trailer' : 'Watch Trailer'}</a>` : ''}
            ${d.imdb_id ? `<a href="https://www.imdb.com/title/${d.imdb_id}" target="_blank" style="display:flex;align-items:center;gap:6px;justify-content:center;padding:10px;margin-top:8px;border-radius:8px;background:rgba(255,255,255,0.04);font-size:13px;text-decoration:none;color:var(--text-secondary);"><i class="fab fa-imdb"></i> IMDb</a>` : ''}
            <button class="btn btn-secondary" onclick="this.closest('.disc-modal-overlay').remove()" style="width:100%;justify-content:center;margin-top:12px;">${lang === 'ro' ? 'Închide' : 'Close'}</button>
          </div>`;
        document.body.appendChild(container);
      } catch (e) {
        window.open(`https://www.themoviedb.org/movie/${id.replace(/^[^_]+_/, '')}`, '_blank');
      }
    }
  };

  window.Discover = Discover;
})();
