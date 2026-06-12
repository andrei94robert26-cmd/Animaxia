/* ============================================
   Animaxia Discovery Module v1.0
   Brand Hubs (Disney+ style), Mood Browsing (HBO Max),
   Surprise Me, Release Calendar, Share
   Loads after app.js
   ============================================ */

(function() {
  'use strict';

  if (typeof App === 'undefined') { setTimeout(arguments.callee, 500); return; }

  const DM = {
    // ====== BRAND HUBS (Disney+ style) ======
    hubs: [
      { id: 'hub-animaxia', title: { ro: '✦ Universul Animaxia', en: '✦ Animaxia Universe' }, icon: '✦', color: '#6c5ce7', genres: ['Animatie','Aventura','Fantasy'] },
      { id: 'hub-actiune', title: { ro: '💥 Forța Acțiunii', en: '💥 Action Force' }, icon: '💥', color: '#e74c3c', genres: ['Actiune','Thriller','Crima'] },
      { id: 'hub-stiinta', title: { ro: '🔬 Lumea Științei', en: '🔬 Science World' }, icon: '🔬', color: '#00b894', genres: ['Documentar','Stiinta','Educational'] },
      { id: 'hub-familie', title: { ro: '👨‍👩‍👧‍👦 Seara în Familie', en: '👨‍👩‍👧‍👦 Family Night' }, icon: '👨‍👩‍👧‍👦', color: '#fdcb6e', genres: ['Familie','Animatie','Comedie'] },
      { id: 'hub-noapte', title: { ro: '🌙 Thriller Noaptea', en: '🌙 Thriller Night' }, icon: '🌙', color: '#2d3436', genres: ['Thriller','Mister','Crima'] },
    ],

    // ====== MOOD SECTIONS (HBO Max style) ======
    moods: [
      { id: 'mood-feelgood', title: { ro: '😊 Simte-te Bine', en: '😊 Feel Good' }, icon: '😊', items: [] },
      { id: 'mood-thriller', title: { ro: '😱 Adrenalina Pură', en: '😱 Pure Adrenaline' }, icon: '😱', items: [] },
      { id: 'mood-relax', title: { ro: '🧘 Relaxare Totală', en: '🧘 Total Relax' }, icon: '🧘', items: [] },
      { id: 'mood-learn', title: { ro: '📚 Învață Ceva Nou', en: '📚 Learn Something' }, icon: '📚', items: [] },
      { id: 'mood-romance', title: { ro: '💕 Seara Romantică', en: '💕 Romantic Evening' }, icon: '💕', items: [] },
    ],

    // ====== RELEASE CALENDAR ======
    calendar: [
      { date: '2025-06-15', title: { ro: 'Legendele Animaxiei - Sezonul 2', en: 'Legends of Animaxia - Season 2' }, type: 'series', genre: 'Animatie' },
      { date: '2025-06-20', title: { ro: 'Imperiul Stelelor - Continuarea', en: 'Empire of Stars - The Sequel' }, type: 'movie', genre: 'SF' },
      { date: '2025-06-25', title: { ro: 'Documentar: Subacvatic', en: 'Documentary: Underwater' }, type: 'movie', genre: 'Documentar' },
      { date: '2025-07-01', title: { ro: 'Noul Sezon: Corupția S4', en: 'New Season: Corruption S4' }, type: 'series', genre: 'Drama' },
      { date: '2025-07-10', title: { ro: 'Animaxia Kids: Aventuri Noi', en: 'Animaxia Kids: New Adventures' }, type: 'series', genre: 'Kids' },
    ],

    init() {
      this.buildHubs();
      this.buildMoods();
      this.buildCalendar();
      this.addSurpriseMe();
      this.addShareButtons();
      this.addToNav();
    },

    // ====== BUILD BRAND HUBS ======
    buildHubs() {
      const container = document.getElementById('contentRows');
      if (!container) return;

      this.hubs.forEach(hub => {
        const items = this.getItemsByGenres(hub.genres);
        if (items.length === 0) return;

        const sec = document.createElement('section');
        sec.className = 'content-section hub-section';
        sec.dataset.hub = hub.id;
        sec.innerHTML = `
          <div class="hub-header" style="border-left: 4px solid ${hub.color}; padding-left: 12px;">
            <div class="section-header">
              <h2 class="section-title hub-title">
                <span class="hub-icon" style="color:${hub.color}">${hub.icon}</span>
                <span data-lang="ro">${hub.title.ro}</span>
                <span data-lang="en" style="display:none;">${hub.title.en}</span>
              </h2>
              <a href="#" class="section-link hub-link" data-lang="ro">Explorează colecția →</a>
              <a href="#" class="section-link hub-link" data-lang="en" style="display:none;">Explore collection →</a>
            </div>
          </div>
          <div class="content-row">${items.map(item => window.App ? App.cardHTML(item) : '').join('')}</div>`;
        container.appendChild(sec);

        const row = sec.querySelector('.content-row');
        row.addEventListener('wheel', (e) => {
          if (Math.abs(e.deltaY) > 5) { e.preventDefault(); row.scrollLeft += e.deltaY > 0 ? 60 : -60; }
        }, { passive: false });

        row.querySelectorAll('.content-card').forEach(card => {
          card.addEventListener('click', () => App.openDetail(card.dataset.id));
          card.querySelector('.play-btn')?.addEventListener('click', (e) => { e.stopPropagation(); App.openPlayer(card.dataset.id); });
        });
      });
    },

    // ====== BUILD MOOD SECTIONS ======
    buildMoods() {
      const container = document.getElementById('contentRows');
      if (!container) return;

      const moodWrapper = document.createElement('section');
      moodWrapper.className = 'content-section mood-section';
      moodWrapper.innerHTML = `
        <div class="section-header">
          <h2 class="section-title">🎭 <span data-lang="ro">În funcție de dispoziție</span><span data-lang="en" style="display:none;">Browse by Mood</span></h2>
        </div>
        <div class="mood-grid" id="moodGrid"></div>`;
      container.appendChild(moodWrapper);

      const grid = document.getElementById('moodGrid');
      if (!grid) return;

      const allItems = this.getAllItems();
      this.moods.forEach(mood => {
        const moodItems = this.getMoodItems(mood.id, allItems);
        const gm = moodItems.slice(0, 4);
        grid.innerHTML += `
          <div class="mood-card" data-mood="${mood.id}" onclick="App.openPlayer('${gm[0]?.id || ''}')">
            <div class="mood-card-bg" style="background:${this.getMoodColor(mood.id)}">
              <span class="mood-icon">${mood.icon}</span>
              <span class="mood-label" data-lang="ro">${mood.title.ro}</span>
              <span class="mood-label" data-lang="en" style="display:none;">${mood.title.en}</span>
              <span class="mood-count">${moodItems.length} ${window.appLang === 'en' ? 'titles' : 'titluri'}</span>
            </div>
          </div>`;
      });
    },

    getMoodItems(moodId, items) {
      const moodGenreMap = {
        'mood-feelgood': ['Comedie','Familie','Animatie','Romanctic'],
        'mood-thriller': ['Thriller','Actiune','Crima','SF'],
        'mood-relax': ['Documentar','Natura','Muzical'],
        'mood-learn': ['Educational','Stiinta','Documentar','Istoric'],
        'mood-romance': ['Romanctic','Drama','Comedie'],
      };
      const genres = moodGenreMap[moodId] || [];
      return items.filter(i => i.genre && i.genre.some(g => genres.some(mg => g.toLowerCase().includes(mg.toLowerCase()))));
    },

    getMoodColor(moodId) {
      const colors = {
        'mood-feelgood': 'linear-gradient(135deg, #fdcb6e, #e17055)',
        'mood-thriller': 'linear-gradient(135deg, #2d3436, #636e72)',
        'mood-relax': 'linear-gradient(135deg, #00b894, #00cec9)',
        'mood-learn': 'linear-gradient(135deg, #0984e3, #6c5ce7)',
        'mood-romance': 'linear-gradient(135deg, #fd79a8, #e84393)',
      };
      return colors[moodId] || 'linear-gradient(135deg, #6c5ce7, #a29bfe)';
    },

    // ====== RELEASE CALENDAR ======
    buildCalendar() {
      const container = document.getElementById('contentRows');
      if (!container) return;

      const sec = document.createElement('section');
      sec.className = 'content-section calendar-section';
      sec.innerHTML = `
        <div class="section-header">
          <h2 class="section-title">📅 <span data-lang="ro">Lansări Viitoare</span><span data-lang="en" style="display:none;">Coming Soon</span></h2>
        </div>
        <div class="calendar-strip" id="calendarStrip"></div>`;
      container.appendChild(sec);

      const strip = document.getElementById('calendarStrip');
      if (!strip) return;

      const lang = window.appLang || 'ro';
      const now = new Date();
      const months = ['Ian','Feb','Mar','Apr','Mai','Iun','Iul','Aug','Sep','Oct','Nov','Dec'];
      if (lang === 'en') { months[0]='Jan'; months[1]='Feb'; months[2]='Mar'; months[3]='Apr'; months[4]='May'; months[5]='Jun'; months[6]='Jul'; months[7]='Aug'; months[8]='Sep'; months[9]='Oct'; months[10]='Nov'; months[11]='Dec'; }

      this.calendar.forEach((item, idx) => {
        const d = new Date(item.date);
        const daysUntil = Math.ceil((d - now) / (1000*60*60*24));
        const timeStr = daysUntil <= 0 ? (lang === 'en' ? 'Today' : 'Astăzi') :
                        daysUntil === 1 ? (lang === 'en' ? 'Tomorrow' : 'Mâine') :
                        `${daysUntil} ${lang === 'en' ? 'days' : 'zile'}`;

        strip.innerHTML += `
          <div class="calendar-card" style="animation-delay:${idx*0.1}s">
            <div class="calendar-date">
              <span class="calendar-day">${d.getDate()}</span>
              <span class="calendar-month">${months[d.getMonth()]}</span>
            </div>
            <div class="calendar-info">
              <div class="calendar-title">${item.title[lang] || item.title.ro}</div>
              <div class="calendar-meta">
                <span class="calendar-badge ${item.type}">${item.type === 'series' ? (lang === 'en' ? 'Series' : 'Serial') : (lang === 'en' ? 'Movie' : 'Film')}</span>
                <span class="calendar-genre">${item.genre}</span>
              </div>
              <div class="calendar-countdown">${timeStr}</div>
            </div>
          </div>`;
      });
    },

    // ====== SURPRISE ME ======
    addSurpriseMe() {
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary surprise-btn';
      btn.innerHTML = `<i class="fas fa-dice"></i> <span data-lang="ro">Surprinde-mă!</span><span data-lang="en" style="display:none;">Surprise Me!</span>`;
      btn.title = window.appLang === 'en' ? 'Pick a random title for you' : 'Alege un titlu aleator pentru tine';
      btn.addEventListener('click', () => this.surpriseMe());

      const heroActions = document.querySelector('.hero-actions');
      if (heroActions) heroActions.appendChild(btn);

      // Also add to genre bar area
      const genreBar = document.getElementById('genreBar');
      if (genreBar) {
        const surpriseSmall = document.createElement('button');
        surpriseSmall.className = 'genre-filter-item surprise-btn-sm';
        surpriseSmall.innerHTML = '🎲 ' + (window.appLang === 'en' ? 'Surprise' : 'Surpriză');
        surpriseSmall.addEventListener('click', () => this.surpriseMe());
        genreBar.appendChild(surpriseSmall);
      }
    },

    surpriseMe() {
      const items = this.getAllItems();
      if (items.length === 0) { App.toast(window.appLang === 'en' ? 'No content available' : 'Nu există conținut', 'error'); return; }
      const watched = userData?.continueWatching?.map(c => c.item_id) || [];
      const pool = items.filter(i => !watched.includes(i.id)) || items;
      const random = pool[Math.floor(Math.random() * pool.length)];

      // Fun animation
      App.toast(`🎲 ${window.appLang === 'en' ? 'Surprise! Today we watch' : 'Surpriză! Azi vizionăm'}: ${random.title}`, 'success');

      // Open detail modal with delay for surprise effect
      setTimeout(() => {
        if (window.App) {
          document.getElementById('heroPlayBtn')?.click();
        }
        App.openDetail(random.id);
      }, 1200);
    },

    // ====== SHARE BUTTONS ======
    addShareButtons() {
      // Add share button to detail modal
      const detailActions = document.getElementById('modalActions');
      if (detailActions) {
        const shareBtn = document.createElement('button');
        shareBtn.className = 'btn btn-secondary';
        shareBtn.innerHTML = `<i class="fas fa-share-alt"></i> <span data-lang="ro">Distribuie</span><span data-lang="en" style="display:none;">Share</span>`;
        shareBtn.addEventListener('click', () => this.shareContent(App.currentDetailId));
        detailActions.appendChild(shareBtn);
      }

      // Add share to player
      const playerHeader = document.querySelector('.player-header-right');
      if (playerHeader) {
        const shareBtn = document.createElement('button');
        shareBtn.className = 'player-btn';
        shareBtn.innerHTML = '<i class="fas fa-share-alt"></i>';
        shareBtn.title = window.appLang === 'en' ? 'Share' : 'Distribuie';
        shareBtn.addEventListener('click', () => {
          if (App.currentPlayerItemId) this.shareContent(App.currentPlayerItemId);
        });
        playerHeader.appendChild(shareBtn);
      }
    },

    shareContent(itemId) {
      const item = App.findItem(itemId);
      if (!item) return;

      const url = window.location.origin + '/?content=' + itemId;
      const text = `${window.appLang === 'en' ? 'Watch' : 'Vizionează'} "${item.title}" ${window.appLang === 'en' ? 'on Animaxia' : 'pe Animaxia'}!`;

      if (navigator.share) {
        navigator.share({ title: item.title, text, url }).catch(() => {});
      } else {
        // Fallback: copy to clipboard
        navigator.clipboard.writeText(`${text} ${url}`).then(() => {
          App.toast(window.appLang === 'en' ? 'Link copied to clipboard!' : 'Link copiat în clipboard!', 'success');
        }).catch(() => {
          // Show modal with share options
          this.showShareModal(item, url, text);
        });
      }
    },

    showShareModal(item, url, text) {
      const existing = document.getElementById('shareModal');
      if (existing) existing.remove();

      const modal = document.createElement('div');
      modal.id = 'shareModal';
      modal.className = 'admin-modal-overlay';
      modal.style.zIndex = '10001';
      modal.innerHTML = `
        <div class="admin-modal" style="max-width:360px;text-align:center;">
          <h3>📤 ${window.appLang === 'en' ? 'Share' : 'Distribuie'}</h3>
          <p style="margin:12px 0;color:var(--text-secondary);font-size:14px;">"${item.title}"</p>
          <div class="share-options" style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin:16px 0;">
            <button class="btn btn-secondary share-option" data-share="facebook" style="flex-direction:column;padding:12px;min-width:70px;"><i class="fab fa-facebook" style="font-size:24px;color:#1877F2;"></i><span style="font-size:11px;margin-top:4px;">Facebook</span></button>
            <button class="btn btn-secondary share-option" data-share="twitter" style="flex-direction:column;padding:12px;min-width:70px;"><i class="fab fa-twitter" style="font-size:24px;color:#1DA1F2;"></i><span style="font-size:11px;margin-top:4px;">Twitter</span></button>
            <button class="btn btn-secondary share-option" data-share="whatsapp" style="flex-direction:column;padding:12px;min-width:70px;"><i class="fab fa-whatsapp" style="font-size:24px;color:#25D366;"></i><span style="font-size:11px;margin-top:4px;">WhatsApp</span></button>
            <button class="btn btn-secondary share-option" data-share="copy" style="flex-direction:column;padding:12px;min-width:70px;"><i class="fas fa-link" style="font-size:24px;color:var(--accent-secondary);"></i><span style="font-size:11px;margin-top:4px;">Link</span></button>
          </div>
          <button class="btn btn-primary" onclick="this.closest('.admin-modal-overlay').remove()" style="width:100%;justify-content:center;">${window.appLang === 'en' ? 'Close' : 'Închide'}</button>
        </div>`;
      document.body.appendChild(modal);

      modal.querySelectorAll('.share-option').forEach(btn => {
        btn.addEventListener('click', () => {
          const type = btn.dataset.share;
          const urls = {
            facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
            twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
            whatsapp: `https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`,
            copy: null,
          };
          if (type === 'copy') {
            navigator.clipboard.writeText(url).then(() => {
              App.toast('Link copiat!', 'success');
              modal.remove();
            });
          } else if (urls[type]) {
            window.open(urls[type], '_blank', 'width=600,height=400');
          }
        });
      });
    },

    // ====== ADD TO NAVIGATION ======
    addToNav() {
      const navList = document.querySelector('.nav-list');
      if (navList) {
        const li = document.createElement('li');
        li.className = 'nav-item';
        li.innerHTML = `<a href="#" data-section="discovery"><i class="fas fa-compass"></i><span data-lang="ro">Descoperă</span><span data-lang="en" style="display:none;">Discover</span></a>`;
        navList.appendChild(li);
        li.addEventListener('click', () => {
          document.querySelector('[data-hub]')?.scrollIntoView({ behavior: 'smooth' });
        });
      }
    },

    // ====== HELPERS ======
    getItemsByGenres(genres) {
      const all = this.getAllItems();
      return all.filter(i => i.genre && i.genre.some(g => genres.some(gg => g.toLowerCase().includes(gg.toLowerCase()))));
    },

    getAllItems() {
      const items = [];
      // Try dynamic data first
      if (window.AnimaxiaData?.getAllItems) {
        return AnimaxiaData.getAllItems();
      }
      // Fallback to legacy cache
      const cache = window.__content || window.contentCache || null;
      if (cache?.categories) {
        for (const cat of cache.categories) {
          for (const item of (cat.items||[])) {
            if (item && !items.find(i => i.id === item.id)) items.push(item);
          }
        }
      }
      if (cache?.featured) {
        for (const item of cache.featured) {
          if (!items.find(i => i.id === item.id)) items.push(item);
        }
      }
      return items;
    }
  };

  // Init after App is ready
  function waitForApp() {
    if (window.App && window.App.els && window.App.els.contentRows) {
      setTimeout(() => DM.init(), 1500);
    } else {
      setTimeout(waitForApp, 500);
    }
  }
  waitForApp();

  // Expose for global use
  window.DiscoveryModule = DM;
})();
