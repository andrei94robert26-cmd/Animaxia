/* ====== ADDON MARKETPLACE MODULE ====== */
(function() {
  'use strict';

  const API = '/api';

  window.AddonMarketplace = {
    showPage() {
      const container = document.getElementById('contentRows');
      if (!container) return;
      const lang = window.appLang || 'ro';

      container.innerHTML = `
        <div class="industry-section">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
            <h2 style="font-size:22px;font-weight:800;display:flex;align-items:center;gap:8px;">
              <i class="fas fa-store" style="color:var(--accent-secondary);"></i>
              ${lang === 'ro' ? 'Marketplace Add-on' : 'Add-on Marketplace'}
            </h2>
          </div>

          <div class="cnt-stats" id="mpStats"></div>

          <div class="cnt-toolbar" id="mpToolbar">
            <div class="cnt-search">
              <i class="fas fa-search"></i>
              <input type="text" id="mpSearch" placeholder="${lang === 'ro' ? 'Caută add-on-uri...' : 'Search add-ons...'}">
            </div>
            <select class="cnt-select" id="mpTypeFilter">
              <option value="">${lang === 'ro' ? 'Toate tipurile' : 'All types'}</option>
              <option value="extension">Extension</option>
              <option value="theme">Theme</option>
              <option value="tool">Tool</option>
              <option value="integration">Integration</option>
              <option value="language">Language</option>
            </select>
          </div>

          <div id="mpGrid"></div>
        </div>
      `;

      this.loadFeatured();
      this.loadAll();

      document.getElementById('mpSearch')?.addEventListener('input', () => this.searchDebounce());
      document.getElementById('mpTypeFilter')?.addEventListener('change', () => this.searchDebounce());
    },

    _searchTimer: null,
    searchDebounce() {
      clearTimeout(this._searchTimer);
      this._searchTimer = setTimeout(() => this.loadAll(), 400);
    },

    async loadFeatured() {
      try {
        const res = await fetch(`${API}/marketplace/featured`);
        const data = await res.json();
        const items = data.data || [];
        const el = document.getElementById('mpStats');
        if (!el) return;
        if (items.length === 0) { el.innerHTML = ''; return; }
        el.innerHTML = items.map(a => `
          <div class="cnt-stat-card" style="cursor:pointer;" data-id="${a.id}">
            <div style="width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,#6c5ce7,#a29bfe);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:white;">${a.name[0]}</div>
            <div>
              <div style="font-size:14px;font-weight:600;">${a.name}</div>
              <div style="font-size:10px;color:var(--text-tertiary);">${a.downloads || 0} downloads</div>
            </div>
          </div>
        `).join('');
      } catch {}
    },

    async loadAll() {
      const el = document.getElementById('mpGrid');
      if (!el) return;
      const q = document.getElementById('mpSearch')?.value || '';
      const type = document.getElementById('mpTypeFilter')?.value || '';
      const lang = window.appLang || 'ro';

      try {
        const res = await fetch(`${API}/marketplace/search?q=${encodeURIComponent(q)}&type=${type}`);
        const data = await res.json();
        const addons = data.data || [];

        if (addons.length === 0) {
          el.innerHTML = `<div class="industry-empty" style="grid-column:1/-1;"><i class="fas fa-box-open"></i><h4>${lang === 'ro' ? 'Niciun rezultat' : 'No results found'}</h4></div>`;
          return;
        }

        el.innerHTML = `
          <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:12px;">${data.total || addons.length} ${lang === 'ro' ? 'rezultate' : 'results'}</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;">
          ${addons.map(a => `
            <div style="padding:16px;border-radius:12px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);transition:all 0.2s;">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                <div style="width:42px;height:42px;border-radius:10px;background:linear-gradient(135deg,${['#6c5ce7','#00b894','#e17055','#0984e3','#e84393','#fdcb6e'][a.id % 6]},${['#a29bfe','#55efc4','#fab1a0','#74b9ff','#fd79a8','#ffeaa7'][a.id % 6]});display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:white;">${a.name[0]}</div>
                <div style="flex:1;min-width:0;">
                  <div style="font-size:15px;font-weight:600;display:flex;align-items:center;gap:6px;">${a.name} ${a.is_official ? '<span style="font-size:9px;padding:1px 6px;border-radius:3px;background:rgba(0,184,148,0.15);color:var(--green);font-weight:600;">OFFICIAL</span>' : ''}</div>
                  <div style="font-size:12px;color:var(--text-tertiary);">v${a.version} · ${a.author}</div>
                </div>
              </div>
              <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:10px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${a.description || ''}</div>
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;text-transform:uppercase;background:rgba(108,92,231,0.1);color:var(--accent-secondary);">${a.type}</span>
                ${a.rating > 0 ? `<span style="font-size:12px;color:var(--yellow);">★ ${a.rating}</span><span style="font-size:11px;color:var(--text-tertiary);">(${a.review_count || 0})</span>` : ''}
                <span style="font-size:11px;color:var(--text-tertiary);margin-left:auto;"><i class="fas fa-download"></i> ${a.downloads || 0}</span>
              </div>
              <div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.04);display:flex;gap:8px;">
                <button class="btn btn-primary" data-action="install" data-id="${a.id}" style="flex:1;padding:6px;font-size:12px;">
                  <i class="fas fa-download"></i> ${lang === 'ro' ? 'Instalează' : 'Install'}
                </button>
                <button class="btn btn-secondary" data-action="details" data-id="${a.id}" style="padding:6px 12px;font-size:12px;">
                  <i class="fas fa-info-circle"></i>
                </button>
              </div>
            </div>
          `).join('')}
        </div>`;

        el.querySelectorAll('[data-action="install"]').forEach(btn => {
          btn.addEventListener('click', async () => {
            await fetch(`${API}/addon/install`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('animaxia_token')}` },
              body: JSON.stringify({ addonId: parseInt(btn.dataset.id) })
            });
            App.toast(lang === 'ro' ? 'Add-on instalat!' : 'Add-on installed!', 'success');
            btn.innerHTML = '<i class="fas fa-check"></i> ' + (lang === 'ro' ? 'Instalat' : 'Installed');
            btn.disabled = true;
          });
        });
      } catch { el.innerHTML = `<div class="industry-error"><i class="fas fa-exclamation-triangle"></i><p>${lang === 'ro' ? 'Eroare' : 'Error'}</p></div>`; }
    }
  };
})();
