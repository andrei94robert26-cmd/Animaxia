/**
 * Animaxia v5.3 - User Ratings Page
 * See all content you've rated, filter by rating, manage reviews
 * Netflix-style "My Ratings" feature
 */
(function() {
  'use strict';

  const RT = {
    init() {
      this.addRatingsLink();
    },

    addRatingsLink() {
      const dropdown = document.getElementById('userDropdown');
      if (!dropdown) return;
      const existing = dropdown.querySelector('[data-action="my-ratings"]');
      if (existing) return;

      const a = document.createElement('a');
      a.href = '#';
      a.className = 'dropdown-item';
      a.dataset.action = 'my-ratings';
      a.innerHTML = '<i class="fas fa-star" style="color:var(--yellow);"></i> <span data-lang="ro">Rating-urile mele</span><span data-lang="en" style="display:none;">My Ratings</span>';
      a.addEventListener('click', (e) => {
        e.preventDefault();
        this.showRatingsPage();
      });
      dropdown.insertBefore(a, dropdown.querySelector('[data-action="billing"]') || dropdown.querySelector('[data-action="settings"]'));
    },

    async showRatingsPage() {
      const lang = window.appLang || 'ro';
      if (window.App?.stopHero) window.App.stopHero();

      const existing = document.getElementById('ratingsScreen');
      if (existing) existing.remove();

      const screen = document.createElement('div');
      screen.id = 'ratingsScreen';
      screen.className = 'full-page-screen';
      screen.style.zIndex = '1000';
      screen.innerHTML = `
        <div class="full-page-header">
          <div class="full-page-header-content">
            <button class="full-page-back" id="rtBack"><i class="fas fa-arrow-left"></i></button>
            <h1><i class="fas fa-star" style="color:var(--yellow);"></i> ${lang === 'ro' ? 'Rating-urile mele' : 'My Ratings'}</h1>
            <div style="margin-left:auto;">
              <select id="rtFilter" style="width:auto;min-width:120px;padding:6px 10px;font-size:12px;">
                <option value="all">${lang === 'ro' ? 'Toate' : 'All'}</option>
                <option value="liked">👍 ${lang === 'ro' ? 'Apreciate' : 'Liked'}</option>
                <option value="disliked">👎 ${lang === 'ro' ? 'Neapreciate' : 'Disliked'}</option>
              </select>
            </div>
          </div>
        </div>
        <div class="full-page-body">
          <div class="rt-stats" id="rtStats"></div>
          <div class="my-list-grid" id="rtGrid">
            <div style="text-align:center;padding:60px;color:var(--text-tertiary);">
              <i class="fas fa-spinner fa-spin" style="font-size:24px;display:block;margin-bottom:16px;"></i>
            </div>
          </div>
        </div>`;
      document.body.appendChild(screen);

      document.getElementById('rtBack').addEventListener('click', () => {
        screen.remove();
        if (window.App?.startHero) window.App.startHero();
      });

      document.getElementById('rtFilter').addEventListener('change', () => this.loadRatings());
      this.loadRatings();
    },

    async loadRatings() {
      const grid = document.getElementById('rtGrid');
      const stats = document.getElementById('rtStats');
      const filter = document.getElementById('rtFilter')?.value || 'all';
      const lang = window.appLang || 'ro';

      if (!grid || !window.App?.currentProfile) return;

      try {
        const res = await fetch(`/api/user/${window.App.currentProfile.id}/data`);
        const data = await res.json();

        if (!data.success || !data.data?.ratings) {
          grid.innerHTML = `<div class="my-list-empty"><i class="fas fa-star"></i><h3>${lang === 'ro' ? 'Nicio evaluare' : 'No ratings yet'}</h3><p>${lang === 'ro' ? 'Evaluează conținut pentru a-l vedea aici' : 'Rate content to see it here'}</p></div>`;
          return;
        }

        const ratings = data.data.ratings;
        const items = [];
        // Use dynamic data first
        const allContent = window.AnimaxiaData?._cache || window.__content;
        if (allContent?.categories) {
          for (const cat of allContent.categories) {
            for (const item of (cat.items || [])) {
              if (item && ratings[item.id]) items.push({ ...item, liked: ratings[item.id].liked });
            }
          }
        }
        if (allContent?.featured) {
          for (const item of allContent.featured) {
            if (ratings[item.id] && !items.find(i => i.id === item.id)) items.push({ ...item, liked: ratings[item.id].liked });
          }
        }

        const liked = items.filter(i => i.liked === true);
        const disliked = items.filter(i => i.liked === false);

        // Apply filter
        let filtered = items;
        if (filter === 'liked') filtered = liked;
        else if (filter === 'disliked') filtered = disliked;

        if (stats) {
          stats.innerHTML = `
            <span style="font-size:13px;color:var(--text-tertiary);">
              👍 ${liked.length} ${lang === 'ro' ? 'apreciate' : 'liked'} • 👎 ${disliked.length} ${lang === 'ro' ? 'neapreciate' : 'disliked'}
            </span>`;
        }

        if (filtered.length === 0) {
          grid.innerHTML = `<div class="my-list-empty"><i class="fas fa-star"></i><h3>${lang === 'ro' ? 'Nicio evaluare' : 'No ratings yet'}</h3></div>`;
          return;
        }

        filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));

        grid.innerHTML = filtered.map(item => `
          <div class="content-card" data-id="${item.id}" onclick="App.openDetail('${item.id}')">
            <div class="content-card-image" style="background:${item.bg_color || '#1e1e2e'};position:relative;">
              <span class="card-badge ${item.content_type || 'movie'}">${item.content_type === 'series' ? 'Serial' : 'Film'}</span>
              <span class="card-image-icon">🎬</span>
              <div style="position:absolute;bottom:6px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.7);padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700;color:var(--yellow);white-space:nowrap;">
                ${item.liked ? '👍 ' + (lang === 'ro' ? 'Apreciat' : 'Liked') : '👎 ' + (lang === 'ro' ? 'Neapreciat' : 'Disliked')}
              </div>
            </div>
            <div class="content-card-info">
              <div class="content-card-title">${item.title}</div>
              <div class="content-card-meta"><span>${item.year || ''}</span><span class="content-card-dot">•</span><span>${item.duration || ''}</span></div>
            </div>
          </div>`).join('');
      } catch {
        grid.innerHTML = '<div class="my-list-empty"><i class="fas fa-exclamation-circle"></i><h3>Error loading ratings</h3></div>';
      }
    }
  };

  if (document.readyState !== 'loading') {
    RT.init();
  } else {
    document.addEventListener('DOMContentLoaded', () => RT.init());
  }

  window.RatingsModule = RT;
})();
