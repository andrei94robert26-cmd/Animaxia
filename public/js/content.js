/**
 * Animaxia v7.0 - Content Explorer Module
 * Browse and explore the full content library with advanced filters,
 * category browsing, and TMDB-powered external discovery.
 */
(function() {
  'use strict';

  const Content = {
    page: 1,
    filters: { genre: '', type: '', sort: 'popular', q: '' },
    loading: false,

    init() {},

    // ====== SHOW CONTENT PAGE ======
    showPage() {
      if (window.App?.stopHero) window.App.stopHero();
      const existing = document.getElementById('contentExploreScreen');
      if (existing) existing.remove();
      const lang = window.appLang || 'ro';

      const screen = document.createElement('div');
      screen.id = 'contentExploreScreen';
      screen.className = 'full-page-screen';
      screen.style.zIndex = '1000';
      screen.innerHTML = `
        <div class="full-page-header">
          <div class="full-page-header-content">
            <button class="full-page-back" id="contentExploreBack"><i class="fas fa-arrow-left"></i></button>
            <h1><i class="fas fa-photo-video" style="color:var(--accent-secondary);"></i> ${lang === 'ro' ? 'Biblioteca de Conținut' : 'Content Library'}</h1>
          </div>
        </div>
        <div class="full-page-body">
          <div id="contentExploreApp"></div>
        </div>`;

      document.body.appendChild(screen);
      document.getElementById('contentExploreBack').addEventListener('click', () => {
        screen.remove();
        if (window.App?.startHero) window.App.startHero();
      });

      this.render();
    },

    // ====== RENDER CONTENT EXPLORER ======
    async render() {
      const app = document.getElementById('contentExploreApp');
      const lang = window.appLang || 'ro';
      if (!app) return;

      app.innerHTML = `
        <div class="cnt-stats" id="cntStats">
          <div style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin" style="font-size:24px;color:var(--text-tertiary);"></i></div>
        </div>
        <div class="cnt-toolbar" id="cntToolbar">
          <div class="cnt-search">
            <i class="fas fa-search"></i>
            <input type="text" id="cntSearch" placeholder="${lang === 'ro' ? 'Caută în bibliotecă...' : 'Search library...'}">
          </div>
          <select id="cntGenreFilter" class="cnt-select">
            <option value="">${lang === 'ro' ? 'Toate genurile' : 'All genres'}</option>
          </select>
          <select id="cntTypeFilter" class="cnt-select">
            <option value="">${lang === 'ro' ? 'Toate tipurile' : 'All types'}</option>
            <option value="movie">${lang === 'ro' ? 'Filme' : 'Movies'}</option>
            <option value="series">${lang === 'ro' ? 'Seriale' : 'Series'}</option>
          </select>
          <select id="cntSortFilter" class="cnt-select">
            <option value="popular">${lang === 'ro' ? 'Populare' : 'Popular'}</option>
            <option value="title">${lang === 'ro' ? 'Alfabetic' : 'Alphabetical'}</option>
            <option value="newest">${lang === 'ro' ? 'Cele mai noi' : 'Newest'}</option>
            <option value="rating">${lang === 'ro' ? 'Rating' : 'Rating'}</option>
          </select>
        </div>
        <div class="cnt-grid" id="cntGrid">
          <div style="text-align:center;padding:60px;"><i class="fas fa-spinner fa-spin" style="font-size:32px;color:var(--text-tertiary);"></i></div>
        </div>
        <div class="cnt-pagination" id="cntPagination"></div>`;

      // Load stats
      this.loadStats();
      // Load content
      this.loadContent();
      // Bind filters
      this.bindFilters();
    },

    // ====== LOAD STATS ======
    async loadStats() {
      const el = document.getElementById('cntStats');
      if (!el) return;
      const lang = window.appLang || 'ro';
      try {
        const res = await fetch('/api/content/stats');
        const data = await res.json();
        if (!data.success) throw new Error('Failed');
        const s = data.stats;
        el.innerHTML = `
          <div class="cnt-stat-card"><span class="cnt-stat-icon">📦</span><span class="cnt-stat-val">${s.total}</span><span class="cnt-stat-lbl">${lang === 'ro' ? 'Total' : 'Total'}</span></div>
          <div class="cnt-stat-card"><span class="cnt-stat-icon">🎬</span><span class="cnt-stat-val">${s.movies}</span><span class="cnt-stat-lbl">${lang === 'ro' ? 'Filme' : 'Movies'}</span></div>
          <div class="cnt-stat-card"><span class="cnt-stat-icon">📺</span><span class="cnt-stat-val">${s.series}</span><span class="cnt-stat-lbl">${lang === 'ro' ? 'Seriale' : 'Series'}</span></div>
          <div class="cnt-stat-card"><span class="cnt-stat-icon">⭐</span><span class="cnt-stat-val">${s.featured}</span><span class="cnt-stat-lbl">${lang === 'ro' ? 'Featured' : 'Featured'}</span></div>
          <div class="cnt-genres-bar">${s.genres.map(g => `<span class="cnt-genre-tag">${g.g} (${g.c})</span>`).join('')}</div>`;

        // Populate genre filter
        const genreSelect = document.getElementById('cntGenreFilter');
        if (genreSelect) {
          s.genres.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g.g;
            opt.textContent = g.g;
            genreSelect.appendChild(opt);
          });
        }
      } catch (e) {
        el.innerHTML = `<div style="text-align:center;padding:20px;color:var(--red);"><i class="fas fa-exclamation-circle"></i> ${e.message}</div>`;
      }
    },

    // ====== LOAD CONTENT ======
    async loadContent() {
      if (this.loading) return;
      this.loading = true;
      const grid = document.getElementById('cntGrid');
      const pag = document.getElementById('cntPagination');
      if (!grid) return;
      const lang = window.appLang || 'ro';

      grid.innerHTML = '<div style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin" style="font-size:24px;"></i></div>';

      try {
        const params = new URLSearchParams({ page: this.page, limit: 20 });
        if (this.filters.genre) params.set('genre', this.filters.genre);
        if (this.filters.type) params.set('type', this.filters.type);
        if (this.filters.sort) params.set('sort', this.filters.sort);
        if (this.filters.q) params.set('q', this.filters.q);
        if (lang) params.set('lang', lang);

        const res = await fetch(`/api/content/browse?${params}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed');

        if (data.data.length === 0) {
          grid.innerHTML = `<div class="cnt-empty"><i class="fas fa-search"></i><h3>${lang === 'ro' ? 'Niciun rezultat' : 'No results'}</h3><p>${lang === 'ro' ? 'Încearcă alți filtri de căutare.' : 'Try different search filters.'}</p></div>`;
          pag.innerHTML = '';
          this.loading = false;
          return;
        }

        grid.innerHTML = data.data.map(item => `
          <div class="cnt-card" data-id="${item.id}">
            <div class="cnt-card-thumb" style="background:${item.bg_color || '#1e1e2e'}">
              <span class="cnt-card-type">${item.content_type === 'series' ? (lang === 'ro' ? 'Serial' : 'Series') : (lang === 'ro' ? 'Film' : 'Movie')}</span>
              <span class="cnt-card-icon">🎬</span>
              <div class="cnt-card-overlay">
                <button class="cnt-card-play cnt-card-overlay-btn" onclick="event.stopPropagation();App.openPlayer('${item.id}')"><i class="fas fa-play"></i></button>
                <button class="cnt-card-info-btn cnt-card-overlay-btn" onclick="event.stopPropagation();App.openDetail('${item.id}')"><i class="fas fa-info-circle"></i></button>
              </div>
              ${item.match_rating ? `<span class="cnt-card-match">${item.match_rating}</span>` : ''}
            </div>
            <div class="cnt-card-info">
              <div class="cnt-card-title">${item.title}</div>
              <div class="cnt-card-meta">
                <span>${item.year || ''}</span>
                <span class="cnt-card-dot">•</span>
                <span>${item.duration || ''}</span>
                ${item.rating ? `<span class="cnt-card-dot">•</span><span class="cnt-card-rating">${item.rating}</span>` : ''}
              </div>
              <div class="cnt-card-genres">${(item.genre || []).slice(0, 3).map(g => `<span class="cnt-card-genre">${g}</span>`).join('')}</div>
            </div>
          </div>
        `).join('');

        grid.querySelectorAll('.cnt-card').forEach(card => {
          card.addEventListener('click', () => App.openDetail(card.dataset.id));
        });

        // Pagination
        pag.innerHTML = '';
        if (data.pages > 1) {
          const prevBtn = document.createElement('button');
          prevBtn.className = 'cnt-page-btn';
          prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
          prevBtn.disabled = this.page <= 1;
          prevBtn.addEventListener('click', () => { if (this.page > 1) { this.page--; this.loadContent(); window.scrollTo(0, 0); } });
          pag.appendChild(prevBtn);

          for (let p = Math.max(1, this.page - 2); p <= Math.min(data.pages, this.page + 2); p++) {
            const btn = document.createElement('button');
            btn.className = 'cnt-page-btn' + (p === this.page ? ' active' : '');
            btn.textContent = p;
            btn.addEventListener('click', () => { this.page = p; this.loadContent(); window.scrollTo(0, 0); });
            pag.appendChild(btn);
          }

          const nextBtn = document.createElement('button');
          nextBtn.className = 'cnt-page-btn';
          nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
          nextBtn.disabled = this.page >= data.pages;
          nextBtn.addEventListener('click', () => { if (this.page < data.pages) { this.page++; this.loadContent(); window.scrollTo(0, 0); } });
          pag.appendChild(nextBtn);
        }
      } catch (e) {
        grid.innerHTML = `<div class="cnt-empty"><i class="fas fa-exclamation-circle"></i><h3>${e.message}</h3><button class="btn btn-secondary" onclick="Content.loadContent()" style="margin-top:12px;">${lang === 'ro' ? 'Reîncearcă' : 'Retry'}</button></div>`;
      }
      this.loading = false;
    },

    // ====== BIND FILTERS ======
    bindFilters() {
      const search = document.getElementById('cntSearch');
      const genre = document.getElementById('cntGenreFilter');
      const type = document.getElementById('cntTypeFilter');
      const sort = document.getElementById('cntSortFilter');

      let searchTimer;
      if (search) {
        search.addEventListener('input', () => {
          clearTimeout(searchTimer);
          searchTimer = setTimeout(() => {
            this.filters.q = search.value.trim();
            this.page = 1;
            this.loadContent();
          }, 400);
        });
      }

      const applyFilter = () => {
        this.filters.genre = genre ? genre.value : '';
        this.filters.type = type ? type.value : '';
        this.filters.sort = sort ? sort.value : 'popular';
        this.page = 1;
        this.loadContent();
      };

      if (genre) genre.addEventListener('change', applyFilter);
      if (type) type.addEventListener('change', applyFilter);
      if (sort) sort.addEventListener('change', applyFilter);
    }
  };

  window.Content = Content;
})();
