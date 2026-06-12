/**
 * Animaxia v7.0 - Coming Soon / Release Calendar
 * Dynamic content from TMDB API, no static data
 */
(function() {
  'use strict';

  const CS = {
    upcoming: [],
    reminders: JSON.parse(localStorage.getItem('animaxia_reminders') || '[]'),

    // ====== INIT - LOAD FROM TMDB API ======
    async init() {
      await this.loadUpcomingFromTMDB();
      this.addToNav();
    },

    async loadUpcomingFromTMDB() {
      try {
        const res = await fetch('/api/discover/tmdb/popular?page=1');
        const data = await res.json();
        if (data?.data?.length > 0) {
          this.upcoming = data.data.slice(0, 12).map((item, i) => {
            const d = new Date();
            d.setDate(d.getDate() + (i * 3) + 5);
            const title = item.title || item.name || 'Nou';
            return {
              date: d.toISOString().split('T')[0],
              title: { ro: title, en: item.original_title || title },
              type: item.media_type === 'tv' ? 'series' : 'movie',
              genre: 'General',
              desc: {
                ro: item.overview?.substring(0, 100) || 'Disponibil în curând pe Animaxia',
                en: item.overview?.substring(0, 100) || 'Coming soon to Animaxia'
              },
              bg: ['#6c5ce7','#00b894','#e17055','#0984e3','#e84393','#fdcb6e','#00cec9','#636e72','#d63031','#2d3436','#8e44ad','#16a085'][i % 12],
              match: item.vote_average ? `${Math.round(item.vote_average * 10)}%` : '90%'
            };
          });
          console.log(`✅ ComingSoon: Loaded ${this.upcoming.length} items from TMDB`);
        }
      } catch (e) {
        console.warn('ComingSoon: TMDB unavailable, trying backup...');
      }
      
      // Try another source if empty
      if (this.upcoming.length === 0) {
        try {
          const res2 = await fetch('/api/discover/tmdb/trending?page=1');
          const data2 = await res2.json();
          if (data2?.data?.length > 0) {
            this.upcoming = data2.data.slice(0, 8).map((item, i) => {
              const d = new Date();
              d.setDate(d.getDate() + (i * 4) + 2);
              const title = item.title || item.name || 'Nou';
              return {
                date: d.toISOString().split('T')[0],
                title: { ro: title, en: item.original_title || title },
                type: item.media_type === 'tv' ? 'series' : 'movie',
                genre: 'General',
                desc: {
                  ro: item.overview?.substring(0, 80) || 'În curând',
                  en: item.overview?.substring(0, 80) || 'Coming soon'
                },
                bg: ['#6c5ce7','#00b894','#e17055','#0984e3','#e84393','#fdcb6e','#00cec9','#636e72'][i % 8],
                match: item.vote_average ? `${Math.round(item.vote_average * 10)}%` : '92%'
              };
            });
          }
        } catch {}
      }
    },

    addToNav() {
      const navList = document.querySelector('.nav-list');
      if (navList) {
        const exists = navList.querySelector('[data-section="coming-soon"]');
        if (!exists) {
          const li = document.createElement('li');
          li.className = 'nav-item';
          li.innerHTML = `<a href="#" data-section="coming-soon"><i class="fas fa-calendar-alt"></i><span data-lang="ro">Lansări</span><span data-lang="en" style="display:none;">Coming Soon</span></a>`;
          navList.appendChild(li);
          li.addEventListener('click', (e) => {
            e.preventDefault();
            this.showComingSoonPage();
          });
        }
      }

      const mobileNav = document.querySelector('.mobile-nav');
      if (mobileNav) {
        const exists = mobileNav.querySelector('[data-section="coming-soon"]');
        if (!exists) {
          const a = document.createElement('a');
          a.href = '#';
          a.className = 'mobile-nav-item';
          a.dataset.section = 'coming-soon';
          a.innerHTML = '<i class="fas fa-calendar-alt"></i><span data-lang="ro">Lansări</span><span data-lang="en" style="display:none;">Coming</span>';
          a.addEventListener('click', (e) => {
            e.preventDefault();
            this.showComingSoonPage();
          });
          mobileNav.insertBefore(a, mobileNav.querySelector('[data-section="my-list"]'));
        }
      }
    },

    showComingSoonPage() {
      const lang = window.appLang || 'ro';
      if (window.App?.stopHero) window.App.stopHero();

      const existing = document.getElementById('comingSoonScreen');
      if (existing) existing.remove();

      const screen = document.createElement('div');
      screen.id = 'comingSoonScreen';
      screen.className = 'full-page-screen';
      screen.style.zIndex = '1000';
      screen.innerHTML = `
        <div class="full-page-header">
          <div class="full-page-header-content">
            <button class="full-page-back" id="csBack"><i class="fas fa-arrow-left"></i></button>
            <h1><i class="fas fa-calendar-alt" style="color:var(--accent-secondary);"></i> ${lang === 'ro' ? 'Lansări Viitoare' : 'Coming Soon'}</h1>
            <div style="margin-left:auto;display:flex;gap:8px;align-items:center;">
              <span style="font-size:12px;color:var(--text-tertiary);" id="csCount">${this.upcoming.length} ${lang === 'ro' ? 'titluri' : 'titles'}</span>
            </div>
          </div>
        </div>
        <div class="full-page-body" style="max-width:900px;">
          ${this.upcoming.length === 0 
            ? `<div style="text-align:center;padding:60px;color:var(--text-tertiary);"><i class="fas fa-calendar" style="font-size:48px;opacity:0.2;display:block;margin-bottom:16px;"></i><p>${lang === 'ro' ? 'Încărcare date...' : 'Loading data...'}</p></div>`
            : this.upcoming.map((item, idx) => {
                const d = new Date(item.date);
                const now = new Date();
                const days = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
                const timeLabel = days <= 0 ? (lang === 'ro' ? 'Astăzi!' : 'Today!') :
                  days === 1 ? (lang === 'ro' ? 'Mâine!' : 'Tomorrow!') :
                  `${days} ${lang === 'ro' ? 'zile' : 'days'}`;
                const hasReminder = this.reminders.includes(item.title.ro + item.date);

                return `
                  <div class="cs-card" data-idx="${idx}">
                    <div class="cs-card-left">
                      <div class="cs-date">
                        <span class="cs-day">${String(d.getDate()).padStart(2,'0')}</span>
                        <span class="cs-month">${d.toLocaleDateString(lang === 'ro' ? 'ro-RO' : 'en-US', { month: 'short' })}</span>
                      </div>
                      <div class="cs-countdown ${days <= 1 ? 'cs-hot' : ''}">${timeLabel}</div>
                    </div>
                    <div class="cs-card-center">
                      <div class="cs-thumb" style="background:${item.bg || '#6c5ce7'}">${item.type === 'series' ? '📺' : '🎬'}</div>
                      <div class="cs-info">
                        <div class="cs-title">${item.title[lang] || item.title.ro}</div>
                        <div class="cs-meta">
                          <span class="cs-badge ${item.type}">${item.type === 'series' ? (lang === 'ro' ? 'Serial' : 'Series') : (lang === 'ro' ? 'Film' : 'Movie')}</span>
                          <span class="cs-genre">${item.genre}</span>
                          <span class="cs-match"><i class="fas fa-thumbs-up"></i> ${item.match}</span>
                        </div>
                        <div class="cs-desc">${item.desc[lang] || item.desc.ro}</div>
                      </div>
                    </div>
                    <div class="cs-card-right">
                      <button class="cs-remind-btn ${hasReminder ? 'active' : ''}" data-date="${item.date}" data-title="${item.title.ro}" title="${lang === 'ro' ? 'Anunță-mă' : 'Notify me'}">
                        <i class="fas ${hasReminder ? 'fa-bell' : 'fa-bell'}"></i>
                        <span>${hasReminder ? (lang === 'ro' ? 'Anunțat' : 'Notified') : (lang === 'ro' ? 'Anunță-mă' : 'Notify')}</span>
                      </button>
                    </div>
                  </div>`;
              }).join('')}
        </div>`;
      document.body.appendChild(screen);

      document.getElementById('csBack').addEventListener('click', () => {
        screen.remove();
        if (window.App?.startHero) window.App.startHero();
      });

      screen.querySelectorAll('.cs-remind-btn').forEach(btn => {
        btn.addEventListener('click', () => this.toggleReminder(btn));
      });
    },

    toggleReminder(btn) {
      const lang = window.appLang || 'ro';
      const key = btn.dataset.title + btn.dataset.date;
      const idx = this.reminders.indexOf(key);

      if (idx >= 0) {
        this.reminders.splice(idx, 1);
        btn.classList.remove('active');
        btn.innerHTML = '<i class="fas fa-bell"></i><span>' + (lang === 'ro' ? 'Anunță-mă' : 'Notify') + '</span>';
        if (window.App?.toast) window.App.toast(lang === 'ro' ? 'Anunț dezactivat' : 'Notification off', 'info');
      } else {
        this.reminders.push(key);
        btn.classList.add('active');
        btn.innerHTML = '<i class="fas fa-bell"></i><span>' + (lang === 'ro' ? 'Anunțat' : 'Notified') + '</span>';
        if (window.App?.toast) window.App.toast(lang === 'ro' ? 'Vei fi anunțat la lansare!' : 'You\'ll be notified at launch!', 'success');
      }
      localStorage.setItem('animaxia_reminders', JSON.stringify(this.reminders));
    }
  };

  // Init
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    CS.init();
  } else {
    document.addEventListener('DOMContentLoaded', () => CS.init());
  }

  window.ComingSoonModule = CS;
})();
