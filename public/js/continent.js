/* ====== CONTINENT MODULE ====== */
(function() {
  'use strict';

  const API = '/api';
  let selectedRegion = null;

  window.Continent = {
    showPage() {
      const container = document.getElementById('contentRows');
      if (!container) return;
      const lang = window.appLang || 'ro';

      container.innerHTML = `
        <div class="industry-section">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;flex-wrap:wrap;">
            <h2 style="font-size:22px;font-weight:800;display:flex;align-items:center;gap:8px;">
              <i class="fas fa-globe" style="color:var(--accent-secondary);"></i>
              ${lang === 'ro' ? 'Explorator Regiuni' : 'Region Explorer'}
            </h2>
          </div>
          <div id="continentRegions" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;margin-bottom:28px;"></div>
          <div id="continentContent"></div>
        </div>
      `;

      this.loadRegions();
    },

    async loadRegions() {
      const el = document.getElementById('continentRegions');
      if (!el) return;
      const lang = window.appLang || 'ro';

      try {
        const res = await fetch(`${API}/continent/regions`);
        const data = await res.json();
        const regions = data.data || [];

        el.innerHTML = regions.map(r => `
          <div class="cnt-stat-card" style="cursor:pointer;flex-direction:column;align-items:center;padding:20px 16px;gap:8px;${selectedRegion === r.id ? 'border-color:var(--accent-secondary);background:rgba(108,92,231,0.08);' : ''}" data-id="${r.id}">
            <div style="font-size:36px;line-height:1;">${r.flag || '🌍'}</div>
            <div style="font-size:16px;font-weight:700;text-align:center;">${r.name}</div>
            <div style="font-size:12px;color:var(--text-tertiary);text-align:center;">${r.language || ''}</div>
            <div style="font-size:11px;color:var(--text-muted);">${r.content_count || r.item_count || 0} ${lang === 'ro' ? 'conținuturi' : 'items'}</div>
          </div>
        `).join('');

        el.querySelectorAll('.cnt-stat-card').forEach(card => {
          card.addEventListener('click', () => {
            el.querySelectorAll('.cnt-stat-card').forEach(c => c.style.borderColor = '');
            card.style.borderColor = 'var(--accent-secondary)';
            card.style.background = 'rgba(108,92,231,0.08)';
            selectedRegion = card.dataset.id;
            this.loadContent(card.dataset.id);
          });
        });
      } catch { el.innerHTML = `<div class="industry-error" style="grid-column:1/-1;"><i class="fas fa-exclamation-triangle"></i></div>`; }
    },

    async loadContent(regionId) {
      const el = document.getElementById('continentContent');
      if (!el) return;
      const lang = window.appLang || 'ro';

      try {
        const res = await fetch(`${API}/continent/region/${regionId}/content`);
        const data = await res.json();
        const items = data.data || [];

        if (items.length === 0) {
          el.innerHTML = `<div class="industry-empty"><i class="fas fa-globe"></i><h4>${lang === 'ro' ? 'Niciun conținut în această regiune' : 'No content in this region'}</h4></div>`;
          return;
        }

        el.innerHTML = `
          <h3 style="font-size:18px;font-weight:700;margin-bottom:14px;display:flex;align-items:center;gap:8px;">
            <i class="fas fa-film" style="color:var(--accent-secondary);"></i> ${lang === 'ro' ? 'Conținut disponibil' : 'Available Content'} <span style="font-size:13px;color:var(--text-tertiary);font-weight:400;">(${items.length})</span>
          </h3>
          <div class="cnt-grid">
          ${items.map(item => `
            <div class="cnt-card" data-id="${item.id}">
              <div class="cnt-card-thumb" style="background:${item.bg_color || '#1e1e2e'};">
                <span class="cnt-card-type ${item.content_type}">${item.content_type === 'series' ? (lang === 'ro' ? 'Serial' : 'Series') : (lang === 'ro' ? 'Film' : 'Movie')}</span>
                <span class="cnt-card-icon" style="font-size:28px;">🎬</span>
                ${item.is_featured ? '<span class="cnt-card-match" style="background:rgba(0,184,148,0.8);color:white;">★ ' + (lang === 'ro' ? 'Featured' : 'Featured') + '</span>' : ''}
                <div class="cnt-card-overlay">
                  <button class="cnt-card-play" onclick="event.stopPropagation();App.openPlayer('${item.id}')"><i class="fas fa-play"></i></button>
                  <button class="cnt-card-overlay-btn cnt-card-info-btn" onclick="event.stopPropagation();App.openDetail('${item.id}')"><i class="fas fa-info"></i></button>
                </div>
              </div>
              <div class="cnt-card-body">
                <div class="cnt-card-title">${item.title}</div>
                <div class="cnt-card-meta"><span>${item.year || ''}</span><span class="cnt-card-dot">•</span><span>${item.duration || ''}</span></div>
              </div>
            </div>
          `).join('')}
        </div>`;

        el.querySelectorAll('.cnt-card').forEach(card => {
          card.addEventListener('click', () => App.openDetail(card.dataset.id));
        });
      } catch { el.innerHTML = `<div class="industry-error"><i class="fas fa-exclamation-triangle"></i></div>`; }
    }
  };
})();
