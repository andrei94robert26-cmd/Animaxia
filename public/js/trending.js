/**
 * Animaxia v5.3 - Trending Page
 * Dedicated trending page with filters, top content by views, trending searches
 * Netflix-style "Trending Now" section
 */
(function() {
  'use strict';

  const TR = {
    init() {
      this.addTrendingLink();
    },

    addTrendingLink() {
      const nav = document.querySelector('.nav-list');
      const existing = nav?.querySelector('[data-section="trending-page"]');
      if (existing || !nav) return;

      // The "Tendințe" link already exists in nav but routes to home. Let's make it better.
      const trendLink = nav.querySelector('[data-section="trending"]');
      if (trendLink) {
        trendLink.parentElement.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.showTrendingPage();
        });
      }

      // Also add mobile
      const mobileTrend = document.querySelector('.mobile-nav [data-section="trending"]');
      if (mobileTrend) {
        mobileTrend.addEventListener('click', (e) => {
          e.preventDefault();
          this.showTrendingPage();
        });
      }
    },

    async showTrendingPage() {
      const lang = window.appLang || 'ro';
      if (window.App?.stopHero) window.App.stopHero();

      const existing = document.getElementById('trendingScreen');
      if (existing) existing.remove();

      const screen = document.createElement('div');
      screen.id = 'trendingScreen';
      screen.className = 'full-page-screen';
      screen.style.zIndex = '1000';
      screen.innerHTML = `
        <div class="full-page-header">
          <div class="full-page-header-content">
            <button class="full-page-back" id="trBack"><i class="fas fa-arrow-left"></i></button>
            <h1><i class="fas fa-fire" style="color:var(--orange);"></i> ${lang === 'ro' ? 'Tendințe' : 'Trending'}</h1>
            <div style="margin-left:auto;">
              <select id="trPeriod" style="width:auto;min-width:100px;padding:6px 10px;font-size:12px;">
                <option value="today">${lang === 'ro' ? 'Astăzi' : 'Today'}</option>
                <option value="week" selected>${lang === 'ro' ? 'Săptămâna' : 'This Week'}</option>
                <option value="month">${lang === 'ro' ? 'Luna' : 'This Month'}</option>
              </select>
            </div>
          </div>
        </div>
        <div class="full-page-body" style="max-width:1000px;">
          <div style="display:grid;grid-template-columns:1fr 300px;gap:24px;">
            <div>
              <h3 style="font-size:16px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:8px;">
                <i class="fas fa-chart-line" style="color:var(--orange);"></i> ${lang === 'ro' ? 'Top Conținut' : 'Top Content'}
              </h3>
              <div id="trTopContent" style="display:flex;flex-direction:column;gap:8px;">
                <div style="text-align:center;padding:40px;color:var(--text-tertiary);"><i class="fas fa-spinner fa-spin" style="font-size:20px;"></i></div>
              </div>
            </div>
            <div>
              <h3 style="font-size:16px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:8px;">
                <i class="fas fa-search" style="color:var(--accent-secondary);"></i> ${lang === 'ro' ? 'Căutări Trending' : 'Trending Searches'}
              </h3>
              <div id="trSearches" style="padding:16px;background:rgba(255,255,255,0.02);border-radius:12px;border:1px solid rgba(255,255,255,0.06);">
                <div style="text-align:center;padding:20px;color:var(--text-tertiary);font-size:13px;"><i class="fas fa-spinner fa-spin"></i></div>
              </div>
            </div>
          </div>
        </div>`;
      document.body.appendChild(screen);

      document.getElementById('trBack').addEventListener('click', () => {
        screen.remove();
        if (window.App?.startHero) window.App.startHero();
      });

      document.getElementById('trPeriod').addEventListener('change', () => this.loadTrending());
      this.loadTrending();
    },

    async loadTrending() {
      const lang = window.appLang || 'ro';
      const topContent = document.getElementById('trTopContent');
      const trSearches = document.getElementById('trSearches');

      // Load most-viewed content (from dynamic data or cache)
      const items = [];
      // Use dynamic data first
      if (window.AnimaxiaData?.getAllItems) {
        items.push(...AnimaxiaData.getAllItems());
      } else {
        const content = window.__content;
        if (content?.categories) {
          for (const cat of content.categories) {
            for (const item of (cat.items || [])) {
              if (item) items.push(item);
            }
          }
        }
        if (content?.featured) items.push(...content.featured);
      }

      // Sort by match_rating/view_count for "trending"
      const trending = items.sort((a, b) => {
        const aMatch = parseInt(a.match_rating) || 0;
        const bMatch = parseInt(b.match_rating) || 0;
        return bMatch - aMatch;
      }).slice(0, 10);

      if (topContent) {
        topContent.innerHTML = trending.length === 0
          ? `<div style="text-align:center;padding:40px;color:var(--text-tertiary);">${lang === 'ro' ? 'Nu există date' : 'No data available'}</div>`
          : trending.map((item, i) => `
            <div class="tr-item" data-id="${item.id}" onclick="App.openDetail('${item.id}')">
              <div class="tr-rank" style="color:${i < 3 ? 'var(--orange)' : 'var(--text-tertiary)'};">#${i + 1}</div>
              <div class="tr-thumb" style="background:${item.bg_color || '#1e1e2e'};flex-shrink:0;">🎬</div>
              <div class="tr-info" style="flex:1;min-width:0;">
                <div class="tr-title">${item.title}</div>
                <div class="tr-meta" style="font-size:12px;color:var(--text-tertiary);">
                  ${(item.genre || []).slice(0, 2).join(' • ')} • ${item.match_rating || ''}
                </div>
              </div>
              <div class="tr-match" style="font-size:13px;font-weight:700;color:var(--green);">${item.match_rating || 'N/A'}</div>
            </div>`).join('');
      }

      // Load trending searches
      try {
        const res = await fetch('/api/search/trending');
        const data = await res.json();
        if (trSearches) {
          if (data.success && data.data.length > 0) {
            trSearches.innerHTML = `
              <div style="display:flex;flex-direction:column;gap:8px;">
                ${data.data.map((s, i) => `
                  <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;background:rgba(255,255,255,0.02);cursor:pointer;" onclick="App.openSearch?.(); setTimeout(()=>{const inp=document.getElementById('searchOverlayInput');if(inp){inp.value='${s.query}';App.search('${s.query}');}},300);">
                    <span style="font-size:12px;color:var(--text-tertiary);min-width:20px;">${i + 1}.</span>
                    <span style="flex:1;font-size:13px;">${s.query}</span>
                    <span style="font-size:11px;color:var(--text-tertiary);"><i class="fas fa-search"></i> ${s.search_count}</span>
                  </div>
                `).join('')}
              </div>`;
          } else {
            trSearches.innerHTML = `<p style="text-align:center;padding:20px;color:var(--text-tertiary);font-size:13px;">${lang === 'ro' ? 'Nu există căutări trending' : 'No trending searches'}</p>`;
          }
        }
      } catch {
        if (trSearches) trSearches.innerHTML = `<p style="text-align:center;padding:20px;color:var(--text-tertiary);font-size:13px;">Error loading</p>`;
      }
    }
  };

  if (document.readyState !== 'loading') {
    TR.init();
  } else {
    document.addEventListener('DOMContentLoaded', () => TR.init());
  }

  window.TrendingModule = TR;
})();
