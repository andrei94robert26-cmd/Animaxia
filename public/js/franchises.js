/**
 * Animaxia v7.0 - Franchises Module
 * Browse and explore content franchises, universes, and collections.
 * Features: Franchise grid, detail page with timeline, item management
 */
(function() {
  'use strict';

  const Franchises = {
    currentId: null,

    init() {},

    // ====== SHOW FRANCHISES PAGE ======
    showPage(franchiseId) {
      if (window.App?.stopHero) window.App.stopHero();
      this.currentId = franchiseId || null;

      const existing = document.getElementById('franchisesScreen');
      if (existing) existing.remove();
      const lang = window.appLang || 'ro';

      const screen = document.createElement('div');
      screen.id = 'franchisesScreen';
      screen.className = 'full-page-screen';
      screen.style.zIndex = '1000';
      screen.innerHTML = `
        <div class="full-page-header">
          <div class="full-page-header-content">
            <button class="full-page-back" id="franchBack"><i class="fas fa-arrow-left"></i></button>
            <h1><i class="fas fa-star" style="color:var(--yellow);"></i> ${lang === 'ro' ? 'Francize' : 'Franchises'}</h1>
          </div>
        </div>
        <div class="full-page-body">
          <div id="franchContent">
            <div style="text-align:center;padding:60px;"><i class="fas fa-spinner fa-spin" style="font-size:32px;color:var(--text-tertiary);"></i></div>
          </div>
        </div>`;

      document.body.appendChild(screen);
      document.getElementById('franchBack').addEventListener('click', () => {
        screen.remove();
        if (window.App?.startHero) window.App.startHero();
      });

      if (franchiseId) this.renderFranchiseDetail(franchiseId);
      else this.renderFranchiseList();
    },

    // ====== FRANCHISE LIST ======
    async renderFranchiseList() {
      const container = document.getElementById('franchContent');
      const lang = window.appLang || 'ro';
      if (!container) return;
      container.innerHTML = '<div style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin" style="font-size:24px;"></i></div>';

      try {
        const res = await fetch('/api/franchises');
        const data = await res.json();
        const franchises = data.success ? data.data : [];

        container.innerHTML = `
          <div class="franch-hero" style="margin-bottom:28px;padding:32px;border-radius:16px;background:linear-gradient(135deg,rgba(108,92,231,0.1),rgba(162,155,254,0.05));border:1px solid rgba(108,92,231,0.1);text-align:center;">
            <div style="font-size:48px;margin-bottom:12px;">🌟</div>
            <h2 style="font-size:22px;font-weight:800;margin-bottom:8px;">${lang === 'ro' ? 'Explorează Francize' : 'Explore Franchises'}</h2>
            <p style="color:var(--text-tertiary);font-size:14px;">${lang === 'ro' ? 'Descoperă universurile și colecțiile de conținut organizate pe francize.' : 'Discover universes and content collections organized by franchises.'}</p>
          </div>
          <div class="franch-grid">
            ${franchises.length === 0 
              ? `<div class="franch-empty"><i class="fas fa-star"></i><h4>${lang === 'ro' ? 'Nicio franciză' : 'No franchises'}</h4></div>`
              : franchises.map(f => `
                <div class="franch-card" data-id="${f.id}">
                  <div class="franch-card-bg" style="background:linear-gradient(135deg, ${f.banner_color || '#6c5ce7'}, ${f.banner_color ? f.banner_color + '88' : '#a29bfe'});">
                    ${f.is_featured ? '<div class="franch-featured-badge"><i class="fas fa-crown"></i></div>' : ''}
                    <div class="franch-card-icon">${f.name.charAt(0)}</div>
                    <h3 class="franch-card-title">${f.name}</h3>
                    <p class="franch-card-desc">${f.description || ''}</p>
                  </div>
                  <div class="franch-card-footer">
                    <span class="franch-card-count"><i class="fas fa-film"></i> ${f.item_count || 0} ${lang === 'ro' ? 'titluri' : 'titles'}</span>
                    <button class="franch-card-btn"><i class="fas fa-arrow-right"></i></button>
                  </div>
                </div>
              `).join('')}
          </div>`;

        container.querySelectorAll('.franch-card').forEach(card => {
          card.addEventListener('click', () => {
            const id = card.dataset.id;
            this.renderFranchiseDetail(id);
          });
        });
      } catch (e) {
        container.innerHTML = `<div class="franch-empty"><i class="fas fa-exclamation-circle"></i><h4>${e.message}</h4></div>`;
      }
    },

    // ====== FRANCHISE DETAIL ======
    async renderFranchiseDetail(franchiseId) {
      const container = document.getElementById('franchContent');
      const lang = window.appLang || 'ro';
      if (!container) return;
      container.innerHTML = '<div style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin" style="font-size:24px;"></i></div>';

      try {
        const res = await fetch(`/api/franchises/${franchiseId}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Not found');
        const f = data.data;

        container.innerHTML = `
          <button class="franch-back-link" id="franchBackToList"><i class="fas fa-arrow-left"></i> ${lang === 'ro' ? 'Înapoi la francize' : 'Back to franchises'}</button>
          
          <div class="franch-detail-hero" style="background:linear-gradient(135deg, ${f.banner_color || '#6c5ce7'}, ${f.banner_color ? f.banner_color + '66' : '#a29bfe'});">
            <div class="franch-detail-content">
              <div class="franch-detail-icon">${f.name.charAt(0)}</div>
              <div>
                <h1 class="franch-detail-title">${f.name}</h1>
                <p class="franch-detail-desc">${f.description || ''}</p>
                <div class="franch-detail-meta">
                  <span><i class="fas fa-film"></i> ${f.item_count || 0} ${lang === 'ro' ? 'titluri' : 'titles'}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Timeline View -->
          <div class="franch-section">
            <h3 class="franch-section-title"><i class="fas fa-clock"></i> ${lang === 'ro' ? 'Cronologie' : 'Timeline'}</h3>
            <div class="franch-timeline">
              ${f.items && f.items.length > 0
                ? f.items.map((item, i) => {
                    const year = item.timeline_year || item.year || '';
                    return `
                    <div class="franch-timeline-item" data-id="${item.item_id}" style="--i:${i}">
                      <div class="franch-timeline-dot"></div>
                      <div class="franch-timeline-card" onclick="App.openPlayer('${item.item_id}')">
                        <div class="franch-timeline-header">
                          ${year ? `<span class="franch-timeline-year">${year}</span>` : ''}
                          <span class="franch-timeline-type">${item.content_type === 'series' ? (lang === 'ro' ? 'Serial' : 'Series') : (lang === 'ro' ? 'Film' : 'Movie')}</span>
                          ${item.timeline_label ? `<span class="franch-timeline-label">${item.timeline_label}</span>` : ''}
                        </div>
                        <div class="franch-timeline-body">
                          <div class="franch-timeline-thumb" style="background:${item.bg_color || '#1e1e2e'}">
                            <i class="fas fa-play-circle"></i>
                          </div>
                          <div class="franch-timeline-info">
                            <h4 class="franch-timeline-title">${item.title || item.title_en || ''}</h4>
                            ${item.genre && item.genre.length ? `<div class="franch-timeline-genres">${item.genre.slice(0, 2).join(' • ')}</div>` : ''}
                          </div>
                        </div>
                      </div>
                    </div>`;
                  }).join('')
                : `<div class="franch-empty"><i class="fas fa-clock"></i><h4>${lang === 'ro' ? 'Nicio intrare în cronologie' : 'No timeline entries'}</h4></div>`
              }
            </div>
          </div>

          <!-- All Items Grid -->
          <div class="franch-section">
            <h3 class="franch-section-title"><i class="fas fa-list"></i> ${lang === 'ro' ? 'Toate titlurile' : 'All Titles'} (${f.items ? f.items.length : 0})</h3>
            <div class="franch-items-grid">
              ${f.items && f.items.length > 0
                ? f.items.map(item => `
                  <div class="franch-item-card" onclick="App.openPlayer('${item.item_id}')">
                    <div class="franch-item-thumb" style="background:${item.bg_color || '#1e1e2e'}">
                      <div class="franch-item-overlay"><i class="fas fa-play"></i></div>
                      <span class="franch-item-badge">${item.content_type === 'series' ? (lang === 'ro' ? 'Serial' : 'Series') : (lang === 'ro' ? 'Film' : 'Movie')}</span>
                    </div>
                    <div class="franch-item-info">
                      <div class="franch-item-title">${item.title || item.title_en || ''}</div>
                      <div class="franch-item-meta">
                        <span>${item.year || ''}</span>
                        ${item.match_rating ? `<span class="franch-item-match">${item.match_rating}</span>` : ''}
                      </div>
                    </div>
                  </div>
                `).join('')
                : ''}
            </div>
          </div>`;

        document.getElementById('franchBackToList').addEventListener('click', () => {
          this.currentId = null;
          this.renderFranchiseList();
        });
      } catch (e) {
        container.innerHTML = `<div class="franch-empty"><i class="fas fa-exclamation-circle"></i><h4>${e.message}</h4><button class="btn btn-secondary" onclick="Franchises.renderFranchiseList()" style="margin-top:12px;">${lang === 'ro' ? 'Înapoi' : 'Back'}</button></div>`;
      }
    }
  };

  window.Franchises = Franchises;
})();
