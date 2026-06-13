/* ====== ADDON MODULE ====== */
(function() {
  'use strict';

  const API = '/api';
  let currentView = 'installed';
  let addonPage = 1;

  window.Addon = {
    showPage() {
      const container = document.getElementById('contentRows');
      if (!container) return;
      const lang = window.appLang || 'ro';

      container.innerHTML = `
        <div class="industry-section">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
            <h2 style="font-size:22px;font-weight:800;display:flex;align-items:center;gap:8px;">
              <i class="fas fa-puzzle-piece" style="color:var(--accent-secondary);"></i>
              ${lang === 'ro' ? 'Add-on-uri' : 'Add-ons'}
            </h2>
            <div class="industry-tabs" style="margin-left:auto;">
              <button class="industry-tab-btn active" data-view="installed">
                <i class="fas fa-check-circle"></i> <span class="industry-tab-label">${lang === 'ro' ? 'Instalate' : 'Installed'}</span>
              </button>
              <button class="industry-tab-btn" data-view="browse">
                <i class="fas fa-store"></i> <span class="industry-tab-label">${lang === 'ro' ? 'Explorează' : 'Browse'}</span>
              </button>
              <button class="industry-tab-btn" data-view="configure">
                <i class="fas fa-cog"></i> <span class="industry-tab-label">${lang === 'ro' ? 'Configurare' : 'Configure'}</span>
              </button>
            </div>
          </div>
          <div id="addonContent">
            <div class="industry-empty"><i class="fas fa-puzzle-piece"></i><h4>${lang === 'ro' ? 'Se încarcă...' : 'Loading...'}</h4></div>
          </div>
        </div>
      `;

      container.querySelectorAll('.industry-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          container.querySelectorAll('.industry-tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          currentView = btn.dataset.view;
          this[currentView === 'installed' ? 'loadInstalled' : currentView === 'browse' ? 'loadBrowse' : 'loadConfigure']();
        });
      });

      this.loadInstalled();
    },

    async loadInstalled() {
      const el = document.getElementById('addonContent');
      if (!el) return;
      try {
        const res = await fetch(`${API}/addon/installed`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('animaxia_token')}` } });
        const data = await res.json();
        const lang = window.appLang || 'ro';
        const addons = data.data || [];

        if (addons.length === 0) {
          el.innerHTML = `<div class="industry-empty"><i class="fas fa-puzzle-piece"></i><h4>${lang === 'ro' ? 'Niciun add-on instalat' : 'No add-ons installed'}</h4><p>${lang === 'ro' ? 'Explorează marketplace-ul pentru a găsi add-on-uri utile.' : 'Browse the marketplace to find useful add-ons.'}</p></div>`;
          return;
        }

        el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;">
          ${addons.map(a => `
            <div style="padding:16px;border-radius:12px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);">
              <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
                <div style="width:44px;height:44px;border-radius:10px;background:linear-gradient(135deg,${a.id % 2 ? '#6c5ce7' : '#00b894'},${a.id % 2 ? '#a29bfe' : '#55efc4'});display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:white;">${a.name[0]}</div>
                <div style="flex:1;min-width:0;">
                  <div style="font-size:15px;font-weight:600;">${a.name}</div>
                  <div style="font-size:12px;color:var(--text-tertiary);">v${a.version} · ${a.author}</div>
                </div>
              </div>
              <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:10px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${a.description || ''}</div>
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;text-transform:uppercase;background:rgba(108,92,231,0.1);color:var(--accent-secondary);">${a.type}</span>
                <button class="btn btn-secondary" data-action="uninstall" data-id="${a.id}" style="margin-left:auto;padding:4px 12px;font-size:12px;color:var(--red);">
                  <i class="fas fa-trash"></i> ${lang === 'ro' ? 'Dezinstalează' : 'Uninstall'}
                </button>
              </div>
            </div>
          `).join('')}
        </div>`;

        el.querySelectorAll('[data-action="uninstall"]').forEach(btn => {
          btn.addEventListener('click', async () => {
            await fetch(`${API}/addon/uninstall`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('animaxia_token')}` },
              body: JSON.stringify({ addonId: parseInt(btn.dataset.id) })
            });
            App.toast(lang === 'ro' ? 'Add-on dezinstalat!' : 'Add-on uninstalled!', 'success');
            this.loadInstalled();
          });
        });
      } catch { el.innerHTML = `<div class="industry-error"><i class="fas fa-exclamation-triangle"></i><p>${lang === 'ro' ? 'Eroare la încărcare' : 'Error loading'}</p></div>`; }
    },

    async loadBrowse() {
      const el = document.getElementById('addonContent');
      if (!el) return;
      try {
        const res = await fetch(`${API}/addon/list?page=${addonPage}&limit=20`);
        const data = await res.json();
        const lang = window.appLang || 'ro';
        const addons = data.data || [];

        if (addons.length === 0) {
          el.innerHTML = `<div class="industry-empty"><i class="fas fa-box-open"></i><h4>${lang === 'ro' ? 'Niciun add-on disponibil' : 'No add-ons available'}</h4></div>`;
          return;
        }

        el.innerHTML = `
          <div style="margin-bottom:12px;font-size:14px;color:var(--text-tertiary);">${data.total || 0} ${lang === 'ro' ? 'add-on-uri disponibile' : 'add-ons available'}</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;">
          ${addons.map(a => `
            <div style="padding:14px;border-radius:12px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);transition:all 0.2s;">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                <div style="width:40px;height:40px;border-radius:8px;background:linear-gradient(135deg,#6c5ce7,#a29bfe);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:white;">${a.name[0]}</div>
                <div style="flex:1;min-width:0;">
                  <div style="font-size:14px;font-weight:600;display:flex;align-items:center;gap:6px;">${a.name} ${a.is_official ? '<span style="font-size:9px;padding:1px 6px;border-radius:3px;background:rgba(0,184,148,0.15);color:var(--green);">✓</span>' : ''}</div>
                  <div style="font-size:11px;color:var(--text-tertiary);">${a.author} · ${a.downloads || 0} ${lang === 'ro' ? 'descărcări' : 'downloads'}</div>
                </div>
              </div>
              <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${a.description || ''}</div>
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                <span style="padding:1px 6px;border-radius:3px;font-size:9px;font-weight:600;text-transform:uppercase;background:rgba(108,92,231,0.1);color:var(--accent-secondary);">${a.type}</span>
                ${a.rating > 0 ? `<span style="font-size:11px;color:var(--yellow);">★ ${a.rating}</span>` : ''}
                <button class="btn btn-primary" data-action="install" data-id="${a.id}" style="margin-left:auto;padding:4px 12px;font-size:11px;">
                  <i class="fas fa-download"></i> ${lang === 'ro' ? 'Instalează' : 'Install'}
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
            btn.textContent = '✓ ' + (lang === 'ro' ? 'Instalat' : 'Installed');
            btn.disabled = true;
          });
        });
      } catch { el.innerHTML = `<div class="industry-error"><i class="fas fa-exclamation-triangle"></i></div>`; }
    },

    loadConfigure() {
      const el = document.getElementById('addonContent');
      if (!el) return;
      const lang = window.appLang || 'ro';
      el.innerHTML = `<div class="industry-empty"><i class="fas fa-cog"></i><h4>${lang === 'ro' ? 'Configurare Add-on' : 'Add-on Configuration'}</h4><p>${lang === 'ro' ? 'Configurează add-on-urile instalate din secțiunea Instalate.' : 'Configure your installed add-ons from the Installed section.'}</p></div>`;
    }
  };
})();
