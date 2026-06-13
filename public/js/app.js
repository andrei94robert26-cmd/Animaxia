/* ============================================
   Animaxia v5.0 - Full Platform App
   Reviews, Watch History, Downloads, 
   Admin Dashboard, Recommendations
   ============================================ */

(function() {
  'use strict';

  const API = '/api';
  let authToken = localStorage.getItem('animaxia_token');
  let currentProfile = null;
  let userData = null;
  let currentUser = null;
  let heroIndex = 0;
  let heroTimer = null;
  let genreBound = false;
  let currentHeroItem = null;
  let contentCache = AnimaxiaData?._cache || null;
  let appLang = localStorage.getItem('animaxia_lang') || 'ro';
  let reviewRating = 0;
  let whPage = 1;

  // Queue to ensure AnimaxiaData is loaded
  let animaxiaDataReady = false;
  async function ensureAnimaxiaData() {
    if (!window.AnimaxiaData?._cache) {
      try { await AnimaxiaData.init(); } catch {}
    }
    animaxiaDataReady = true;
  }

  // Player state
  let playerState = {
    playing: false, volume: 80, speed: 1, 
    currentTime: 0, duration: 100, 
    currentEpisode: null, currentSeason: 1,
    episodesData: null, seasonsData: [],
    isFullscreen: false, subtitlesOn: false,
    quality: 'auto', pipActive: false,
    xrayOpen: false, xrayData: null,
    previewTimer: null, previewCard: null
  };

  // Offline DB reference
  let offlineDB = null;

  // ====== INDEXEDDB OFFLINE STORAGE ======
  function openOfflineDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('AnimaxiaOffline', 1);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('downloaded_videos')) {
          db.createObjectStore('downloaded_videos', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('downloaded_metadata')) {
          db.createObjectStore('downloaded_metadata', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('content_cache')) {
          db.createObjectStore('content_cache', { keyPath: 'id' });
        }
      };
      request.onsuccess = () => {
        offlineDB = request.result;
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async function storeOfflineContent(itemId, metadata) {
    try {
      const db = await openOfflineDB();
      const tx = db.transaction('downloaded_metadata', 'readwrite');
      tx.objectStore('downloaded_metadata').put({
        id: itemId,
        ...metadata,
        downloadedAt: new Date().toISOString(),
        synced: false
      });
      return true;
    } catch (e) {
      console.log('Offline storage error:', e);
      return false;
    }
  }

  async function getOfflineItems() {
    try {
      const db = await openOfflineDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('downloaded_metadata', 'readonly');
        const all = tx.objectStore('downloaded_metadata').getAll();
        all.onsuccess = () => resolve(all.result || []);
        all.onerror = () => resolve([]);
      });
    } catch { return []; }
  }

  async function removeOfflineItem(itemId) {
    try {
      const db = await openOfflineDB();
      const tx = db.transaction('downloaded_metadata', 'readwrite');
      tx.objectStore('downloaded_metadata').delete(itemId);
      return true;
    } catch { return false; }
  }// ====== PUSH NOTIFICATIONS ======
  async function subscribeToPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      if (window.__DEBUG) console.log('Push notifications not supported');
      return;
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      
      // Always use toJSON() which returns the correct format regardless
      if (!subscription) {
        const vapidPublicKey = window.__VAPID_PUBLIC_KEY || '';
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidPublicKey
        });
      }

      await fetch(`${API}/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({
          subscription: subscription.toJSON()
        })
      });
      console.log('✅ Push notifications subscribed');
    } catch (e) {
      if (window.__DEBUG) console.log('Push subscription failed:', e.message);
    }
  }

  // ====== ACCESSIBILITY ======
  function initAccessibility() {
    // Focus trap for modals
    document.querySelectorAll('.modal, .player-modal, .admin-modal-overlay').forEach(modal => {
      modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          const activeModal = document.querySelector('.modal.active, .player-modal.active');
          if (activeModal) {
            if (activeModal.classList.contains('player-modal')) {
              window.App?.closePlayer();
            } else if (activeModal.classList.contains('modal')) {
              window.App?.closeDetail();
            }
          }
          // Close admin modals
          const adminModal = document.querySelector('.admin-modal-overlay[style*="display: flex"]');
          if (adminModal) adminModal.style.display = 'none';
        }
      });
    });

    // Add ARIA labels dynamically
    document.querySelectorAll('.btn, button').forEach(btn => {
      if (!btn.getAttribute('aria-label') && btn.textContent.trim()) {
        btn.setAttribute('aria-label', btn.textContent.trim());
      }
    });

    // Keyboard navigation for content rows
    document.querySelectorAll('.content-row').forEach(row => {
      row.setAttribute('role', 'list');
      row.querySelectorAll('.content-card').forEach(card => {
        card.setAttribute('role', 'listitem');
        card.setAttribute('tabindex', '0');
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            card.click();
          }
        });
      });
    });

    // Skip to main content link
    const skipLink = document.createElement('a');
    skipLink.href = '#mainContent';
    skipLink.textContent = 'Sari la conținut';
    skipLink.style.cssText = 'position:fixed;top:-100%;left:0;z-index:99999;padding:8px 16px;background:var(--accent-primary);color:white;text-decoration:none;border-radius:0 0 4px 0;font-size:14px;transition:top 0.2s;';
    skipLink.addEventListener('focus', () => { skipLink.style.top = '0'; });
    skipLink.addEventListener('blur', () => { skipLink.style.top = '-100%'; });
    document.body.insertBefore(skipLink, document.body.firstChild);
  }

  const App = {
    els: {},

    // ====== INIT (wrapped in try/catch for robustness) ======
    init() {
      try {
        this.cache();
        this.bind();
        this.handleResetToken();
        this.applyLanguage(appLang, false);
        this.fetchConfig();
      } catch (e) {
        console.warn('App init (phase 1) warning:', e);
      }

      // Initialize offline database
      openOfflineDB().catch(() => {});
      
      // Initialize accessibility
      setTimeout(() => initAccessibility(), 1000);

      // Hide loading screen after 1.5s (failsafe ensures it within 5s)
      const loadingScreen = document.getElementById('loading-screen');
      const showInitial = () => {
        if (loadingScreen) loadingScreen.style.display = 'none';
        // Clean up loading animation resources
        try {
          if (authToken) {
            this.restoreSession();
          } else {
            this.showScreen('login');
          }
        } catch (e) {
          console.warn('App init (phase 2) warning:', e);
          this.showScreen('login');
        }
      };
      
      try {
        this.initNewFeatures();
      } catch (e) {
        console.warn('App init (initNewFeatures) warning:', e);
      }
      
      if (loadingScreen) {
        setTimeout(showInitial, 1500); // Redus de la 2500ms la 1500ms
      } else {
        showInitial();
      }
    },

    // ====== LANGUAGE ======
    applyLanguage(lang, save = true) {
      appLang = lang;
      window.appLang = lang;
      if (save) localStorage.setItem('animaxia_lang', lang);
      
      document.querySelectorAll('[data-lang]').forEach(el => {
        if (el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
        const visible = el.dataset.lang === lang;
        el.style.display = visible ? '' : 'none';
      });
      
      document.querySelectorAll('select option[data-lang]').forEach(opt => {
        opt.hidden = opt.dataset.lang !== lang;
        opt.disabled = opt.dataset.lang !== lang;
      });

      const langBtn = document.getElementById('headerLangBtn');
      if (langBtn) langBtn.textContent = lang === 'ro' ? '🇷🇴' : '🇬🇧';

      document.querySelectorAll('.lang-flag').forEach(f => {
        f.style.opacity = f.dataset.lang === lang ? '1' : '0.3';
      });

      const loginLangSwitch = document.getElementById('loginLangSwitch');
      if (loginLangSwitch) loginLangSwitch.textContent = lang === 'ro' ? 'EN' : 'RO';
    },

    toggleLanguage() {
      this.applyLanguage(appLang === 'ro' ? 'en' : 'ro');
      this.toast(appLang === 'ro' ? '🌐 Limba: Română' : '🌐 Language: English', 'info');
    },

    // ====== SCREENS ======
    showScreen(screen) {
      this.closeAll();
      const map = { 
        'login': 'login-screen', 'register': 'register-screen', 
        'forgot': 'forgot-screen', 'reset': 'reset-screen',
        'settings': 'settings-screen', 'profiles': 'profile-screen', 
        'app': 'app', 'kids-pin': 'kids-pin-screen',
        'my-list': 'my-list-screen', 'notifications': 'notifications-screen',
        'search-page': 'search-page-screen',
        'watch-history': 'watch-history-screen',
        'downloads': 'downloads-screen',
        'admin': 'admin-screen',
        'billing': 'billing-screen'
      };
      const display = { 
        'login-screen': 'flex', 'register-screen': 'flex', 
        'forgot-screen': 'flex', 'reset-screen': 'flex',
        'settings-screen': 'flex', 'profile-screen': 'flex', 
        'app': 'block', 'kids-pin-screen': 'flex',
        'my-list-screen': 'block', 'notifications-screen': 'block',
        'search-page-screen': 'block',
        'watch-history-screen': 'block', 'downloads-screen': 'block',
        'admin-screen': 'block',
        'billing-screen': 'block'
      };
      
      Object.values(map).forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.display = id === map[screen] ? (display[id] || 'block') : 'none';
      });

      if (screen === 'settings') this.loadSettings();
    },

    // ====== ROUTE NAVIGATION ======
    navTo(screen) {
      // Coming soon sections
      const comingSoon = [];
      if (comingSoon.indexOf(screen) !== -1) {
        this.toast(appLang === 'ro' ? '🔜 Secțiune în dezvoltare' : '🔜 Section coming soon', 'info');
        return;
      }

      if (screen === 'upload') {
        if (window.Upload) {
          Upload.showPage();
        } else {
          this.toast(appLang === 'ro' ? 'Se încarcă modulul Upload...' : 'Loading Upload module...', 'info');
          let retries = 0;
          const retryInterval = setInterval(() => {
            retries++;
            if (window.Upload) { clearInterval(retryInterval); Upload.showPage(); }
            else if (retries >= 15) { clearInterval(retryInterval); this.toast(appLang === 'ro' ? 'Eroare' : 'Error', 'error'); }
          }, 200);
        }
      } else if (screen === 'industry') {
        if (window.Industry) {
          Industry.showPage();
        } else {
          this.toast(appLang === 'ro' ? 'Se încarcă Industry...' : 'Loading Industry...', 'info');
          let retries = 0;
          const retryInterval = setInterval(() => {
            retries++;
            if (window.Industry) { clearInterval(retryInterval); Industry.showPage(); }
            else if (retries >= 15) { clearInterval(retryInterval); this.toast(appLang === 'ro' ? 'Eroare' : 'Error', 'error'); }
          }, 200);
        }
      } else if (screen === 'franchises') {
        if (window.Franchises) {
          Franchises.showPage();
        } else {
          this.toast(appLang === 'ro' ? 'Se încarcă Francize...' : 'Loading Franchises...', 'info');
          let retries = 0;
          const retryInterval = setInterval(() => {
            retries++;
            if (window.Franchises) { clearInterval(retryInterval); Franchises.showPage(); }
            else if (retries >= 15) { clearInterval(retryInterval); this.toast(appLang === 'ro' ? 'Eroare' : 'Error', 'error'); }
          }, 200);
        }
      } else if (screen === 'discover') {
        if (window.Discover) {
          Discover.showPage();
        } else {
          this.toast(appLang === 'ro' ? 'Se încarcă Discover...' : 'Loading Discover...', 'info');
          let retries = 0;
          const retryInterval = setInterval(() => {
            retries++;
            if (window.Discover) { clearInterval(retryInterval); Discover.showPage(); }
            else if (retries >= 15) { clearInterval(retryInterval); this.toast(appLang === 'ro' ? 'Eroare' : 'Error', 'error'); }
          }, 200);
        }
      } else if (screen === 'addon') {
        if (window.Addon) {
          Addon.showPage();
        } else {
          this.toast(appLang === 'ro' ? 'Se încarcă Add-on...' : 'Loading Add-on...', 'info');
          let retries = 0;
          const retryInterval = setInterval(() => {
            retries++;
            if (window.Addon) { clearInterval(retryInterval); Addon.showPage(); }
            else if (retries >= 15) { clearInterval(retryInterval); this.toast(appLang === 'ro' ? 'Eroare' : 'Error', 'error'); }
          }, 200);
        }
      } else if (screen === 'addon-marketplace') {
        if (window.AddonMarketplace) {
          AddonMarketplace.showPage();
        } else {
          this.toast(appLang === 'ro' ? 'Se încarcă Marketplace...' : 'Loading Marketplace...', 'info');
          let retries = 0;
          const retryInterval = setInterval(() => {
            retries++;
            if (window.AddonMarketplace) { clearInterval(retryInterval); AddonMarketplace.showPage(); }
            else if (retries >= 15) { clearInterval(retryInterval); this.toast(appLang === 'ro' ? 'Eroare' : 'Error', 'error'); }
          }, 200);
        }
      } else if (screen === 'continent') {
        if (window.Continent) {
          Continent.showPage();
        } else {
          this.toast(appLang === 'ro' ? 'Se încarcă Continent...' : 'Loading Continent...', 'info');
          let retries = 0;
          const retryInterval = setInterval(() => {
            retries++;
            if (window.Continent) { clearInterval(retryInterval); Continent.showPage(); }
            else if (retries >= 15) { clearInterval(retryInterval); this.toast(appLang === 'ro' ? 'Eroare' : 'Error', 'error'); }
          }, 200);
        }
      } else if (screen === 'content') {
        if (window.Content) {
          Content.showPage();
        } else {
          this.toast(appLang === 'ro' ? 'Se încarcă Biblioteca de Conținut...' : 'Loading Content Library...', 'info');
          let retries = 0;
          const retryInterval = setInterval(() => {
            retries++;
            if (window.Content) { clearInterval(retryInterval); Content.showPage(); }
            else if (retries >= 15) { clearInterval(retryInterval); this.toast(appLang === 'ro' ? 'Eroare' : 'Error', 'error'); }
          }, 200);
        }
      } else if (screen === 'my-list') {
        this.renderMyList();
        this.showScreen('my-list');
      } else if (screen === 'notifications') {
        this.renderNotifications();
        this.showScreen('notifications');
      } else if (screen === 'search-page') {
        this.showScreen('search-page');
        document.getElementById('searchPageInput')?.focus();
      } else if (screen === 'watch-history') {
        whPage = 1;
        this.renderWatchHistory();
        this.showScreen('watch-history');
      } else if (screen === 'downloads') {
        this.renderDownloads();
        this.showScreen('downloads');
      } else if (screen === 'admin') {
        this.adminRefresh();
        this.showScreen('admin');
      } else if (screen === 'billing') {
        this.showBilling();
        this.showScreen('billing');
      } else if (screen === 'settings') {
        this.showScreen('settings');
      } else {
        this.showScreen('app');
        this.nav(screen);
      }
    },

    // Fetch VAPID public key and Google Client ID from server config
    async fetchConfig() {
      try {
        const res = await fetch('/api/config');
        const data = await res.json();
        if (data.vapidPublicKey) {
          window.__VAPID_PUBLIC_KEY = data.vapidPublicKey;
        }
        if (data.googleClientId) {
          window.__GOOGLE_CLIENT_ID = data.googleClientId;
        }
      } catch (e) {
        // Config fetch is non-critical, continue with fallback values
        console.log('ℹ️ Could not fetch config, using fallback values');
      }
    },

    // ====== AUTH ======
    async login(e) {
      e.preventDefault();
      const email = document.getElementById('loginEmail')?.value;
      const password = document.getElementById('loginPassword')?.value;
      if (!email || !password) return;
      try {
        const res = await fetch(`${API}/auth/login`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!data.success) {
          if (this.els.authError) this.els.authError.textContent = data.error || 'Login failed';
          return;
        }
        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem('animaxia_token', authToken);
        if (data.user?.preferred_language) {
          this.applyLanguage(data.user.preferred_language);
        }
        this.showScreen('profiles');
        this.renderProfiles(data.profiles || []);
        if (data.user && !data.user.email_verified) {
          setTimeout(() => this.showVerifyBanner(), 2000);
        }
      } catch (e) {
        if (this.els.authError) this.els.authError.textContent = 'Connection error. Please try again.';
      }
    },

    async register(e) {
      e.preventDefault();
      const name = document.getElementById('regName')?.value;
      const email = document.getElementById('regEmail')?.value;
      const password = document.getElementById('regPassword')?.value;
      const confirm = document.getElementById('regConfirm')?.value;
      if (!name || !email || !password || !confirm) return;
      if (password !== confirm) {
        if (this.els.registerError) this.els.registerError.textContent = appLang === 'ro' ? 'Parolele nu coincid' : 'Passwords do not match';
        return;
      }
      if (password.length < 6) {
        if (this.els.registerError) this.els.registerError.textContent = appLang === 'ro' ? 'Parola trebuie să aibă minim 6 caractere' : 'Password must be at least 6 characters';
        return;
      }
      try {
        const res = await fetch(`${API}/auth/register`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password })
        });
        const data = await res.json();
        if (!data.success) {
          if (this.els.registerError) this.els.registerError.textContent = data.error || 'Registration failed';
          return;
        }
        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem('animaxia_token', authToken);
        this.showScreen('profiles');
        this.toast(data.message || (appLang === 'ro' ? 'Cont creat cu succes!' : 'Account created!'), 'success');
        this.renderProfiles([{ id: `p${data.user.id}`, name, color: '#6c5ce7' }]);
        
        // Show verification link if available
        if (data.verification_url) {
          setTimeout(() => this.showVerificationLink(data.verification_url), 2000);
        } else {
          setTimeout(() => this.showVerifyBanner(), 3000);
        }
      } catch (e) {
        if (this.els.registerError) this.els.registerError.textContent = 'Connection error.';
      }
    },

    // Google Identity Services: inițializare o singură dată
    _googleInitialized: false,
    // Google OAuth Client ID - configure in .env or replace with your own
    // Get one at https://console.cloud.google.com/apis/credentials
    _googleClientId: window.__GOOGLE_CLIENT_ID || '',

    async _initGoogleGIS() {
      if (this._googleInitialized) return true;
      // Așteaptă ca GIS să se încarce (max 5s) — NU seta flag-ul aici
      for (let i = 0; i < 50; i++) {
        if (typeof google !== 'undefined' && google.accounts) {
          return true;  // doar verifică disponibilitatea
        }
        await new Promise(r => setTimeout(r, 100));
      }
      return false;
    },

    async googleLogin() {
      // Pas 1: Încarcă Google Identity Services dacă nu e gata
      let gisLoaded = await this._initGoogleGIS();
      
      // Pas 2: Dacă nu s-a încărcat, încearcă încărcare dinamică (doar dacă nu există deja script tag)
      if (!gisLoaded) {
        this.toast(appLang === 'ro' ? 'Se încarcă Google Sign-In...' : 'Loading Google Sign-In...', 'info');
        try {
          // Verifică dacă scriptul GIS există deja în DOM (e.g. din index.html)
          const existingScript = document.querySelector('script[src*="gsi/client"]');
          if (existingScript) {
            // Script tag există dar nu s-a încărcat încă - așteaptă-l
            for (let i = 0; i < 50; i++) {
              if (typeof google !== 'undefined' && google.accounts) {
          gisLoaded = true;  // NU seta _googleInitialized aici — se face în Pas 3
          break;
              }
              await new Promise(r => setTimeout(r, 100));
            }
          } else {
            await new Promise((resolve, reject) => {
              const script = document.createElement('script');
              script.src = 'https://accounts.google.com/gsi/client';
              script.async = true;
              script.defer = true;
              script.onload = async () => {
              // Așteaptă ca google.accounts să fie disponibil
              for (let i = 0; i < 30; i++) {
                if (typeof google !== 'undefined' && google.accounts) {
                  resolve();
                  return;
                }
                await new Promise(r => setTimeout(r, 100));
              }
              reject(new Error('GIS load timeout'));
            };
              script.onerror = () => reject(new Error('GIS script failed'));
              document.head.appendChild(script);
            });
          }
          gisLoaded = true;
          // NU seta _googleInitialized aici — se face în Pas 3
        } catch (e) {
          this.toast(appLang === 'ro' 
            ? 'Google Sign-In indisponibil. Folosește email/parolă.' 
            : 'Google Sign-In unavailable. Use email/password.', 'error');
          return;
        }
      }

      if (!gisLoaded || typeof google === 'undefined' || !google.accounts) {
        this.toast(appLang === 'ro' 
          ? 'Google Sign-In indisponibil. Folosește email/parolă.' 
          : 'Google Sign-In unavailable. Use email/password.', 'error');
        return;
      }

      // Pas 3: Inițializează GIS o singură dată. prompt() poate fi re-apelat
      if (!this._googleInitialized) {
        this._googleInitialized = true;
        google.accounts.id.initialize({
          client_id: this._googleClientId,
        callback: async (response) => {
          if (!response || !response.credential) {
            this.toast(appLang === 'ro' ? 'Autentificare Google eșuată' : 'Google auth failed', 'error');
            return;
          }
          try {
            const payload = JSON.parse(atob(response.credential.split('.')[1]));
            if (!payload.email || !payload.sub) {
              this.toast(appLang === 'ro' ? 'Date insuficiente de la Google' : 'Insufficient Google data', 'error');
              return;
            }
            const res = await fetch(`${API}/auth/google`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                email: payload.email, 
                name: payload.name || payload.email.split('@')[0], 
                googleId: payload.sub, 
                picture: payload.picture || '' 
              })
            });
            const data = await res.json();
            if (!data.success) { 
              this.toast(data.error || 'Google login failed', 'error'); 
              return; 
            }
            authToken = data.token;
            currentUser = data.user;
            localStorage.setItem('animaxia_token', authToken);
            this.showScreen('profiles');
            this.renderProfiles(data.profiles || []);
            this.toast(appLang === 'ro' ? 'Autentificat cu Google!' : 'Signed in with Google!', 'success');
          } catch (e) { 
            this.toast(appLang === 'ro' ? 'Eroare la autentificarea Google' : 'Google login error', 'error'); 
          }
        },
        cancel_on_tap_outside: false,
        auto_select: false        });
      }

      // Pas 4: Afișează selectorul de conturi Google
      try {
        await google.accounts.id.prompt();
      } catch (e) {
        // Dacă prompt() eșuează (de ex. cookie-urile third-party sunt blocate),
        // încearcă să afișezi butonul oficial Google ca fallback
        const btn = document.getElementById('googleLoginBtn');
        if (btn) {
          // Păstrează doar id-ul, înlocuiește restul cu butonul oficial Google
          const parent = btn.parentNode;
          const officialBtn = document.createElement('div');
          officialBtn.id = 'googleLoginOfficial';
          btn.remove();
          parent.appendChild(officialBtn);
          try {
            google.accounts.id.renderButton(officialBtn, {
              type: 'standard',
              shape: 'pill',
              theme: 'outline',
              text: 'signin_with',
              size: 'large',
              width: 360
            });            } catch (e2) {
            this.toast(appLang === 'ro' 
              ? 'Google Sign-In indisponibil. Folosește email/parolă.' 
              : 'Google Sign-In unavailable. Use email/password.', 'error');
          }
        }
      }
    },

    async forgotPassword(e) {
      e.preventDefault();
      const email = document.getElementById('forgotEmail')?.value;
      if (!email) return;
      try {
        const res = await fetch(`${API}/auth/forgot-password`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (this.els.forgotSuccess) {
          this.els.forgotSuccess.style.display = 'block';
          this.els.forgotSuccess.textContent = data.message || (appLang === 'ro' ? 'Verifică consola serverului.' : 'Check server console.');
        }
      } catch { if (this.els.forgotError) this.els.forgotError.textContent = 'Connection error'; }
    },

    async resetPassword(e) {
      e.preventDefault();
      const password = document.getElementById('resetPassword')?.value;
      const confirm = document.getElementById('resetConfirm')?.value;
      const token = sessionStorage.getItem('reset_token');
      if (!token) {
        if (this.els.resetError) this.els.resetError.textContent = appLang === 'ro' ? 'Token lipsă.' : 'Token missing.';
        return;
      }
      if (password !== confirm) {
        if (this.els.resetError) this.els.resetError.textContent = appLang === 'ro' ? 'Parolele nu coincid' : 'Passwords do not match';
        return;
      }
      if (password.length < 6) {
        if (this.els.resetError) this.els.resetError.textContent = appLang === 'ro' ? 'Minim 6 caractere' : 'Min 6 characters';
        return;
      }
      try {
        const res = await fetch(`${API}/auth/reset-password`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, password })
        });
        const data = await res.json();
        if (!data.success) {
          if (this.els.resetError) this.els.resetError.textContent = data.error || 'Failed';
          return;
        }
        sessionStorage.removeItem('reset_token');
        this.toast(appLang === 'ro' ? 'Parola a fost resetată!' : 'Password reset!', 'success');
        this.showScreen('login');
      } catch { if (this.els.resetError) this.els.resetError.textContent = 'Connection error'; }
    },

    async changePassword(e) {
      e.preventDefault();
      const current = document.getElementById('changeCurrentPass')?.value;
      const newPass = document.getElementById('changeNewPass')?.value;
      const confirm = document.getElementById('changeConfirmPass')?.value;
      if (!current || !newPass || !confirm) return;
      if (newPass !== confirm) {
        if (this.els.changePassError) this.els.changePassError.textContent = appLang === 'ro' ? 'Parolele noi nu coincid' : 'New passwords do not match';
        return;
      }
      try {
        const res = await fetch(`${API}/auth/change-password`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
          body: JSON.stringify({ currentPassword: current, newPassword: newPass })
        });
        const data = await res.json();
        if (!data.success) {
          if (this.els.changePassError) this.els.changePassError.textContent = data.error || 'Error';
          return;
        }
        if (this.els.changePassSuccess) {
          this.els.changePassSuccess.style.display = 'block';
          this.els.changePassSuccess.textContent = appLang === 'ro' ? 'Parola a fost schimbată!' : 'Password changed!';
        }
        if (this.els.changePassForm) this.els.changePassForm.reset();
        setTimeout(() => { if (this.els.changePassSuccess) this.els.changePassSuccess.style.display = 'none'; }, 3000);
      } catch { if (this.els.changePassError) this.els.changePassError.textContent = 'Connection error'; }
    },

    async uploadAvatar(e) {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        this.toast(appLang === 'ro' ? 'Maxim 5MB.' : 'Max 5MB.', 'error');
        return;
      }
      const formData = new FormData();
      formData.append('avatar', file);
      try {
        const res = await fetch(`${API}/auth/avatar`, {
          method: 'POST', headers: { 'Authorization': `Bearer ${authToken}` },
          body: formData
        });
        const data = await res.json();
        if (data.success) {
          if (this.els.avatarPreview) {
            this.els.avatarPreview.innerHTML = `<img src="${data.avatar_url}?t=${Date.now()}" alt="Avatar">`;
            this.els.avatarPreview.style.background = 'transparent';
          }
          this.toast(appLang === 'ro' ? 'Avatar actualizat!' : 'Avatar updated!', 'success');
        }
      } catch { this.toast('Eroare', 'error'); }
    },

    async restoreSession() {
      try {
        const res = await fetch(`${API}/auth/session`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (data.success && data.profiles) {
          currentUser = data.user;
          if (data.user?.preferred_language) this.applyLanguage(data.user.preferred_language);
          this.showScreen('profiles');
          this.renderProfiles(data.profiles);
          // Show admin link if user is admin
          if (data.user?.role === 'admin') {
            document.querySelectorAll('.admin-link').forEach(el => el.style.display = '');
          }
        } else { this.logout(); }
      } catch { this.showScreen('login'); }
    },

    handleResetToken() {
      const params = new URLSearchParams(window.location.search);
      const resetToken = params.get('token');
      if (resetToken) {
        sessionStorage.setItem('reset_token', resetToken);
        window.history.replaceState({}, '', window.location.pathname);
      }
    },

    showVerifyBanner() {
      if (this.els.verifyBanner && !sessionStorage.getItem('verify_banner_dismissed')) {
        this.els.verifyBanner.style.display = 'flex';
      }
    },

    showVerificationLink(url) {
      const lang = appLang || 'ro';
      const existing = document.getElementById('verifyLinkModal');
      if (existing) existing.remove();
      
      const modal = document.createElement('div');
      modal.id = 'verifyLinkModal';
      modal.className = 'admin-modal-overlay';
      modal.style.zIndex = '10002';
      modal.innerHTML = `
        <div class="admin-modal" style="max-width:480px;text-align:center;">
          <div style="font-size:48px;margin-bottom:12px;">📧</div>
          <h3 style="margin-bottom:8px;">${lang === 'ro' ? 'Confirmă-ți adresa de email' : 'Verify your email address'}</h3>
          <p style="color:var(--text-tertiary);font-size:14px;margin-bottom:16px;line-height:1.5;">
            ${lang === 'ro' 
              ? 'Apasă butonul de mai jos pentru a-ți confirma adresa de email. După confirmare, vei putea accesa toate funcțiile platformei.' 
              : 'Click the button below to confirm your email address. After verification, you will have access to all platform features.'}
          </p>
          <a href="${url}" target="_blank" class="btn btn-primary" style="display:inline-flex;width:100%;justify-content:center;padding:14px;font-size:16px;margin-bottom:12px;">
            <i class="fas fa-check-circle"></i> ${lang === 'ro' ? 'Confirmă Email-ul' : 'Verify Email'}
          </a>
          <p style="font-size:12px;color:var(--text-muted);">
            <i class="fas fa-info-circle"></i> 
            ${lang === 'ro' 
              ? 'Link-ul se deschide într-o fereastră nouă. Poți închide această fereastră după confirmare.' 
              : 'The link opens in a new tab. You can close this window after verification.'}
          </p>
          <div style="margin-top:16px;padding:12px;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid rgba(255,255,255,0.06);">
            <p style="font-size:12px;color:var(--text-tertiary);margin-bottom:8px;">
              ${lang === 'ro' ? 'Sau copiază link-ul manual:' : 'Or copy the link manually:'}
            </p>
            <div style="display:flex;gap:8px;">
              <input type="text" value="${url}" readonly style="flex:1;font-size:11px;padding:8px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;color:var(--accent-secondary);" onclick="this.select()">
              <button class="btn btn-secondary" onclick="navigator.clipboard.writeText('${url}').then(() => { App.toast('${lang === 'ro' ? 'Link copiat!' : 'Link copied!'}', 'success'); })" style="padding:8px 12px;font-size:12px;">
                <i class="fas fa-copy"></i>
              </button>
            </div>
          </div>
          <button class="btn btn-secondary" onclick="document.getElementById('verifyLinkModal').remove()" style="width:100%;justify-content:center;margin-top:12px;">
            ${lang === 'ro' ? 'Închide' : 'Close'}
          </button>
        </div>`;
      document.body.appendChild(modal);
    },

    async resendVerification() {
      if (!currentUser?.email) return;
      try {
        const res = await fetch(`${API}/auth/resend-verification`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
          body: JSON.stringify({ email: currentUser.email })
        });
        const data = await res.json();
        if (data.verification_url) {
          this.showVerificationLink(data.verification_url);
          this.toast(appLang === 'ro' ? 'Link nou de verificare generat!' : 'New verification link generated!', 'success');
        } else {
          this.toast(data.message || 'Error', 'error');
        }
      } catch {
        this.toast(appLang === 'ro' ? 'Eroare la generare link' : 'Error generating link', 'error');
      }
    },

    async loadSettings() {
      try {
        const res = await fetch(`${API}/auth/session`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (data.success) {
          currentUser = data.user;
          if (this.els.settingsName) this.els.settingsName.textContent = data.user.name;
          if (this.els.settingsEmail) this.els.settingsEmail.textContent = data.user.email;
          if (this.els.settingsPlan) this.els.settingsPlan.textContent = data.user.plan || 'Free';
          if (this.els.settingsVerified) {
            this.els.settingsVerified.textContent = data.user.email_verified ? '✅ Verified' : '⚠️ Not verified';
            this.els.settingsVerified.className = `settings-value ${data.user.email_verified ? 'verified' : 'unverified'}`;
          }
          if (data.user.avatar_url && this.els.avatarPreview) {
            this.els.avatarPreview.innerHTML = `<img src="${data.user.avatar_url}" alt="Avatar">`;
            this.els.avatarPreview.style.background = 'transparent';
          } else if (this.els.avatarInitials) {
            this.els.avatarInitials.textContent = data.user.name?.[0] || '?';
          }
          document.querySelectorAll('.lang-option').forEach(b => {
            b.classList.toggle('active', b.dataset.lang === appLang);
          });
        }
      } catch {}
    },

    checkStrength(password) {
      const fill = document.getElementById('psFill');
      const text = document.getElementById('psText');
      if (!fill || !text) return;
      let score = 0;
      if (password.length >= 6) score += 25;
      if (password.length >= 10) score += 25;
      if (/[A-Z]/.test(password)) score += 25;
      if (/[0-9!@#$%^&*]/.test(password)) score += 25;
      fill.style.width = score + '%';
      if (score < 25) { fill.style.background = 'var(--red)'; text.textContent = 'Weak'; }
      else if (score < 50) { fill.style.background = 'var(--orange)'; text.textContent = 'Fair'; }
      else if (score < 75) { fill.style.background = 'var(--yellow)'; text.textContent = 'Good'; }
      else { fill.style.background = 'var(--green)'; text.textContent = 'Strong'; }
    },

    // ====== PROFILES ======
    renderProfiles(profiles) {
      const container = document.querySelector('.profile-list');
      if (!container) return;
      container.innerHTML = profiles.map(p =>
        `<div class="profile-item" data-profile='${p.id}'>
          <div class="profile-avatar" style="background:${p.color}"><span>${p.name[0]}</span></div>
          <span class="profile-name">${p.name}${p.is_kid ? ' 👶' : ''}</span>
        </div>`
      ).join('');
      container.querySelectorAll('.profile-item').forEach(el => {
        el.addEventListener('click', () => {
          const pid = el.dataset.profile;
          const prof = profiles.find(p => p.id === pid);
          if (prof?.is_kid && prof.kids_pin) {
            this.showKidsPin(pid, prof.name, prof.color);
          } else {
            this.selectProfile(pid);
          }
        });
      });
    },

    // ====== KIDS PIN ======
    showKidsPin(profileId, name, color) {
      this.kidsPinProfile = { id: profileId, name, color };
      this.kidsPinInput = '';
      this.showScreen('kids-pin');
      this.renderPinDots();
      document.getElementById('pinNumpad')?.querySelectorAll('.pin-btn').forEach(btn => {
        btn.onclick = () => this.handlePinInput(btn.dataset.value);
      });
      document.getElementById('pinBackBtn').onclick = () => this.showScreen('profiles');
    },

    renderPinDots() {
      const dots = document.querySelectorAll('.pin-dot');
      dots.forEach((d, i) => {
        d.className = 'pin-dot' + (i < this.kidsPinInput.length ? ' filled' : '');
      });
      document.getElementById('pinError').textContent = '';
    },

    async handlePinInput(value) {
      if (value === 'clear') {
        this.kidsPinInput = this.kidsPinInput.slice(0, -1);
        this.renderPinDots();
        return;
      }
      if (value === 'submit') {
        await this.verifyKidsPin();
        return;
      }
      if (this.kidsPinInput.length >= 4) return;
      this.kidsPinInput += value;
      this.renderPinDots();
      if (this.kidsPinInput.length === 4) {
        await this.verifyKidsPin();
      }
    },

    async verifyKidsPin() {
      try {
        const res = await fetch(`${API}/kids/verify-pin`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId: this.kidsPinProfile.id, pin: this.kidsPinInput })
        });
        const data = await res.json();
        if (data.success && data.valid) {
          this.selectProfile(this.kidsPinProfile.id);
        } else {
          document.querySelectorAll('.pin-dot').forEach(d => d.classList.add('error'));
          document.getElementById('pinError').textContent = appLang === 'ro' ? 'PIN incorect. Încearcă din nou.' : 'Incorrect PIN. Try again.';
          setTimeout(() => {
            this.kidsPinInput = '';
            this.renderPinDots();
          }, 500);
        }
      } catch {
        document.getElementById('pinError').textContent = 'Connection error';
      }
    },

    // ====== SELECT PROFILE ======
    async selectProfile(profileId) {
      try {
        currentProfile = { id: profileId, name: 'User', color: '#6c5ce7' };
        this.showScreen('app');
        this.closeAllModals();
        playerState = { playing: false, volume: 80, speed: 1, currentTime: 0, duration: 100, currentEpisode: null, currentSeason: 1, episodesData: null, seasonsData: [], isFullscreen: false, subtitlesOn: false };
        
        // Subscribe to push notifications after login
        if (authToken && 'Notification' in window && Notification.permission === 'granted') {
          subscribeToPush();
        } else if ('Notification' in window && Notification.permission === 'default') {
          setTimeout(() => {
            Notification.requestPermission().then(perm => {
              if (perm === 'granted') subscribeToPush();
            });
          }, 5000);
        }

        document.querySelectorAll('.user-avatar, .user-avatar-sm').forEach(a => {
          a.style.background = currentProfile.color;
          a.textContent = currentProfile.name[0];
        });

        // Show admin link
        if (currentUser?.role === 'admin') {
          document.querySelectorAll('.admin-link').forEach(el => el.style.display = '');
        }

        try {
          const [userRes, contentRes] = await Promise.all([
            fetch(`${API}/user/${profileId}/data`),
            fetch(`${API}/content?lang=${appLang}`)
          ]);
          const userJson = await userRes.json();
          const contentJson = await contentRes.json();
          userData = userJson.success ? userJson.data : null;
          window.userData = userData;
          if (contentJson.success && contentJson.data) {
            contentCache = contentJson.data;
            window.__content = contentJson.data;
            if (!window.AnimaxiaData?._cache) { window.AnimaxiaData = window.AnimaxiaData || {}; window.AnimaxiaData._cache = contentJson.data; }
          } else {
            // Content database might be empty - use TMDB as fallback
            await AnimaxiaData.loadContent();
            contentCache = AnimaxiaData._cache;
          }
        } catch {
          userData = null;
          window.userData = null;
          window.__content = null;
        }
        
        // If local content is empty, load from TMDB as fallback
        if (!contentCache || !contentCache.categories || contentCache.categories.length === 0) {
          await AnimaxiaData.loadContent();
          contentCache = AnimaxiaData._cache;
        }

        if (this.els.dropdownUserName) this.els.dropdownUserName.textContent = currentUser?.name || 'User';
        if (this.els.dropdownUserPlan) this.els.dropdownUserPlan.textContent = currentUser?.plan || 'Free';
        this.updateSidebarUser();

        // Render the platform
        this.initHero();
        this.renderAll();
        this.loadRecommendations();
        this.updateNotifBadge();
        
        this.toast(appLang === 'ro' ? `Bun venit, ${currentProfile.name}!` : `Welcome, ${currentProfile.name}!`);
      } catch (e) {
        console.error('Profile selection error:', e);
        this.showScreen('profiles');
        this.toast(appLang === 'ro' ? 'Eroare la încărcarea profilului' : 'Error loading profile', 'error');
      }
    },

    // ====== HERO ======
    initHero() {
      this.els.heroDots.innerHTML = '';
      this.renderHero(0);
      this.startHero();
    },

    renderHero(idx) {
      const items = contentCache?.featured || [];
      if (!items.length) return;
      const item = items[idx] || items[0];
      heroIndex = idx;
      currentHeroItem = item;

      this.els.heroBackdrop.style.background = item.backdrop_color || 'linear-gradient(135deg,#667eea,#764ba2)';
      const c = this.els.heroContent;
      c.style.opacity = '0';
      c.style.transform = 'translateY(20px)';

      setTimeout(() => {
        this.els.heroTitle.textContent = item.title;
        this.els.heroDesc.textContent = item.description || '';
        if (this.els.heroBadge) this.els.heroBadge.textContent = item.content_type === 'series' ? 
          (appLang === 'ro' ? 'Serial Original' : 'Original Series') : 
          (appLang === 'ro' ? 'Original Animaxia' : 'Animaxia Original');
        document.getElementById('heroYearDisplay').textContent = item.year || '';
        document.getElementById('heroDurationDisplay').textContent = item.duration || '';
        const ratingEl = document.getElementById('heroRatingDisplay');
        if (ratingEl) { ratingEl.textContent = item.rating || ''; ratingEl.style.display = item.rating ? '' : 'none'; }
        const matchEl = document.getElementById('heroMatchDisplay');
        if (matchEl) matchEl.innerHTML = `<i class="fas fa-thumbs-up"></i> ${item.match_rating||'95%'} ${appLang === 'ro' ? 'potrivire' : 'match'}`;
        this.els.heroGenres.innerHTML = (item.genre||[]).map(g => `<span class="genre-tag">${g}</span>`).join('');
        const inList = userData?.myList?.includes(item.id);
        this.els.heroAdd.innerHTML = inList ? '<i class="fas fa-check"></i>' : '<i class="fas fa-plus"></i>';
        this.els.heroAdd.classList.toggle('in-list', inList);
        c.style.opacity = '1'; c.style.transform = 'translateY(0)'; c.style.transition = 'all 0.5s ease';
      }, 200);

      this.els.heroDots.innerHTML = items.map((_, i) =>
        `<div class="hero-nav-dot ${i===idx?'active':''}" data-idx="${i}"></div>`
      ).join('');
      this.els.heroDots.querySelectorAll('.hero-nav-dot').forEach(d => {
        d.addEventListener('click', () => { this.stopHero(); this.renderHero(parseInt(d.dataset.idx)); });
      });
    },

    navHero(dir) {
      const items = contentCache?.featured || [];
      const ni = heroIndex + dir;
      if (ni >= 0 && ni < items.length) this.renderHero(ni);
    },

    startHero() { this.stopHero(); heroTimer = setInterval(() => {
      const items = contentCache?.featured || [];
      if (items.length) this.renderHero((heroIndex + 1) % items.length);
    }, 8000); },
    stopHero() { if (heroTimer) { clearInterval(heroTimer); heroTimer = null; } },

    // ====== RECOMMENDATIONS (NEW) ======
    async loadRecommendations() {
      if (!currentProfile) return;
      try {
        const res = await fetch(`${API}/user/${currentProfile.id}/recommendations`);
        const data = await res.json();
        if (data.success && data.data?.length) {
          const section = document.getElementById('recommendationsSection');
          const row = document.getElementById('recommendationsRow');
          if (section) section.style.display = '';
          if (row) {
            row.innerHTML = data.data.map(item => this.cardHTML(item)).join('');
            row.querySelectorAll('.content-card').forEach(card => {
              card.addEventListener('click', () => this.openDetail(card.dataset.id));
              card.querySelector('.play-btn')?.addEventListener('click', (e) => { e.stopPropagation(); this.openPlayer(card.dataset.id); });
              card.querySelector('.add-btn')?.addEventListener('click', (e) => { e.stopPropagation(); this.toggleWatchlist(card.dataset.id, card); });
            });
            this.refreshCardPreviews();
          }
        }
      } catch {}
    },

    // ====== CONTENT RENDERING ======
    async renderAll() {
      document.querySelectorAll('.content-row').forEach(r => {
        r.innerHTML = '';
        for (let i=0;i<5;i++) r.innerHTML += '<div class="shimmer-card"><div class="shimmer-image"></div><div class="shimmer-line"></div><div class="shimmer-line short"></div></div>';
      });
      setTimeout(() => {
        this.renderContinue();
        this.renderLive();
        this.renderCategories();
        this.renderTop10();
        this.renderPlans();
      }, 600);
    },

    renderContinue() {
      if (!this.els.continueRow) return;
      const cw = userData?.continueWatching || [];
      this.els.continueRow.innerHTML = cw.length === 0
        ? `<p style="color:var(--text-tertiary);padding:20px;">${appLang === 'ro' ? 'Selectează conținut pentru a începe' : 'Select content to start watching'}</p>`
        : cw.map((item) => {
            const content = this.findItem(item.item_id);
            return `<div class="continue-card" data-id="${item.item_id}">
            <div class="continue-card-image" style="background:${item.bg_color||content?.bg_color||'#1a1a2e'}">
              <div class="continue-play-overlay"><i class="fas fa-play"></i></div>
            </div>
            <div class="continue-card-info">
              <div class="continue-card-title">${content?.title || item.title || item.item_id}</div>
              ${item.episode ? `<div class="continue-card-episode">${item.episode}</div>` : ''}
              <div class="continue-progress"><div class="continue-progress-fill" style="width:${item.progress||0}%"></div></div>
            </div>
          </div>`}).join('');
      this.els.continueRow.querySelectorAll('.continue-card').forEach(el => {
        el.addEventListener('click', () => this.openPlayer(el.dataset.id));
      });
    },

    renderLive() {
      if (!this.els.liveStrip) return;
      const channels = contentCache?.channels || [];
      this.els.liveStrip.innerHTML = channels.map(ch =>
        `<div class="live-card" data-ch="${ch.id}">
          <div class="live-card-bg" style="background:${ch.bg_color}">
            <div class="live-badge"><span class="live-dot"></span> LIVE</div>
            <div class="live-card-name">${ch.name}</div>
            <div class="live-card-category">${ch.category}</div>
            <div class="live-card-viewers"><i class="fas fa-eye"></i> ${Math.floor(Math.random()*15+5)}K</div>
          </div>
        </div>`
      ).join('');
      this.els.liveStrip.querySelectorAll('.live-card').forEach(c => c.addEventListener('click', () => this.openGuide()));
    },

    renderCategories() {
      if (!this.els.contentRows) return;
      const cats = contentCache?.categories || [];
      this.els.contentRows.innerHTML = '';
      cats.forEach(cat => {
        const sec = document.createElement('section');
        sec.className = 'content-section';
        sec.dataset.category = cat.id;
        sec.innerHTML = `<div class="section-header"><h2 class="section-title">${cat.title}</h2><a href="#" class="section-link">${appLang === 'ro' ? 'Vezi tot' : 'See all'}</a></div>
          <div class="content-row">${(cat.items||[]).map(item => this.cardHTML(item)).join('')}</div>`;
        this.els.contentRows.appendChild(sec);
        const row = sec.querySelector('.content-row');
        row.addEventListener('wheel', (e) => {
          if (Math.abs(e.deltaY) > 5) { e.preventDefault(); row.scrollLeft += e.deltaY > 0 ? 60 : -60; }
        }, { passive: false });
        row.querySelectorAll('.content-card').forEach(card => {
          card.addEventListener('click', () => this.openDetail(card.dataset.id));
          card.querySelector('.play-btn')?.addEventListener('click', (e) => { e.stopPropagation(); this.openPlayer(card.dataset.id); });
          card.querySelector('.add-btn')?.addEventListener('click', (e) => { e.stopPropagation(); this.toggleWatchlist(card.dataset.id, card); });
        });
      });
      this.refreshCardPreviews();
    },

    cardHTML(item) {
      if (!item) return '';
      const inList = userData?.myList?.includes(item.id);
      const reviewBadge = item.reviews?.count ? `<span style="font-size:10px;color:var(--yellow);margin-left:4px;">★ ${item.reviews.avg}</span>` : '';
      return `<div class="content-card" data-id="${item.id}">
        <div class="content-card-image" style="background:${item.bg_color||'#1e1e2e'}">
          <span class="card-badge ${item.content_type||'movie'}">${item.content_type==='series'?(appLang==='ro'?'Serial':'Series'):item.content_type==='collection'?'Colecție':(appLang==='ro'?'Film':'Movie')}</span>
          ${item.match_rating ? `<span class="card-match">${item.match_rating}</span>` : ''}
          <span class="card-image-icon">🎬</span>
          <div class="content-card-hover">
            <div class="hover-actions">
              <button class="hover-btn play-btn"><i class="fas fa-play"></i></button>
              <button class="hover-btn add-btn"><i class="fas ${inList?'fa-check':'fa-plus'}"></i></button>
              <button class="hover-btn"><i class="fas fa-thumbs-up"></i></button>
              <button class="hover-btn"><i class="fas fa-chevron-down"></i></button>
            </div>
            <div class="hover-info">${(item.genre||[]).slice(0,2).join(' • ')}${reviewBadge}</div>
          </div>
        </div>
        <div class="content-card-info">
          <div class="content-card-title">${item.title}</div>
          <div class="content-card-meta">
            <span>${item.year}</span><span class="content-card-dot">•</span><span>${item.duration}</span>
            ${item.rating ? `<span class="content-card-dot">•</span><span class="content-card-rating">${item.rating}</span>` : ''}
          </div>
        </div>
      </div>`;
    },

    renderTop10() {
      if (!this.els.contentRows) return;
      const top10 = contentCache?.top10 || [];
      const sec = document.createElement('section');
      sec.className = 'content-section';
      sec.innerHTML = `<div class="section-header"><h2 class="section-title">🏆 ${appLang === 'ro' ? 'Top 10 Astăzi' : 'Top 10 Today'}</h2><a href="#" class="section-link">${appLang === 'ro' ? 'Vezi tot' : 'See all'}</a></div>
        <div class="content-row top10-row">${top10.map((t,i) => `
          <div class="top10-card" data-id="${t.id||t.title}">
            <div class="top10-rank">${t.rank||i+1}</div>
            <div class="top10-content" style="background:${t.bg_color||'#1e1e2e'}"><span>${t.title}</span></div>
          </div>`).join('')}</div>`;
      this.els.contentRows.insertBefore(sec, this.els.contentRows.firstChild);
      sec.querySelectorAll('.top10-card').forEach(c => c.addEventListener('click', () => this.openDetail(c.dataset.id)));
    },

    renderPlans() {
      if (!this.els.contentRows) return;
      const plans = contentCache?.plans || [];
      const existing = document.querySelector('.plans-section');
      if (existing) existing.remove();
      const sec = document.createElement('section');
      sec.className = 'content-section plans-section';
      sec.innerHTML = `<div class="section-header"><h2 class="section-title">💰 ${appLang === 'ro' ? 'Planuri' : 'Plans'}</h2><a href="#" class="section-link">${appLang === 'ro' ? 'Compară' : 'Compare'}</a></div>
        <div class="plans-grid">${plans.map(p => `
          <div class="plan-card ${p.name==='Premium'?'plan-popular':''}">
            ${p.name==='Premium'?`<div class="plan-badge">${appLang === 'ro' ? 'Cel mai popular' : 'Most popular'}</div>`:''}
            <div class="plan-name">${p.name}</div>
            <div class="plan-price"><span class="plan-currency">RON</span>${p.price}<span class="plan-period">/lună</span></div>
            <ul class="plan-features">${[`${appLang === 'ro' ? 'Calitate' : 'Quality'}: ${p.quality}`, `${appLang === 'ro' ? 'Dispozitive' : 'Devices'}: ${p.devices}`, `${appLang === 'ro' ? 'Ecrane' : 'Screens'}: ${p.screens}`].map(f =>
              `<li><i class="fas fa-check"></i> ${f}</li>`).join('')}</ul>
            <button class="btn ${p.name==='Premium'?'btn-primary':'btn-secondary'}">${p.name==='Premium'?(appLang==='ro'?'Începe acum':'Start now'):(appLang==='ro'?'Selectează':'Select')}</button>
          </div>`).join('')}</div>`;
      this.els.contentRows.appendChild(sec);
    },

    // ====== DETAIL MODAL (with Reviews) ======
    openDetail(id) {
      const item = this.findItem(id);
      if (!item) return;
      this.stopHero();
      App.currentDetailId = id;
      reviewRating = 0;

      this.els.modalHeroBg.style.background = item.backdrop_color || 'linear-gradient(135deg,#667eea,#764ba2)';
      this.els.modalTitle.textContent = item.title;
      this.els.modalMeta.innerHTML = `
        <span>${item.year||''}</span> <span style="color:var(--text-tertiary);">&bull;</span>
        <span>${item.duration||''}</span>
        ${item.rating ? `<span style="color:var(--text-tertiary);">&bull;</span><span style="padding:1px 6px;border:1px solid var(--text-tertiary);border-radius:2px;font-size:12px;">${item.rating}</span>` : ''}
        ${item.match_rating ? `<span style="color:var(--green);font-weight:600;">&nbsp;<i class="fas fa-thumbs-up"></i> ${item.match_rating}</span>` : ''}
        ${item.content_type === 'series' ? `&nbsp;<span class="card-badge series" style="font-size:10px;background:rgba(0,184,148,0.8);padding:2px 8px;border-radius:4px;">${appLang === 'ro' ? 'Serial' : 'Series'}</span>` : ''}`;
      this.els.modalGenres.innerHTML = (item.genre||[]).map(g => `<span class="genre-tag">${g}</span>`).join('');
      this.els.modalDesc.textContent = item.description || (appLang === 'ro' ? `${item.title} - disponibil pe Animaxia.` : `${item.title} - available on Animaxia.`);
      this.els.modalCast.textContent = (item.cast_members||[]).length ? item.cast_members.join(', ') : (appLang === 'ro' ? 'Distribuție variată' : 'Various cast');
      this.els.modalRating.textContent = item.rating || 'N/A';
      this.els.modalDur.textContent = item.duration || 'N/A';
      this.els.modalYear.textContent = item.year || 'N/A';

      const actions = document.getElementById('modalActions');
      if (actions) {
        const inList = userData?.myList?.includes(id);
        const isSeries = item.content_type === 'series';
        actions.innerHTML = `
          <button class="btn btn-primary btn-play" onclick="App.openPlayer('${item.id}')"><i class="fas fa-play"></i> ${appLang === 'ro' ? 'Rulează' : 'Play'}</button>
          <button class="btn btn-secondary" onclick="App.toggleWatchlist('${item.id}')"><i class="fas ${inList?'fa-check':'fa-plus'}"></i> ${inList ? (appLang === 'ro' ? 'Salvat' : 'Saved') : (appLang === 'ro' ? 'Salvează' : 'Save')}</button>
          ${isSeries ? `<button class="btn btn-secondary" onclick="App.openPlayer('${item.id}')"><i class="fas fa-list"></i> ${appLang === 'ro' ? 'Episoade' : 'Episodes'}</button>` : ''}
          ${item.trailer_url ? `<button class="btn btn-secondary" onclick="window.open('${item.trailer_url}','_blank')"><i class="fab fa-youtube"></i> Trailer</button>` : ''}`;
      }

      this.renderReviews(id);
      this.renderSimilar(item);
      this.els.detailModal.classList.add('active');
      document.body.style.overflow = 'hidden';
    },

    // ====== PREMIUM FEATURES: INIT CARD PREVIEWS ======
    refreshCardPreviews() {
      setTimeout(() => this.initCardPreviews(), 300);
    },

    // ====== REVIEWS (NEW) ======
    async renderReviews(itemId) {
      const statsEl = document.getElementById('reviewStats');
      const listEl = document.getElementById('reviewList');
      const formEl = document.getElementById('reviewForm');
      if (!listEl) return;

      try {
        const res = await fetch(`${API}/content/${itemId}/reviews`);
        const data = await res.json();
        if (!data.success) throw new Error('Failed');

        if (statsEl) {
          statsEl.textContent = data.stats?.total ? `★ ${data.stats.avg} (${data.stats.total} reviews)` : '';
        }

        // Reset star rating
        document.querySelectorAll('.review-stars .star').forEach(s => s.classList.remove('active'));
        reviewRating = 0;

        if (formEl) {
          if (!currentProfile) { formEl.style.display = 'none'; }
          else { formEl.style.display = ''; }
        }

        listEl.innerHTML = data.data.length === 0
          ? `<div class="review-empty">${appLang === 'ro' ? 'Nu există recenzii încă. Fii primul care scrie o recenzie!' : 'No reviews yet. Be the first to review!'}</div>`
          : data.data.map(r => `
            <div class="review-item">
              <div class="review-avatar" style="background:${r.profile_color || '#6c5ce7'}">${(r.profile_name || '?')[0]}</div>
              <div class="review-body">
                <div class="review-header">
                  <span class="review-name">${r.profile_name || 'User'}</span>
                  <span class="review-rating">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
                  <span class="review-date">${new Date(r.created_at).toLocaleDateString('ro-RO')}</span>
                </div>
                ${r.comment ? `<div class="review-text">${r.comment}</div>` : ''}
              </div>
            </div>
          `).join('');
      } catch {
        if (listEl) listEl.innerHTML = '<div class="review-empty">Failed to load reviews</div>';
      }
    },

    async submitReview() {
      if (!currentProfile || !App.currentDetailId || !reviewRating) {
        this.toast(appLang === 'ro' ? 'Selectează un rating' : 'Select a rating', 'error');
        return;
      }
      const comment = document.getElementById('reviewComment')?.value || '';
      try {
        const res = await fetch(`${API}/reviews`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
          body: JSON.stringify({ profileId: currentProfile.id, itemId: App.currentDetailId, rating: reviewRating, comment })
        });
        const data = await res.json();
        if (data.success) {
          this.toast(appLang === 'ro' ? 'Recenzie salvată!' : 'Review saved!', 'success');
          document.getElementById('reviewComment').value = '';
          this.renderReviews(App.currentDetailId);
        } else {
          this.toast(data.error || 'Failed', 'error');
        }
      } catch {
        this.toast('Error saving review', 'error');
      }
    },

    closeDetail() {
      this.els.detailModal.classList.remove('active');
      document.body.style.overflow = '';
      this.startHero();
    },

    renderSimilar(item) {
      if (!item || !contentCache?.categories) { this.els.similarGrid.innerHTML = ''; return; }
      const genreMatch = (item.genre||[])[0];
      if (!genreMatch) { this.els.similarGrid.innerHTML = ''; return; }
      const similar = [];
      for (const cat of contentCache.categories) {
        for (const i of (cat.items||[])) {
          if (i && i.id !== item.id && (i.genre||[]).some(g => g === genreMatch)) {
            similar.push(i);
            if (similar.length >= 4) break;
          }
        }
        if (similar.length >= 4) break;
      }
      this.els.similarGrid.innerHTML = similar.length === 0
        ? `<p style="color:var(--text-tertiary);font-size:13px;">${appLang === 'ro' ? 'Nu s-au găsit recomandări' : 'No recommendations found'}</p>`
        : similar.map(s => `<div class="similar-item" data-id="${s.id}" style="background:${s.bg_color||'#1e1e2e'}"><span>${s.title}</span></div>`).join('');
      this.els.similarGrid.querySelectorAll('.similar-item').forEach(el => {
        el.addEventListener('click', () => { this.closeDetail(); this.openDetail(el.dataset.id); });
      });
    },

    // ====== FULL PLAYER WITH REAL VIDEO (HLS.js / HTML5) ======
    async openPlayer(id) {
      this.stopHero();
      
      // Use the new Player module for real video playback
      if (window.Player) {
        const item = AnimaxiaData.findItem ? AnimaxiaData.findItem(id) : this.findItem(id);
        if (!item) {
          // Try to fetch from TMDB directly
          const parts = id.split('_');
          if (parts[0] === 'tmdb' && parts[1]) {
            const type = parts[2] === 'tv' ? 'tv' : 'movie';
            try {
              const res = await fetch(`/api/tmdb/${type}/${parts[1]}`);
              const data = await res.json();
              if (data && data.id) {
                const item = {
                  id, title: data.title || data.name,
                  year: (data.release_date || '').substring(0, 4),
                  genre: data.genres?.map(g => g.name) || [],
                  rating: data.vote_average ? `${data.vote_average.toFixed(1)}/10` : 'N/A',
                  description: data.overview || '',
                  bg_color: '#1e1e2e',
                  content_type: type,
                  vote_average: data.vote_average,
                  cast_members: data.credits?.cast?.slice(0, 5).map(c => c.name) || []
                };
                App.currentPlayerItemId = id;
                Player.play(item);
                return;
              }
            } catch {}
          }
          this.toast('Content not found', 'error');
          return;
        }
        App.currentPlayerItemId = id;
        Player.play(item);
        return;
      }
    },

    // ====== REAL VIDEO PLAYER (HTML5 + HLS.js) ======
    loadRealVideo(item, episode) {
      const frame = this.els.playerFrame;
      if (!frame) return;

      const title = episode?.title || item?.title || 'Conținut';
      const durationStr = episode?.duration || item?.duration || '45min';
      
      // Create real video element
      const existingVideo = document.getElementById('animaxiaVideoPlayer');
      if (existingVideo) existingVideo.remove();
      
      const video = document.createElement('video');
      video.id = 'animaxiaVideoPlayer';
      video.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#000;';
      video.crossOrigin = 'anonymous';
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      
      frame.innerHTML = '';
      frame.appendChild(video);

      // Try to get a real video source
      const trailerUrl = episode?.video_url || item?.trailer_url;
      
      if (trailerUrl) {
        // Check if it's an HLS stream
        if (trailerUrl.includes('.m3u8') && typeof Hls !== 'undefined' && Hls.isSupported()) {
          const hls = new Hls();
          hls.loadSource(trailerUrl);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            video.play().catch(() => {});
          });
          hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
              // Fallback to direct video
              video.src = trailerUrl;
              video.play().catch(() => {});
            }
          });
          window._hlsInstance = hls;
          this.setupRealPlayerEvents(video, durationStr);
          return;
        }
        
        // Direct video URL (mp4, webm, etc.)
        if (trailerUrl.includes('youtube.com') || trailerUrl.includes('youtu.be')) {
          // Use YouTube embed as fallback
          const videoId = trailerUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/)?.[1];
          if (videoId) {
            frame.innerHTML = `<iframe width="100%" height="100%" src="https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&enablejsapi=1" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
            return;
          }
        }
        
        video.src = trailerUrl;
        video.play().catch(() => {});
        this.setupRealPlayerEvents(video, durationStr);
      } else {
        // No video URL available - show content unavailable state
        this.showContentUnavailable(item, episode);
      }
    },

    setupRealPlayerEvents(video, durationStr) {
      const durMatch = durationStr.match(/(\d+)/);
      playerState.duration = durMatch ? parseInt(durMatch[1]) * 60 : 45 * 60;
      playerState.currentTime = 0;
      playerState.playing = true;

      video.addEventListener('loadedmetadata', () => {
        if (video.duration && isFinite(video.duration)) {
          playerState.duration = video.duration;
        }
      });

      video.addEventListener('timeupdate', () => {
        playerState.currentTime = video.currentTime;
        this.updatePlayerProgress();
        this.saveProgress();
      });

      video.addEventListener('play', () => {
        playerState.playing = true;
        this.updatePlayerUI();
      });

      video.addEventListener('pause', () => {
        playerState.playing = false;
        this.updatePlayerUI();
      });

      video.addEventListener('ended', () => {
        playerState.playing = false;
        this.updatePlayerUI();
        this.toast(appLang === 'ro' ? 'Redare finalizată' : 'Playback finished', 'success');
        
        // Auto-play next episode for series
        if (playerState.currentEpisode && playerState.episodesData?.length > 0) {
          const idx = playerState.episodesData.findIndex(e => e.id === playerState.currentEpisode.id);
          if (idx < playerState.episodesData.length - 1) {
            setTimeout(() => {
              const nextEp = playerState.episodesData[idx + 1];
              playerState.currentEpisode = nextEp;
              playerState.currentSeason = nextEp.season_number;
              const item = this.findItem(App.currentPlayerItemId);
              this.els.playerTitle.textContent = `${item?.title || ''} - ${appLang === 'ro' ? 'Episodul' : 'Episode'} ${nextEp.episode_number}`;
              this.loadRealVideo(item, nextEp);
              this.renderEpisodesPanel();
            }, 3000);
          }
        }
      });

      // Play/pause controls
      video.addEventListener('click', () => {
        if (this.els.playerControls) {
          this.els.playerControls.classList.toggle('visible');
          setTimeout(() => {
            if (this.els.playerControls) this.els.playerControls.classList.remove('visible');
          }, 3000);
        }
        this.playerPlayPause();
      });

      video.play().catch(() => {
        // Autoplay blocked - wait for user interaction
        playerState.playing = false;
        this.updatePlayerUI();
      });
    },

    // Try to search and play YouTube trailer as fallback
    showContentUnavailable(item, episode) {
      // Instead of showing 'not available', try to find and play a YouTube trailer
      const title = episode?.title || item?.title || '';
      const year = item?.year || '';
      const query = `${title} ${year} trailer`.trim();
      
      if (title && window.Player?.searchAndPlayTrailer) {
        // Use Player module to search YouTube and play the trailer
        window.Player.state.currentItem = item;
        window.Player.searchAndPlayTrailer(item);
        return;
      }
      
      // Last resort: show minimal info with retry button
      const frame = this.els.playerFrame;
      if (!frame) return;
      playerState.duration = 100;
      playerState.currentTime = 0;
      frame.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;background:linear-gradient(135deg,#0a0a0f,#1a1a2e);color:white;padding:40px;text-align:center;">
          <div style="font-size:64px;margin-bottom:16px;opacity:0.5;">🎬</div>
          <h2 style="font-size:20px;margin-bottom:8px;">${item?.title || 'Conținut'}</h2>
          <p style="color:var(--text-tertiary);font-size:14px;margin-bottom:16px;max-width:400px;">
            ${appLang === 'ro' 
              ? 'Căutăm o sursă video... Încearcă din nou.' 
              : 'Searching for a video source... Try again.'}
          </p>
          <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;">
            <button class="btn btn-primary" onclick="if(window.Player?.retryPlay) Player.retryPlay(); else App.closePlayer()" style="display:inline-flex;align-items:center;gap:8px;">
              <i class="fas fa-sync-alt"></i> ${appLang === 'ro' ? 'Încearcă din nou' : 'Retry'}
            </button>
            <button class="btn btn-secondary" onclick="App.closePlayer()" style="display:inline-flex;align-items:center;gap:8px;">
              <i class="fas fa-arrow-left"></i> ${appLang === 'ro' ? 'Înapoi' : 'Back'}
            </button>
          </div>
        </div>`;
      playerState.playing = false;
      this.updatePlayerUI();
    },

    async loadEpisodes(itemId) {
      try {
        const res = await fetch(`${API}/content/${itemId}/episodes`);
        const data = await res.json();
        if (data.success) {
          playerState.episodesData = data.data.episodes;
          playerState.seasonsData = data.data.seasons;
          const cw = userData?.continueWatching?.find(c => c.item_id === itemId);
          if (cw && cw.season_number) {
            playerState.currentSeason = cw.season_number;
            playerState.currentEpisode = playerState.episodesData.find(
              e => e.season_number === cw.season_number && e.episode_number === (cw.episode_number || 1)
            ) || playerState.episodesData[0];
          } else {
            playerState.currentEpisode = playerState.episodesData[0];
          }
          this.renderEpisodesPanel();
        }
      } catch {}
    },

    renderEpisodesPanel() {
      const panel = document.getElementById('playerEpisodesPanel');
      if (!panel) return;
      panel.style.display = 'block';
      panel.classList.add('open');
      
      const seasonSel = document.getElementById('seasonSelector');
      if (seasonSel) {
        seasonSel.innerHTML = playerState.seasonsData.map(s => 
          `<button class="season-btn ${s === playerState.currentSeason ? 'active' : ''}" data-season="${s}">${appLang === 'ro' ? 'Sezonul' : 'Season'} ${s}</button>`
        ).join('');
        seasonSel.querySelectorAll('.season-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            playerState.currentSeason = parseInt(btn.dataset.season);
            this.renderEpisodesPanel();
          });
        });
      }

      const list = document.getElementById('episodesList');
      if (!list) return;
      const seasonEps = playerState.episodesData.filter(e => e.season_number === playerState.currentSeason);
      list.innerHTML = seasonEps.map(ep => {
        const isActive = playerState.currentEpisode?.id === ep.id;
        return `<div class="episode-item ${isActive ? 'active' : ''}" data-episode-id="${ep.id}" data-season="${ep.season_number}" data-episode="${ep.episode_number}">
          <div class="episode-thumb" style="background:${ep.thumbnail_color || '#2d3436'}">📺</div>
          <div class="episode-info">
            <div class="episode-number">${appLang === 'ro' ? 'Episodul' : 'Episode'} ${ep.episode_number}</div>
            <div class="episode-title">${ep.title}</div>
            <div class="episode-desc">${ep.description || ''}</div>
            <div class="episode-duration">${ep.duration || ''}</div>
          </div>
        </div>`;
      }).join('');

      list.querySelectorAll('.episode-item').forEach(el => {
        el.addEventListener('click', () => {
          const ep = playerState.episodesData.find(e => e.id === parseInt(el.dataset.episodeId));
          if (ep) {
            playerState.currentEpisode = ep;
            playerState.currentSeason = ep.season_number;
            const item = this.findItem(App.currentPlayerItemId);
            this.els.playerTitle.textContent = `${item?.title || ''} - ${appLang === 'ro' ? 'Episodul' : 'Episode'} ${ep.episode_number}`;
            this.loadVideo(item, ep);
            this.renderEpisodesPanel();
          }
        });
      });
    },

    loadVideo(item, episode) {
      const frame = this.els.playerFrame;
      if (!frame) return;

      const trailerUrl = episode?.video_url || item?.trailer_url;
      
      if (trailerUrl && trailerUrl.includes('youtube')) {
        const videoId = trailerUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/)?.[1];
        if (videoId) {
          frame.innerHTML = `<iframe width="100%" height="100%" src="https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&enablejsapi=1" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
          playerState.playing = true;
          playerState.duration = 120;
          playerState.currentTime = 0;
          this.updatePlayerProgress();
          this.updatePlayerUI();
          return;
        }
      }
      
      // No video URL available - search YouTube trailer
      this.showContentUnavailable(item, episode);
    },

    updatePlayerProgress() {
      const pct = playerState.duration > 0 ? (playerState.currentTime / playerState.duration) * 100 : 0;
      const fill = document.getElementById('playerProgressFill');
      if (fill) fill.style.width = Math.min(pct, 100) + '%';
      
      const timeDisplay = document.getElementById('playerTimeDisplay');
      if (timeDisplay) {
        const formatTime = (s) => {
          const m = Math.floor(s / 60);
          const sec = Math.floor(s % 60);
          return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
        };
        timeDisplay.textContent = `${formatTime(playerState.currentTime)} / ${formatTime(playerState.duration)}`;
      }
    },

    updatePlayerUI() {
      const playBtn = document.getElementById('playerPlayBtn');
      if (playBtn) {
        playBtn.innerHTML = playerState.playing ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
      }
      const speedBtn = document.getElementById('playerSpeedBtn');
      if (speedBtn) speedBtn.textContent = `${playerState.speed}x`;
      const speedDisplay = document.getElementById('playerSpeedDisplay');
      if (speedDisplay) speedDisplay.textContent = `${playerState.speed}x`;
      const volBtn = document.getElementById('playerVolumeBtn');
      if (volBtn) {
        volBtn.innerHTML = playerState.volume === 0 ? '<i class="fas fa-volume-mute"></i>' : 
          playerState.volume < 50 ? '<i class="fas fa-volume-down"></i>' : '<i class="fas fa-volume-up"></i>';
      }
      const volRange = document.getElementById('playerVolumeRange');
      if (volRange) volRange.value = playerState.volume;
    },

    saveProgress() {
      if (!currentProfile || !App.currentPlayerItemId) return;
      if (Math.floor(playerState.currentTime) < 5 || Math.floor(playerState.currentTime) % 10 !== 0) return;
      const pct = playerState.duration > 0 ? Math.round((playerState.currentTime / playerState.duration) * 100) : 0;
      fetch(`${API}/user/${currentProfile.id}/continue`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          itemId: App.currentPlayerItemId, progress: pct,
          episode: playerState.currentEpisode ? `S${playerState.currentSeason}:E${playerState.currentEpisode.episode_number}` : '',
          seasonNumber: playerState.currentSeason,
          episodeNumber: playerState.currentEpisode?.episode_number || 1
        })
      }).catch(() => {});
    },

    closePlayer() {
      this.els.playerModal.classList.remove('active');
      document.body.style.overflow = '';
      // Player module manages its own progress intervals
      const iframe = this.els.playerFrame?.querySelector('iframe');
      if (iframe) { iframe.src = ''; }
      this.els.playerFrame.innerHTML = '<div class="player-placeholder"><div class="player-pulse"></div><i class="fas fa-play-circle player-play-icon"></i><p>' + (appLang === 'ro' ? 'Player gata' : 'Player ready') + '</p></div>';
      const fill = document.getElementById('playerProgressFill');
      if (fill) fill.style.width = '0%';
      document.getElementById('playerEpisodesPanel').style.display = 'none';
      this.startHero();
    },

    // ====== PLAYER CONTROLS ======
    playerPlayPause() {
      playerState.playing = !playerState.playing;
      // Show big play icon briefly
      const bigPlay = document.getElementById('playerBigPlayBtn2') || document.getElementById('playerBigPlayBtn');
      if (bigPlay && !playerState.playing) {
        bigPlay.style.display = 'block';
        bigPlay.style.opacity = '0.6';
        setTimeout(() => { bigPlay.style.opacity = '0'; }, 1500);
      }
      this.updatePlayerUI();
    },

    playerRewind() {
      playerState.currentTime = Math.max(0, playerState.currentTime - 10);
      this.updatePlayerProgress();
      this.showSeekIndicator(appLang === 'ro' ? 'Înapoi 10s' : 'Back 10s');
    },

    playerForward() {
      playerState.currentTime = Math.min(playerState.duration, playerState.currentTime + 10);
      this.updatePlayerProgress();
      this.showSeekIndicator(appLang === 'ro' ? 'Înainte 10s' : 'Forward 10s');
    },

    showSeekIndicator(text) {
      let indicator = document.getElementById('seekIndicator');
      if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'seekIndicator';
        indicator.className = 'seek-indicator';
        document.getElementById('playerScreen')?.appendChild(indicator);
      }
      indicator.textContent = text;
      indicator.classList.remove('seek-hide');
      indicator.classList.add('seek-show');
      clearTimeout(indicator._hideTimer);
      indicator._hideTimer = setTimeout(() => {
        indicator.classList.remove('seek-show');
        indicator.classList.add('seek-hide');
      }, 800);
    },

    playerPrev() {
      if (playerState.currentEpisode && playerState.episodesData?.length > 0) {
        const idx = playerState.episodesData.findIndex(e => e.id === playerState.currentEpisode.id);
        if (idx > 0) {
          const prevEp = playerState.episodesData[idx - 1];
          playerState.currentEpisode = prevEp;
          playerState.currentSeason = prevEp.season_number;
          const item = this.findItem(App.currentPlayerItemId);
          this.els.playerTitle.textContent = `${item?.title || ''} - ${appLang === 'ro' ? 'Episodul' : 'Episode'} ${prevEp.episode_number}`;
          this.loadVideo(item, prevEp);
          this.renderEpisodesPanel();
        }
      }
    },

    playerNext() {
      if (playerState.currentEpisode && playerState.episodesData?.length > 0) {
        const idx = playerState.episodesData.findIndex(e => e.id === playerState.currentEpisode.id);
        if (idx < playerState.episodesData.length - 1) {
          const nextEp = playerState.episodesData[idx + 1];
          playerState.currentEpisode = nextEp;
          playerState.currentSeason = nextEp.season_number;
          const item = this.findItem(App.currentPlayerItemId);
          this.els.playerTitle.textContent = `${item?.title || ''} - ${appLang === 'ro' ? 'Episodul' : 'Episode'} ${nextEp.episode_number}`;
          this.loadVideo(item, nextEp);
          this.renderEpisodesPanel();
        }
      }
    },

    playerSetVolume(vol) {
      playerState.volume = parseInt(vol);
      this.updatePlayerUI();
    },

    playerToggleMute() {
      playerState.volume = playerState.volume > 0 ? 0 : 80;
      if (playerState.volume > 0) {
        const range = document.getElementById('playerVolumeRange');
        if (range) range.value = playerState.volume;
      }
      this.updatePlayerUI();
    },

    playerCycleSpeed() {
      const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
      const idx = speeds.indexOf(playerState.speed);
      playerState.speed = speeds[(idx + 1) % speeds.length];
      this.updatePlayerUI();
      this.toast(`⚡ ${playerState.speed}x`, 'info');
    },

    playerToggleFullscreen() {
      const screen = document.getElementById('playerScreen');
      if (!screen) return;
      if (!document.fullscreenElement) {
        screen.requestFullscreen?.().catch(() => {});
        playerState.isFullscreen = true;
        document.getElementById('playerFullscreenBtn').innerHTML = '<i class="fas fa-compress"></i>';
      } else {
        document.exitFullscreen?.().catch(() => {});
        playerState.isFullscreen = false;
        document.getElementById('playerFullscreenBtn').innerHTML = '<i class="fas fa-expand"></i>';
      }
    },

    playerSeek(e) {
      const bar = document.getElementById('playerProgressBar');
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      playerState.currentTime = pct * playerState.duration;
      this.updatePlayerProgress();
    },

    // ====== X-RAY OVERLAY (Premium Feature) ======
    toggleXRay() {
      if (!App.currentPlayerItemId) return;
      const panel = document.getElementById('xrayPanel');
      if (!panel) return;
      playerState.xrayOpen = !playerState.xrayOpen;
      panel.classList.toggle('active', playerState.xrayOpen);
      
      if (playerState.xrayOpen && !playerState.xrayData) {
        const item = this.findItem(App.currentPlayerItemId);
        if (item) {
          playerState.xrayData = item;
          const castList = document.getElementById('xrayCast');
          const triviaList = document.getElementById('xrayTrivia');
          const soundtrackList = document.getElementById('xraySoundtrack');
          
          if (castList) {
            castList.innerHTML = (item.cast_members || []).length > 0
              ? item.cast_members.map(actor => 
                `<div class="xray-cast-item">
                  <div class="xray-cast-avatar" style="background:${item.bg_color||'#6c5ce7'}">${actor[0]}</div>
                  <div>
                    <div class="xray-cast-name">${actor}</div>
                    <div class="xray-cast-role">${actor.split(' ').pop()}</div>
                  </div>
                </div>`
              ).join('')
              : `<div class="xray-empty">${appLang === 'ro' ? 'Distribuție momentan indisponibilă' : 'Cast info unavailable'}</div>`;
          }
          
          const trivia = [
            { icon: '🎬', text: `${appLang === 'ro' ? 'Filmări în' : 'Filmed in'} ${item.year || '2025'}` },
            { icon: '⭐', text: `${appLang === 'ro' ? 'Rating' : 'Rating'}: ${item.rating || 'N/A'}` },
            { icon: '🎯', text: `${appLang === 'ro' ? 'Gen' : 'Genre'}: ${(item.genre || []).join(', ')}` },
          ];
          if (triviaList) {
            triviaList.innerHTML = trivia.map(t => 
              `<div class="xray-trivia-item"><span class="xray-trivia-icon">${t.icon}</span><span>${t.text}</span></div>`
            ).join('');
          }
          
          const soundtracks = [
            `${appLang === 'ro' ? 'Coloana sonoră originală' : 'Original Soundtrack'}`,
            `${appLang === 'ro' ? 'Muzică de' : 'Music by'} ${(item.cast_members || ['Compozitor'])[0] || 'Compozitor'}`,
          ];
          if (soundtrackList) {
            soundtrackList.innerHTML = soundtracks.map(s => 
              `<div class="xray-trivia-item"><span class="xray-trivia-icon">🎵</span><span>${s}</span></div>`
            ).join('');
          }
        }
      }
    },

    // ====== SHUFFLE PLAY (Netflix-style) ======
    playShuffle() {
      const items = [];
      if (contentCache?.categories) {
        for (const cat of contentCache.categories) {
          for (const item of (cat.items||[])) {
            if (item) items.push(item);
          }
        }
      }
      if (contentCache?.featured) items.push(...contentCache.featured);
      
      if (items.length === 0) {
        this.toast(appLang === 'ro' ? 'Nu există conținut disponibil' : 'No content available', 'error');
        return;
      }
      
      // Filter out what user already watched
      const watched = userData?.continueWatching?.map(c => c.item_id) || [];
      const unwatched = items.filter(i => !watched.includes(i.id));
      const pool = unwatched.length > 0 ? unwatched : items;
      
      const randomItem = pool[Math.floor(Math.random() * pool.length)];
      this.toast(`🔀 ${appLang === 'ro' ? 'Redare aleatorie' : 'Shuffle play'}: ${randomItem.title}`, 'info');
      setTimeout(() => this.openPlayer(randomItem.id), 800);
    },

    // ====== PICTURE-IN-PICTURE ======
    togglePiP() {
      const screen = document.getElementById('playerScreen');
      if (!screen) return;
      
      // Listen for PiP close events (persistent listener)
      if (!this._pipListenerAttached) {
        document.addEventListener('leavepictureinpicture', () => {
          playerState.pipActive = false;
          const btn = document.getElementById('playerPipBtn');
          if (btn) btn.innerHTML = '<i class="fas fa-window-restore"></i>';
        });
        this._pipListenerAttached = true;
      }
      
      if (playerState.pipActive) {
        document.exitPictureInPicture?.().catch(() => {});
        playerState.pipActive = false;
        document.getElementById('playerPipBtn').innerHTML = '<i class="fas fa-compress"></i>';
        this.toast('PiP dezactivat', 'info');
      } else if (document.pictureInPictureElement) {
        document.exitPictureInPicture?.().catch(() => {});
      } else if (document.pictureInPictureEnabled) {
        // Create a hidden video element for PiP
        let pipVideo = document.getElementById('pipVideoElement');
        if (!pipVideo) {
          pipVideo = document.createElement('video');
          pipVideo.id = 'pipVideoElement';
          pipVideo.style.display = 'none';
          pipVideo.muted = true;
          pipVideo.loop = true;
          // Generate a colorful animated canvas as fake video source
          const canvas = document.createElement('canvas');
          canvas.width = 320;
          canvas.height = 180;
          const ctx = canvas.getContext('2d');
          let hue = 0;
          function animateCanvas() {
            hue = (hue + 0.5) % 360;
            const gradient = ctx.createLinearGradient(0, 0, 320, 180);
            gradient.addColorStop(0, `hsl(${hue}, 70%, 60%)`);
            gradient.addColorStop(1, `hsl(${(hue + 60) % 360}, 70%, 60%)`);
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 320, 180);
            ctx.fillStyle = 'white';
            ctx.font = 'bold 14px Inter, sans-serif';
            ctx.textAlign = 'center';
            const item = this.findItem(App.currentPlayerItemId);
            const title = item?.title || 'Animaxia';
            ctx.fillText(title, 160, 95);
            ctx.font = '12px Inter';
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.fillText(appLang === 'ro' ? 'Redare în curs...' : 'Now playing...', 160, 115);
            pipVideo._animFrame = requestAnimationFrame(animateCanvas);
          }
          animateCanvas();
          const stream = canvas.captureStream(30);
          pipVideo.srcObject = stream;
          document.body.appendChild(pipVideo);
        }
        pipVideo.play();
        pipVideo.requestPictureInPicture?.().then(() => {
          playerState.pipActive = true;
          document.getElementById('playerPipBtn').innerHTML = '<i class="fas fa-window-close"></i>';
          this.toast('📺 Picture-in-Picture activat', 'success');
        }).catch(err => {
          this.toast('PiP nu este suportat în acest browser', 'error');
        });
      } else {
        this.toast(appLang === 'ro' ? 'PiP nu este suportat' : 'PiP not supported', 'error');
      }
    },

    // ====== QUALITY SELECTOR ======
    setQuality(quality) {
      playerState.quality = quality;
      const qualityMap = {
        'auto': { label: appLang === 'ro' ? 'Auto' : 'Auto', icon: '🔄' },
        '1080p': { label: '1080p', icon: '📺' },
        '720p': { label: '720p', icon: '📱' },
        '480p': { label: '480p', icon: '💻' },
        '360p': { label: '360p', icon: '📡' },
      };
      const q = qualityMap[quality] || qualityMap['auto'];
      this.toast(`${q.icon} ${appLang === 'ro' ? 'Calitate' : 'Quality'}: ${q.label}`, 'info');
      document.getElementById('playerQualitySelect')?.querySelectorAll('option').forEach(opt => {
        opt.selected = opt.value === quality;
      });
    },

    // ====== AUTO-PLAY PREVIEW ON HOVER (Netflix-style) ======
    initCardPreviews() {
      document.querySelectorAll('.content-card').forEach(card => {
        card.addEventListener('mouseenter', () => this.startCardPreview(card));
        card.addEventListener('mouseleave', () => this.stopCardPreview(card));
      });
    },

    startCardPreview(card) {
      if (playerState.previewTimer) {
        clearTimeout(playerState.previewTimer);
      }
      playerState.previewTimer = setTimeout(() => {
        const imageEl = card.querySelector('.content-card-image');
        if (!imageEl) return;
        const id = card.dataset.id;
        const item = this.findItem(id);
        if (!item) return;
        
        // Add preview animation effect
        imageEl.classList.add('card-preview-active');
        
        // Show a shimmer-like animated overlay
        let existing = imageEl.querySelector('.card-preview-overlay');
        if (!existing) {
          const overlay = document.createElement('div');
          overlay.className = 'card-preview-overlay';
          overlay.innerHTML = `
            <div class="card-preview-bars">
              ${'<span></span>'.repeat(8)}
            </div>
            <div class="card-preview-info">
              <span class="card-preview-match"><i class="fas fa-thumbs-up"></i> ${item.match_rating || '95%'}</span>
              <span class="card-preview-year">${item.year || ''}</span>
              <span class="card-preview-dot">•</span>
              <span>${item.duration || ''}</span>
            </div>
            <div class="card-preview-progress">
              <div class="card-preview-bar" style="width:${Math.floor(Math.random() * 80 + 10)}%"></div>
            </div>
          `;
          imageEl.appendChild(overlay);
        } else {
          existing.style.display = '';
        }
      }, 600); // Delay before showing preview like Netflix
    },

    stopCardPreview(card) {
      if (playerState.previewTimer) {
        clearTimeout(playerState.previewTimer);
        playerState.previewTimer = null;
      }
      const imageEl = card.querySelector('.content-card-image');
      if (imageEl) {
        imageEl.classList.remove('card-preview-active');
        const overlay = imageEl.querySelector('.card-preview-overlay');
        if (overlay) overlay.style.display = 'none';
      }
    },

    // ====== KEYBOARD SHORTCUTS (Netflix-style) ======
    initKeyboardShortcuts() {
      document.addEventListener('keydown', (e) => {
        // Don't trigger if typing in input
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        
        const modal = document.getElementById('playerModal');
        const isPlayerOpen = modal?.classList.contains('active');
        
        if (!isPlayerOpen) {
          // Global shortcuts
          if (e.key === ' ' && e.target === document.body) {
            e.preventDefault();
            // Toggle play on hero
            const playerBtn = document.getElementById('heroPlayBtn');
            if (currentHeroItem) playerBtn?.click();
          }
          if (e.key === 's' || e.key === 'S') {
            // Open search
            this.openSearch?.();
          }
          if (e.key === 'Escape') {
            this.closeAll();
          }
          return;
        }
        
        // Player shortcuts
        switch (e.key) {
          case ' ':
          case 'k':
          case 'K':
            e.preventDefault();
            this.playerPlayPause();
            break;
          case 'f':
          case 'F':
            this.playerToggleFullscreen();
            break;
          case 'm':
          case 'M':
            this.playerToggleMute();
            break;
          case 'ArrowLeft':
            e.preventDefault();
            this.playerRewind();
            break;
          case 'ArrowRight':
            e.preventDefault();
            this.playerForward();
            break;
          case 'ArrowUp':
            e.preventDefault();
            const newVol = Math.min(100, playerState.volume + 10);
            this.playerSetVolume(newVol);
            this.toast(`🔊 ${appLang === 'ro' ? 'Volum' : 'Volume'}: ${newVol}%`, 'info');
            break;
          case 'ArrowDown':
            e.preventDefault();
            const newVolD = Math.max(0, playerState.volume - 10);
            this.playerSetVolume(newVolD);
            this.toast(`🔉 ${appLang === 'ro' ? 'Volum' : 'Volume'}: ${newVolD}%`, 'info');
            break;
          case 'Escape':
            if (playerState.xrayOpen) {
              this.toggleXRay();
            } else {
              this.closePlayer();
            }
            break;
          case 'i':
          case 'I':
            this.toggleXRay();
            break;
          case 'p':
          case 'P':
            this.togglePiP();
            break;
          case 't':
          case 'T':
            this.playerToggleSubtitles();
            break;
          case '>':
          case '.':
            // Increase speed
            this.playerCycleSpeed();
            break;
          case '<':
          case ',':
            // Decrease speed
            const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
            let idx = speeds.indexOf(playerState.speed);
            if (idx > 0) {
              playerState.speed = speeds[idx - 1];
              this.updatePlayerUI();
              this.toast(`⚡ ${playerState.speed}x`, 'info');
            }
            break;
          case 'n':
          case 'N':
            this.playerNext();
            break;
          case 'b':
          case 'B':
            this.playerPrev();
            break;
          case '0': case '1': case '2': case '3': case '4':
          case '5': case '6': case '7': case '8': case '9':
            // Seek to percentage
            const pct = parseInt(e.key) / 10;
            playerState.currentTime = pct * playerState.duration;
            this.updatePlayerProgress();
            this.showSeekIndicator(`${parseInt(e.key) * 10}%`);
            break;
        }
      });
    },

    playerToggleEpisodes() {
      const panel = document.getElementById('playerEpisodesPanel');
      if (panel) panel.classList.toggle('open');
    },

    playerToggleSubtitles() {
      playerState.subtitlesOn = !playerState.subtitlesOn;
      document.getElementById('playerSubtitlesBtn')?.classList.toggle('active', playerState.subtitlesOn);
      
      // Manage real HTML5 video track elements for subtitles
      const video = document.getElementById('animaxiaVideoPlayer');
      if (video) {
        let track = video.querySelector('track[data-animaxia-subtitle]');
        if (playerState.subtitlesOn) {
          if (!track) {
            track = document.createElement('track');
            track.kind = 'subtitles';
            track.label = appLang === 'ro' ? 'Română' : 'English';
            track.srclang = appLang === 'ro' ? 'ro' : 'en';
            track.setAttribute('data-animaxia-subtitle', 'true');
            
            // Load subtitles from server-generated VTT
            const contentId = App.currentPlayerItemId || 'default';
            const langPath = appLang === 'ro' ? 'ro' : 'en';
            track.src = `${API}/subtitles/${contentId}/${langPath}`;
            
            video.appendChild(track);
            track.onload = () => {
              // Make sure track is selected
              for (let i = 0; i < video.textTracks.length; i++) {
                video.textTracks[i].mode = i === video.textTracks.length - 1 ? 'showing' : 'hidden';
              }
            };
          } else {
            // Show existing track
            for (let i = 0; i < video.textTracks.length; i++) {
              const t = video.textTracks[i];
              t.mode = t.label === track.label ? 'showing' : 'hidden';
            }
          }
        } else {
          // Hide all tracks
          if (track) {
            for (let i = 0; i < video.textTracks.length; i++) {
              video.textTracks[i].mode = 'hidden';
            }
          }
        }
      }
      
      this.toast(playerState.subtitlesOn ? 
        (appLang === 'ro' ? 'Subtitrări activate' : 'Subtitles on') : 
        (appLang === 'ro' ? 'Subtitrări dezactivate' : 'Subtitles off'), 'info');
    },

    // ====== OFFLINE DOWNLOAD (IndexedDB) ======
    async downloadOffline(itemId) {
      if (!currentProfile) {
        this.toast(appLang === 'ro' ? 'Selectează un profil' : 'Select a profile', 'error');
        return;
      }
      
      const item = this.findItem(itemId);
      if (!item) {
        this.toast('Content not found', 'error');
        return;
      }
      
      this.toast(appLang === 'ro' ? '📥 Se pregătește descărcarea...' : '📥 Preparing download...', 'info');
      
      try {
        // Store content metadata in IndexedDB
        const metadata = {
          title: item.title,
          title_en: item.title_en,
          year: item.year,
          duration: item.duration,
          genre: item.genre,
          bg_color: item.bg_color,
          content_type: item.content_type,
          description: item.description,
          thumbnail_url: item.thumbnail_url || ''
        };
        
        await storeOfflineContent(itemId, metadata);
        
        // Also start server-side download queue
        try {
          await fetch(`${API}/user/${currentProfile.id}/downloads`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ itemId })
          });
        } catch {}
        
        this.toast(`📥 ${appLang === 'ro' ? 'Salvat pentru vizionare offline!' : 'Saved for offline viewing!'}`, 'success');
        
        // Update downloads screen if open
        if (document.getElementById('downloads-screen')?.style.display !== 'none') {
          this.renderDownloads();
        }
      } catch (e) {
        this.toast(appLang === 'ro' ? 'Eroare la descărcare' : 'Download error', 'error');
      }
    },

    // ====== WATCHLIST ======
    async toggleWatchlist(itemId, cardEl) {
      if (!itemId || !currentProfile) { this.toast(appLang === 'ro' ? 'Selectează un profil' : 'Select a profile', 'error'); return; }
      const btns = document.querySelectorAll(`.content-card[data-id="${itemId}"] .add-btn`);
      btns.forEach(b => { if (b) b.style.opacity = '0.5'; });
      try {
        const res = await fetch(`${API}/user/${currentProfile.id}/watchlist/toggle`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}) },
          body: JSON.stringify({ itemId })
        });
        const data = res.ok ? await res.json() : null;
        const inList = data?.success !== undefined ? data.inList : !((userData?.myList||[]).includes(itemId));
        if (!userData) userData = { myList: [] };
        if (!userData.myList) userData.myList = [];
        if (inList) { if (!userData.myList.includes(itemId)) userData.myList.push(itemId); }
        else { userData.myList = userData.myList.filter(id => id !== itemId); }
        this.updateWatchlistUI(itemId, inList);
        this.toast(inList ? (appLang === 'ro' ? 'Adăugat în lista mea!' : 'Added to my list!') : (appLang === 'ro' ? 'Șters din lista mea' : 'Removed from my list'), inList ? 'success' : 'info');
      } catch {
        const inList = !((userData?.myList||[]).includes(itemId));
        if (!userData) userData = { myList: [] };
        if (!userData.myList) userData.myList = [];
        if (inList) { userData.myList.push(itemId); } else { userData.myList = userData.myList.filter(id => id !== itemId); }
        this.updateWatchlistUI(itemId, inList);
      } finally { btns.forEach(b => { if (b) b.style.opacity = ''; }); }
    },

    updateWatchlistUI(itemId, inList) {
      if (this.els.heroAdd && currentHeroItem && currentHeroItem.id === itemId) {
        this.els.heroAdd.innerHTML = inList ? '<i class="fas fa-check"></i>' : '<i class="fas fa-plus"></i>';
        this.els.heroAdd.classList.toggle('in-list', inList);
      }
      document.querySelectorAll(`.content-card[data-id="${itemId}"]`).forEach(c => {
        const btn = c.querySelector('.add-btn');
        if (btn) btn.innerHTML = `<i class="fas ${inList?'fa-check':'fa-plus'}"></i>`;
      });
    },

    // ====== MY LIST PAGE ======
    async renderMyList() {
      const grid = document.getElementById('myListGrid');
      const count = document.getElementById('myListCount');
      if (!grid) return;

      let items = [];
      try {
        const res = await fetch(`${API}/user/${currentProfile.id}/my-list`);
        const data = await res.json();
        if (data.success) items = data.data;
      } catch {}

      const genreFilter = document.getElementById('myListGenreFilter')?.value;
      const typeFilter = document.getElementById('myListTypeFilter')?.value;
      const sortFilter = document.getElementById('myListSortFilter')?.value;

      if (genreFilter) items = items.filter(i => i.genre?.includes(genreFilter));
      if (typeFilter) items = items.filter(i => i.content_type === typeFilter);
      
      if (sortFilter === 'title') items.sort((a, b) => a.title?.localeCompare(b.title));
      else if (sortFilter === 'year') items.sort((a, b) => (b.year||'').localeCompare(a.year||''));
      else items.sort((a, b) => (a.id||'').localeCompare(b.id||''));

      if (count) count.textContent = `${items.length} ${appLang === 'ro' ? 'iteme' : 'items'}`;
      
      if (items.length === 0) {
        grid.innerHTML = `<div class="my-list-empty">
          <i class="fas fa-bookmark"></i>
          <h3>${appLang === 'ro' ? 'Lista ta este goală' : 'Your list is empty'}</h3>
          <p>${appLang === 'ro' ? 'Adaugă filme și seriale din pagina principală' : 'Add movies and series from the homepage'}</p>
          <button class="btn btn-primary" onclick="App.showScreen('app'); App.toast('${appLang === 'ro' ? 'Navighează conținut' : 'Browse content'}', 'info')" style="margin-top:16px;">
            <i class="fas fa-compass"></i> ${appLang === 'ro' ? 'Descoperă conținut' : 'Discover content'}
          </button>
        </div>`;
        return;
      }

      grid.innerHTML = items.map(item => 
        `<div class="content-card" data-id="${item.id}" onclick="App.openDetail('${item.id}')">
          <div class="content-card-image" style="background:${item.bg_color||'#1e1e2e'}">
            <span class="card-badge ${item.content_type||'movie'}">${item.content_type==='series'?(appLang==='ro'?'Serial':'Series'):(appLang==='ro'?'Film':'Movie')}</span>
            <span class="card-image-icon">🎬</span>
          </div>
          <div class="content-card-info">
            <div class="content-card-title">${item.title}</div>
            <div class="content-card-meta">
              <span>${item.year}</span><span class="content-card-dot">•</span><span>${item.duration}</span>
            </div>
            <button class="btn btn-secondary" style="padding:4px 10px;font-size:11px;margin-top:6px;" onclick="event.stopPropagation(); App.toggleWatchlist('${item.id}')">
              <i class="fas fa-trash"></i> ${appLang === 'ro' ? 'Șterge' : 'Remove'}
            </button>
          </div>
        </div>`
      ).join('');
    },

    // ====== SEARCH ======
    async search(q) {
      if (!q || q.length < 1) {
        this.els.searchResults.innerHTML = '';
        const hints = document.querySelector('.search-hints');
        if (hints) hints.style.display = '';
        return;
      }
      const hints = document.querySelector('.search-hints');
      if (hints) hints.style.display = 'none';
      let results = [];
      try {
        const res = await fetch(`${API}/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (data.success && data.results) results = data.results;
      } catch {
        if (contentCache?.categories) {
          for (const cat of contentCache.categories) {
            for (const item of (cat.items||[])) {
              if (item && (item.title?.toLowerCase().includes(q.toLowerCase()) || 
                  (item.genre||[]).some(g => g.toLowerCase().includes(q.toLowerCase())))) {
                results.push(item);
              }
            }
          }
        }
      }
      this.els.searchResults.innerHTML = results.length === 0
        ? `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-tertiary);">
            <i class="fas fa-search" style="font-size:40px;display:block;margin-bottom:16px;opacity:0.3;"></i>
            <p>${appLang === 'ro' ? 'Nu am găsit rezultate pentru' : 'No results for'} "${q}"</p></div>`
        : results.slice(0,20).map(item => this.searchResultCard(item)).join('');
      this.els.searchResults.querySelectorAll('.search-result').forEach(c => {
        c.addEventListener('click', () => { this.closeSearch(); this.openDetail(c.dataset.id); });
      });
    },

    searchResultCard(item) {
      return `<div class="content-card search-result" data-id="${item.id}">
        <div class="content-card-image" style="background:${item.bg_color||'#1e1e2e'};height:100px;">
          <span class="card-badge ${item.content_type||'movie'}">${item.content_type==='series'?'Serial':'Film'}</span>
          <span class="card-image-icon" style="font-size:28px;">🎬</span>
        </div>
        <div class="content-card-info">
          <div class="content-card-title">${item.title}</div>
          <div class="content-card-meta"><span>${item.year}</span></div>
        </div>
      </div>`;
    },

    async searchAdvanced() {
      const q = document.getElementById('searchPageInput')?.value;
      const genre = document.getElementById('sfGenre')?.value;
      const type = document.getElementById('sfType')?.value;
      const yearFrom = document.getElementById('sfYearFrom')?.value;
      const sort = document.getElementById('sfSort')?.value;
      const grid = document.getElementById('searchPageResults');
      const stats = document.getElementById('searchStats');
      if (!grid) return;

      let params = new URLSearchParams();
      if (q) params.set('q', q);
      if (genre) params.set('genre', genre);
      if (type) params.set('type', type);
      if (yearFrom) params.set('yearFrom', yearFrom);
      if (sort) params.set('sort', sort);

      try {
        const res = await fetch(`${API}/search?${params.toString()}`);
        const data = await res.json();
        if (data.success) {
          if (stats) stats.textContent = `${data.total} ${appLang === 'ro' ? 'rezultate' : 'results'}`;
          grid.innerHTML = data.results.length === 0
            ? `<div class="my-list-empty"><i class="fas fa-search"></i><h3>${appLang === 'ro' ? 'Nu am găsit rezultate' : 'No results found'}</h3></div>`
            : data.results.map(item => 
              `<div class="content-card" data-id="${item.id}" onclick="App.openDetail('${item.id}')">
                <div class="content-card-image" style="background:${item.bg_color||'#1e1e2e'}">
                  <span class="card-badge ${item.content_type||'movie'}">${item.content_type==='series'?'Serial':'Film'}</span>
                  <span class="card-image-icon">🎬</span>
                </div>
                <div class="content-card-info">
                  <div class="content-card-title">${item.title}</div>
                  <div class="content-card-meta"><span>${item.year}</span><span class="content-card-dot">•</span><span>${item.duration}</span></div>
                </div>
              </div>`
            ).join('');
        }
      } catch {}
    },

    openSearch() {
      this.els.searchOverlay?.classList.add('active');
      setTimeout(() => this.els.searchInput?.focus(), 100);
    },

    closeSearch() {
      this.els.searchOverlay?.classList.remove('active');
      if (this.els.searchInput) this.els.searchInput.value = '';
      if (this.els.searchResults) this.els.searchResults.innerHTML = '';
      const hints = document.querySelector('.search-hints');
      if (hints) hints.style.display = '';
    },

    // ====== NOTIFICATIONS ======
    updateNotifBadge() {
      const notifs = contentCache?.notifications || [];
      const unread = notifs.filter(n => !n.is_read).length;
      if (this.els.notifBadge) this.els.notifBadge.textContent = unread;
    },

    async renderNotifications() {
      const list = document.getElementById('notificationsList');
      if (!list) return;
      try {
        const res = await fetch(`${API}/notifications`);
        const data = await res.json();
        if (data.success) {
          list.innerHTML = data.data.length === 0
            ? `<div class="my-list-empty"><i class="fas fa-bell"></i><h3>${appLang === 'ro' ? 'Nu ai notificări' : 'No notifications'}</h3></div>`
            : data.data.map(n => `
              <div class="notif-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}">
                <div class="notif-icon ${n.type}">${this.notifIcon(n.type)}</div>
                <div class="notif-body">
                  <div class="notif-message">${n.message}</div>
                  <div class="notif-time">${n.time_ago || ''}</div>
                </div>
                <div class="notif-actions">
                  ${n.is_read ? '' : `<button class="notif-action-btn" onclick="App.markNotifRead('${n.id}')" title="Mark read"><i class="fas fa-check"></i></button>`}
                  <button class="notif-action-btn danger" onclick="App.deleteNotif('${n.id}')" title="Delete"><i class="fas fa-trash"></i></button>
                </div>
              </div>
            `).join('');
        }
      } catch {}
    },

    notifIcon(type) {
      const icons = {
        'new': '<i class="fas fa-plus-circle"></i>', 'new_episode': '<i class="fas fa-tv"></i>',
        'recommendation': '<i class="fas fa-thumbs-up"></i>', 'continue': '<i class="fas fa-play"></i>',
        'offer': '<i class="fas fa-tag"></i>', 'system': '<i class="fas fa-cog"></i>',
        'kids': '<i class="fas fa-child"></i>', 'info': '<i class="fas fa-info"></i>'
      };
      return icons[type] || '<i class="fas fa-bell"></i>';
    },

    async markNotifRead(id) {
      try {
        await fetch(`${API}/notifications/${id}/read`, { method: 'POST' });
        this.renderNotifications();
      } catch {}
    },

    async deleteNotif(id) {
      try {
        await fetch(`${API}/notifications/${id}/delete`, { method: 'POST' });
        this.renderNotifications();
      } catch {}
    },

    async markAllNotifsRead() {
      try {
        await fetch(`${API}/notifications/read-all`, { method: 'POST' });
        this.renderNotifications();
        this.toast(appLang === 'ro' ? 'Toate notificările au fost citite' : 'All notifications read', 'success');
      } catch {}
    },

    // ====== GUIDE ======
    openGuide() {
      const programs = contentCache?.programs || [];
      const channels = contentCache?.channels || [];
      if (!this.els.channelGuide) return;
      this.els.guideContent.innerHTML = channels.map(ch => {
        const progs = programs.filter(p => p.channel_id === ch.id).slice(0,4);
        return `<div class="channel-guide-row">
          <div class="channel-guide-info" style="background:${ch.bg_color||'#e17055'}">
            <span class="channel-guide-name">${ch.name}</span>
            <span class="channel-guide-category">${ch.category}</span>
          </div>
          <div class="channel-guide-progs">${progs.map(p => `<div class="channel-guide-prog"><span class="prog-time">${p.start_time||p.start}</span><span class="prog-title">${p.title}</span><span class="prog-type">${p.program_type||p.type}</span></div>`).join('')}</div>
        </div>`;
      }).join('');
      this.els.channelGuide.classList.add('active');
      document.body.style.overflow = 'hidden';
    },

    closeGuide() { if (this.els.channelGuide) { this.els.channelGuide.classList.remove('active'); document.body.style.overflow = ''; } },

    // ====== WATCH HISTORY (NEW) ======
    async renderWatchHistory(page) {
      whPage = page || whPage;
      const list = document.getElementById('whList');
      const stats = document.getElementById('whStats');
      const pagination = document.getElementById('whPagination');
      if (!list) return;

      list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-tertiary);"><i class="fas fa-spinner fa-spin" style="font-size:24px;"></i></div>';

      try {
        const res = await fetch(`${API}/user/${currentProfile.id}/watch-history?page=${whPage}`);
        const data = await res.json();
        if (!data.success) throw new Error('Failed');

        if (stats) {
          stats.textContent = data.total > 0 
            ? `${appLang === 'ro' ? 'Total' : 'Total'}: ${data.total} ${appLang === 'ro' ? 'intrări în istoric' : 'history entries'}`
            : appLang === 'ro' ? 'Nicio intrare în istoric' : 'No history entries';
        }

        const entries = Object.entries(data.data || {});
        if (entries.length === 0) {
          list.innerHTML = `<div class="wh-empty"><i class="fas fa-history"></i><h3>${appLang === 'ro' ? 'Nicio vizionare înregistrată' : 'No watch history'}</h3><p style="font-size:13px;color:var(--text-tertiary);margin-top:8px;">${appLang === 'ro' ? 'Vizionează ceva pentru a vedea istoricul aici' : 'Watch something to see your history here'}</p></div>`;
        } else {
          list.innerHTML = entries.map(([date, items]) => `
            <div class="watch-history-group">
              <div class="watch-history-date">${date}</div>
              ${items.map(item => `
                <div class="watch-history-item" data-id="${item.item_id}" onclick="App.openDetail('${item.item_id}')">
                  <div class="wh-thumb" style="background:${item.bg_color || '#1a1a2e'}">🎬</div>
                  <div class="wh-info">
                    <div class="wh-title">${item.title || item.item_id}</div>
                    <div class="wh-meta">
                      <span class="wh-type">${item.content_type === 'series' ? 'Serial' : 'Film'}</span>
                      <span>${new Date(item.watched_at).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}</span>
                      ${item.duration_seconds ? `<span>${Math.floor(item.duration_seconds / 60)}min</span>` : ''}
                    </div>
                  </div>
                  <span class="wh-badge ${item.completed ? 'completed' : 'partial'}">${item.completed ? (appLang === 'ro' ? 'Complet' : 'Done') : (appLang === 'ro' ? 'Parțial' : 'Partial')}</span>
                </div>
              `).join('')}
            </div>
          `).join('');
        }

        // Pagination
        if (pagination && data.pages > 1) {
          pagination.innerHTML = Array.from({ length: Math.min(data.pages, 5) }, (_, i) => i + 1).map(p =>
            `<button class="wh-page-btn ${p === whPage ? 'active' : ''}" data-page="${p}">${p}</button>`
          ).join('');
          pagination.querySelectorAll('.wh-page-btn').forEach(btn => {
            btn.addEventListener('click', () => this.renderWatchHistory(parseInt(btn.dataset.page)));
          });
        } else if (pagination) {
          pagination.innerHTML = '';
        }
      } catch {
        list.innerHTML = '<div class="wh-empty"><i class="fas fa-exclamation-circle"></i><h3>Failed to load history</h3></div>';
      }
    },

    async clearWatchHistory() {
      if (!confirm(appLang === 'ro' ? 'Ești sigur că vrei să ștergi tot istoricul de vizionări?' : 'Are you sure you want to clear all watch history?')) return;
      try {
        const res = await fetch(`${API}/user/${currentProfile.id}/watch-history/clear`, {
          method: 'DELETE', headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (data.success) {
          this.toast(appLang === 'ro' ? 'Istoric șters!' : 'History cleared!', 'success');
          this.renderWatchHistory(1);
        }
      } catch {
        this.toast('Error clearing history', 'error');
      }
    },

    // ====== DOWNLOADS (NEW) ======
    async renderDownloads() {
      const grid = document.getElementById('dlGrid');
      const statsEl = document.getElementById('dlStats');
      if (!grid) return;

      grid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-tertiary);"><i class="fas fa-spinner fa-spin" style="font-size:24px;"></i></div>';

      try {
        const res = await fetch(`${API}/user/${currentProfile.id}/downloads`);
        const data = await res.json();
        if (!data.success) throw new Error('Failed');

        if (statsEl) {
          statsEl.innerHTML = `
            <div class="dl-stat-card"><div class="dl-stat-value" style="color:var(--accent-secondary);">${data.stats?.downloading || 0}</div><div class="dl-stat-label">${appLang === 'ro' ? 'În curs' : 'Downloading'}</div></div>
            <div class="dl-stat-card"><div class="dl-stat-value" style="color:var(--green);">${data.stats?.completed || 0}</div><div class="dl-stat-label">${appLang === 'ro' ? 'Finalizate' : 'Completed'}</div></div>
            <div class="dl-stat-card"><div class="dl-stat-value">${data.stats?.total || 0}</div><div class="dl-stat-label">${appLang === 'ro' ? 'Total' : 'Total'}</div></div>
            <div class="dl-stat-card"><div class="dl-stat-value">${(data.stats?.totalSize || 0) > 1000 ? ((data.stats.totalSize / 1000).toFixed(1) + ' GB') : (data.stats?.totalSize || 0) + ' MB'}</div><div class="dl-stat-label">${appLang === 'ro' ? 'Dimensiune' : 'Size'}</div></div>`;
        }

        if (!data.data || data.data.length === 0) {
          grid.innerHTML = `<div class="dl-empty"><i class="fas fa-download"></i><h3>${appLang === 'ro' ? 'Nicio descărcare' : 'No downloads'}</h3><p style="font-size:13px;color:var(--text-tertiary);margin-top:8px;">${appLang === 'ro' ? 'Descarcă conținut pentru vizionare offline' : 'Download content for offline viewing'}</p></div>`;
          return;
        }

        grid.innerHTML = data.data.map(dl => `
          <div class="dl-item">
            <div class="dl-thumb" style="background:${dl.bg_color || '#1a1a2e'}">📺</div>
            <div class="dl-info">
              <div class="dl-title">${dl.title || 'Unknown'}${dl.episode_title ? ` - ${dl.episode_title}` : ''}</div>
              <div class="dl-meta">${dl.content_type === 'series' ? `S${dl.season_number}:E${dl.episode_number}` : dl.content_type} • ${dl.size_mb || 0}MB</div>
              <div class="dl-progress"><div class="dl-progress-fill ${dl.status}" style="width:${dl.progress || 0}%"></div></div>
            </div>
            <span class="dl-status ${dl.status}">${dl.status === 'completed' ? (appLang === 'ro' ? 'Finalizat' : 'Done') : dl.status === 'downloading' ? (appLang === 'ro' ? 'Descărcare...' : 'Downloading...') : appLang === 'ro' ? 'În așteptare' : 'Pending'}</span>
            <div class="dl-actions">
              <button class="dl-action-btn" onclick="App.toggleDownload(${dl.id})" title="${dl.status === 'completed' ? (appLang === 'ro' ? 'Redescarcă' : 'Redownload') : (appLang === 'ro' ? 'Finalizează' : 'Complete')}"><i class="fas ${dl.status === 'completed' ? 'fa-redo' : 'fa-check'}"></i></button>
              <button class="dl-action-btn danger" onclick="App.deleteDownload(${dl.id})" title="${appLang === 'ro' ? 'Șterge' : 'Delete'}"><i class="fas fa-trash"></i></button>
            </div>
          </div>
        `).join('');
      } catch {
        grid.innerHTML = '<div class="dl-empty"><i class="fas fa-exclamation-circle"></i><h3>Failed to load downloads</h3></div>';
      }
    },

    async toggleDownload(id) {
      try {
        const res = await fetch(`${API}/user/${currentProfile.id}/downloads/${id}/toggle`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          this.toast(data.status === 'completed' ? (appLang === 'ro' ? 'Marcat ca finalizat' : 'Marked completed') : (appLang === 'ro' ? 'Redescărcare' : 'Redownloading'), 'success');
          this.renderDownloads();
        }
      } catch { this.toast('Error', 'error'); }
    },

    async deleteDownload(id) {
      try {
        const res = await fetch(`${API}/user/${currentProfile.id}/downloads/${id}`, {
          method: 'DELETE', headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (data.success) {
          this.toast(appLang === 'ro' ? 'Descărcare ștearsă' : 'Download removed', 'info');
          this.renderDownloads();
        }
      } catch { this.toast('Error', 'error'); }
    },

    async addToDownloads(itemId, episodeId) {
      if (!currentProfile) { this.toast(appLang === 'ro' ? 'Selectează un profil' : 'Select a profile', 'error'); return; }
      try {
        const res = await fetch(`${API}/user/${currentProfile.id}/downloads`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId, episodeId: episodeId || null, sizeMb: Math.floor(Math.random() * 500 + 100) })
        });
        const data = await res.json();
        this.toast(data.success ? (appLang === 'ro' ? 'Adăugat la descărcări!' : 'Added to downloads!') : (data.message || 'Error'), data.success ? 'success' : 'error');
      } catch { this.toast('Error', 'error'); }
    },


    // ====== BILLING / SUBSCRIPTION ======
    async showBilling() {
      const container = document.getElementById('billingContent');
      if (!container) return;
      const lang = window.appLang || 'ro';
      container.innerHTML = '<div class="industry-empty"><i class="fas fa-spinner fa-spin"></i><h4>' + (lang === 'ro' ? 'Se incarca...' : 'Loading...') + '</h4></div>';
      try {
        const [plansRes, currentRes, historyRes] = await Promise.all([
          fetch('/api/billing/plans'),
          fetch('/api/billing/current', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('animaxia_token') } }),
          fetch('/api/billing/history', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('animaxia_token') } })
        ]);
        const plans = (await plansRes.json()).data || [];
        const current = (await currentRes.json()).data || {};
        const history = (await historyRes.json()).data || [];

        let html = '';
        if (current.plan) {
          html += '<div class="billing-current"><i class="fas fa-check-circle"></i><div><strong>' +
            (lang === 'ro' ? 'Plan actual:' : 'Current plan:') + '</strong> ' + current.plan.name +
            ' &mdash; ' + (current.plan.price === 0 ? (lang === 'ro' ? 'Gratuit' : 'Free') : current.plan.price + ' lei/' + (lang === 'ro' ? 'luna' : 'month')) + '</div></div>';
        }

        html += '<div class="billing-plan-grid">' + plans.map(function(p) {
          var featured = p.name === 'Premium' ? ' featured' : '';
          var isCurrent = current.plan && current.plan.name === p.name;
          return '<div class="billing-plan-card' + featured + '">' +
            '<div class="billing-plan-name">' + p.name + '</div>' +
            '<div class="billing-plan-price">' + (p.price === 0 ? (lang === 'ro' ? 'Gratuit' : 'Free') : p.price + '<span style="font-size:14px;color:var(--text-tertiary);font-weight:400;"> lei</span>') + '</div>' +
            '<div class="billing-plan-period">/' + (lang === 'ro' ? 'luna' : 'month') + '</div>' +
            '<ul class="billing-plan-features">' + (p.features || []).map(function(f) {
              return '<li><i class="fas fa-check" style="color:var(--green);"></i> ' + f + '</li>';
            }).join('') + '</ul>' +
            (isCurrent ? '<button class="btn btn-secondary" disabled><i class="fas fa-check"></i> ' +
            (lang === 'ro' ? 'Actual' : 'Current') + '</button>' :
            (p.price > 0 ? '<button class="btn btn-primary subscribe-btn" data-plan="' + p.id + '"><i class="fas fa-credit-card"></i> ' +
            (lang === 'ro' ? 'Aboneaza-te' : 'Subscribe') + '</button>' :
            '<button class="btn btn-secondary" disabled>' + (lang === 'ro' ? 'Gratuit' : 'Free') + '</button>')) +
            '</div>';
        }).join('') + '</div>';

        html += '<div class="billing-history"><h3><i class="fas fa-receipt"></i> ' +
          (lang === 'ro' ? 'Istoric plati' : 'Payment History') + '</h3>';
        if (history.length === 0) {
          html += '<div class="billing-empty"><i class="fas fa-receipt"></i><p>' +
            (lang === 'ro' ? 'Nicio plata inregistrata' : 'No payment history') + '</p></div>';
        } else {
          html += '<table class="billing-history-table"><thead><tr><th>' +
            (lang === 'ro' ? 'Data' : 'Date') + '</th><th>' +
            (lang === 'ro' ? 'Descriere' : 'Description') + '</th><th>' +
            (lang === 'ro' ? 'Suma' : 'Amount') + '</th><th>' +
            (lang === 'ro' ? 'Status' : 'Status') + '</th></tr></thead><tbody>' +
            history.map(function(h) {
              var statusClass = h.status === 'paid' ? 'paid' : (h.status === 'pending' ? 'pending' : 'failed');
              return '<tr><td>' + new Date(h.created_at).toLocaleDateString() + '</td><td>' + (h.description || '-') + '</td><td>' + (h.amount ? h.amount + ' lei' : '-') + '</td><td><span class="billing-status ' + statusClass + '">' + (h.status === 'paid' ? (lang === 'ro' ? 'Platit' : 'Paid') : h.status === 'pending' ? (lang === 'ro' ? 'In asteptare' : 'Pending') : (lang === 'ro' ? 'Esuat' : 'Failed')) + '</span></td></tr>';
            }).join('') + '</tbody></table>';
        }
        html += '</div>';

        container.innerHTML = html;

        container.querySelectorAll('.subscribe-btn').forEach(function(btn) {
          btn.addEventListener('click', async function() {
            var planId = parseInt(btn.dataset.plan);
            try {
              var res = await fetch('/api/billing/subscribe', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('animaxia_token') },
                body: JSON.stringify({ planId: planId })
              });
              var data = await res.json();
              if (data.success) {
                App.toast(data.message || (lang === 'ro' ? 'Abonament activat!' : 'Subscription activated!'), 'success');
                App.showBilling();
              } else {
                App.toast(data.error || 'Error', 'error');
              }
            } catch { App.toast('Error', 'error'); }
          });
        });
      } catch { container.innerHTML = '<div class="industry-error"><i class="fas fa-exclamation-triangle"></i></div>'; }
    },

        // ====== ADMIN DASHBOARD (NEW) ======
    async adminRefresh() {
      // Use event delegation on admin body to avoid stacking listeners
      const adminBody = document.querySelector('.admin-body');
      if (adminBody && !adminBody.dataset.adminBound) {
        adminBody.dataset.adminBound = 'true';
        adminBody.addEventListener('click', (e) => {
          const btn = e.target.closest('.admin-tab-btn');
          if (!btn) return;
          document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          document.querySelectorAll('.admin-tab').forEach(t => t.style.display = 'none');
          const tab = document.getElementById(`adminTab${btn.dataset.tab.charAt(0).toUpperCase() + btn.dataset.tab.slice(1)}`);
          if (tab) tab.style.display = 'block';
        });
      }

      await Promise.all([
        this.adminLoadStats(),
        this.adminLoadContent(),
        this.adminLoadUsers(),
        this.adminLoadAnalytics(),
        this.adminLoadLogs()
      ]);
    },

    async adminLoadStats() {
      const grid = document.getElementById('adminStatsGrid');
      if (!grid) return;
      try {
        const res = await fetch(`${API}/admin/stats`, { headers: { 'Authorization': `Bearer ${authToken}` } });
        const data = await res.json();
        if (data.success) {
          const s = data.stats;
          grid.innerHTML = [
            { label: 'Content', value: s.content, icon: '🎬', color: 'var(--accent-secondary)' },
            { label: 'Users', value: s.users, icon: '👥', color: 'var(--green)' },
            { label: 'Episodes', value: s.episodes, icon: '📺', color: 'var(--yellow)' },
            { label: 'Watchlists', value: s.watchlists, icon: '📋', color: 'var(--blue)' },
            { label: 'Reviews', value: s.reviews, icon: '⭐', color: 'var(--yellow)' },
            { label: 'Avg Rating', value: s.reviewAvg + '★', icon: '📊', color: 'var(--orange)' },
            { label: 'Downloads', value: s.downloads, icon: '⬇️', color: 'var(--green)' },
            { label: 'Watch History', value: s.watchHistory, icon: '📜', color: 'var(--accent-secondary)' },
            { label: 'Episodes Total', value: s.episodes, icon: '🎞️', color: 'var(--orange)' },
          ].map(stat => `
            <div class="admin-stat-card">
              <span class="admin-stat-icon">${stat.icon}</span>
              <div class="admin-stat-value" style="color:${stat.color}">${stat.value}</div>
              <div class="admin-stat-label">${stat.label}</div>
            </div>
          `).join('');
        }
      } catch {
        grid.innerHTML = '<p style="color:var(--red);">Failed to load stats</p>';
      }
    },

    async adminLoadContent() {
      const table = document.getElementById('adminContentTable');
      if (!table) return;
      try {
        const res = await fetch(`${API}/admin/content`, { headers: { 'Authorization': `Bearer ${authToken}` } });
        const data = await res.json();
        if (data.success) {
          table.innerHTML = data.data.length === 0
            ? '<p style="color:var(--text-tertiary);padding:20px;">No content</p>'
            : `<table>
              <thead><tr>
                <th>ID</th><th>Title</th><th>Type</th><th>Year</th><th>Genre</th><th>Views</th><th>Rating</th><th>Actions</th>
              </tr></thead>
              <tbody>${data.data.map(item => `
                <tr>
                  <td style="font-size:11px;color:var(--text-tertiary);">${item.id}</td>
                  <td><strong>${item.title}</strong></td>
                  <td><span class="admin-badge ${item.content_type}">${item.content_type}</span></td>
                  <td>${item.year || '-'}</td>
                  <td style="font-size:11px;">${(item.genre||[]).slice(0,2).join(', ')}</td>
                  <td>${item.view_count || 0}</td>
                  <td>${item.rating || '-'}</td>
                  <td class="admin-actions">
                    <button class="admin-btn admin-btn-view" onclick="App.openDetail('${item.id}')"><i class="fas fa-eye"></i></button>
                    <button class="admin-btn admin-btn-delete" onclick="App.adminDeleteContent('${item.id}')"><i class="fas fa-trash"></i></button>
                  </td>
                </tr>
              `).join('')}</tbody>
            </table>`;
        }
      } catch {}
    },

    async adminDeleteContent(id) {
      if (!confirm(`Delete ${id}?`)) return;
      try {
        const res = await fetch(`${API}/admin/content/${id}`, {
          method: 'DELETE', headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (data.success) {
          this.toast(`Deleted ${id}`, 'success');
          this.adminLoadContent();
        }
      } catch { this.toast('Error deleting', 'error'); }
    },

    adminShowAddContent() {
      const modal = document.getElementById('adminContentModal');
      if (modal) {
        modal.style.display = '';
        document.getElementById('adminContentModalTitle').textContent = 'Add Content';
        ['acId','acTitle','acTitleEn','acYear','acDuration','acRating','acType','acGenre','acMatch','acBgColor','acDescription','acDescriptionEn'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.value = id === 'acMatch' ? '95%' : id === 'acBgColor' ? '#1e1e2e' : id === 'acType' ? 'movie' : '';
        });
      }
    },

    async adminSaveContent() {
      const data = {
        id: document.getElementById('acId')?.value,
        title: document.getElementById('acTitle')?.value,
        title_en: document.getElementById('acTitleEn')?.value,
        year: document.getElementById('acYear')?.value,
        duration: document.getElementById('acDuration')?.value,
        rating: document.getElementById('acRating')?.value,
        content_type: document.getElementById('acType')?.value,
        genre: (document.getElementById('acGenre')?.value || '').split(',').map(s => s.trim()).filter(Boolean),
        match_rating: document.getElementById('acMatch')?.value,
        bg_color: document.getElementById('acBgColor')?.value,
        description: document.getElementById('acDescription')?.value,
        description_en: document.getElementById('acDescriptionEn')?.value,
      };
      if (!data.id || !data.title) {
        document.getElementById('acError').textContent = 'ID and Title required';
        return;
      }
      try {
        const res = await fetch(`${API}/admin/content`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
          body: JSON.stringify(data)
        });
        const result = await res.json();
        if (result.success) {
          this.toast('Content added!', 'success');
          document.getElementById('adminContentModal').style.display = 'none';
          this.adminLoadContent();
        } else {
          document.getElementById('acError').textContent = result.error || 'Error';
        }
      } catch {
        document.getElementById('acError').textContent = 'Connection error';
      }
    },

    async adminLoadUsers() {
      const table = document.getElementById('adminUsersTable');
      if (!table) return;
      try {
        const res = await fetch(`${API}/admin/users`, { headers: { 'Authorization': `Bearer ${authToken}` } });
        const data = await res.json();
        if (data.success) {
          table.innerHTML = `<table>
            <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Plan</th><th>Role</th><th>Verified</th><th>Last Login</th></tr></thead>
            <tbody>${data.data.map(u => `
              <tr>
                <td>${u.id}</td>
                <td>${u.name}</td>
                <td style="font-size:12px;">${u.email}</td>
                <td><span class="admin-badge ${(u.plan||'').toLowerCase()}">${u.plan}</span></td>
                <td><span class="admin-badge ${u.role}">${u.role}</span></td>
                <td>${u.email_verified ? '✅' : '❌'}</td>
                <td style="font-size:11px;color:var(--text-tertiary);">${new Date(u.last_login).toLocaleDateString('ro-RO')}</td>
              </tr>
            `).join('')}</tbody>
          </table>`;
        }
      } catch {}
    },

    async adminLoadAnalytics() {
      const grid = document.getElementById('adminAnalyticsGrid');
      if (!grid) return;
      try {
        const res = await fetch(`${API}/admin/analytics?days=30`, { headers: { 'Authorization': `Bearer ${authToken}` } });
        const data = await res.json();
        if (data.success) {
          const d = data.data;
          const maxCount = Math.max(...(d.genreDist || []).map(g => g.count), 1);
          const maxViews = Math.max(...(d.viewsByType || []).map(v => parseInt(v.views)), 1);
          grid.innerHTML = `
            <div class="admin-analytics-card">
              <h4>Views by Type</h4>
              ${(d.viewsByType || []).map(v => `
                <div class="admin-analytics-bar">
                  <div class="admin-analytics-bar-fill" style="width:${(v.views / maxViews) * 100}%;background:var(--accent-gradient);"></div>
                  <span class="admin-analytics-bar-label">${v.content_type}: ${v.views} views</span>
                </div>
              `).join('') || '<p style="color:var(--text-tertiary);font-size:12px;">No data</p>'}
            </div>
            <div class="admin-analytics-card">
              <h4>Top Content by Views</h4>
              ${(d.topContent || []).slice(0, 5).map(c => `
                <div class="admin-analytics-bar">
                  <div class="admin-analytics-bar-fill" style="width:${(c.view_count / Math.max(...d.topContent.map(x => x.view_count), 1)) * 100}%;background:var(--green);opacity:0.6;"></div>
                  <span class="admin-analytics-bar-label">${c.title}: ${c.view_count}</span>
                </div>
              `).join('') || '<p style="color:var(--text-tertiary);font-size:12px;">No data</p>'}
            </div>
            <div class="admin-analytics-card">
              <h4>Genre Distribution</h4>
              ${(d.genreDist || []).slice(0, 8).map(g => `
                <div class="admin-analytics-bar">
                  <div class="admin-analytics-bar-fill" style="width:${(g.count / maxCount) * 100}%;background:var(--yellow);opacity:0.6;"></div>
                  <span class="admin-analytics-bar-label">${g.genre}: ${g.count}</span>
                </div>
              `).join('') || '<p style="color:var(--text-tertiary);font-size:12px;">No data</p>'}
            </div>
            <div class="admin-analytics-card">
              <h4>Recent Daily Activity</h4>
              ${(d.dailyActivity || []).slice(-7).map(day => `
                <div class="admin-analytics-bar">
                  <div class="admin-analytics-bar-fill" style="width:${(day.views / Math.max(...d.dailyActivity.map(x => x.views), 1)) * 100}%;background:var(--blue);opacity:0.6;"></div>
                  <span class="admin-analytics-bar-label">${day.date ? new Date(day.date).toLocaleDateString('ro-RO', { weekday: 'short' }) : ''}: ${day.views} views</span>
                </div>
              `).join('') || '<p style="color:var(--text-tertiary);font-size:12px;">No activity</p>'}
            </div>`;
        }
      } catch {
        grid.innerHTML = '<p style="color:var(--red);">Failed to load analytics</p>';
      }
    },

    async adminLoadLogs() {
      const table = document.getElementById('adminLogsTable');
      if (!table) return;
      try {
        const res = await fetch(`${API}/admin/logs`, { headers: { 'Authorization': `Bearer ${authToken}` } });
        const data = await res.json();
        if (data.success) {
          table.innerHTML = data.data.length === 0
            ? '<p style="color:var(--text-tertiary);padding:20px;">No logs</p>'
            : data.data.map(log => `
              <div class="admin-log-item">
                <span class="admin-log-time">${new Date(log.created_at).toLocaleString('ro-RO')}</span>
                <span class="admin-log-action">${log.action}</span>
                <span class="admin-log-user">${log.user_name || log.user_email || '-'}</span>
                <span class="admin-log-details">${log.details || ''}</span>
              </div>
            `).join('');
        }
      } catch {}
    },

    // ====== LOGOUT ======

    // ====== NEW FEATURES v5.2 ======

    // ====== AUTO-PLAY NEXT EPISODE ======
    startAutoPlayNext() {
      if (!playerState.currentEpisode || !playerState.episodesData) return;
      const idx = playerState.episodesData.findIndex(e => e.id === playerState.currentEpisode.id);
      if (idx < playerState.episodesData.length - 1) {
        const nextEp = playerState.episodesData[idx + 1];
        let o = document.getElementById('nextEpOverlay');
        if (!o) {
          o = document.createElement('div');
          o.id = 'nextEpOverlay';
          o.className = 'next-ep-overlay';
          document.getElementById('playerScreen')?.appendChild(o);
        }
        o.innerHTML = `<div class="next-ep-card" id="nextEpCard">
          <div class="next-ep-thumb" style="background:${nextEp.thumbnail_color || '#2d3436'}">📺</div>
          <div class="next-ep-info">
            <div class="next-ep-label">${appLang === 'ro' ? 'Urmează' : 'Next'}</div>
            <div class="next-ep-title">${nextEp.title}</div>
            <div class="next-ep-desc">EP ${nextEp.episode_number}</div>
            <div class="next-ep-countdown">
              <div class="next-ep-timer" id="nextEpTimer">
                <svg viewBox="0 0 28 28"><circle cx="14" cy="14" r="12" id="nextEpCircle"/></svg>
                <span id="nextEpCount">10</span>
              </div>
              <span style="font-size:12px;color:var(--text-tertiary);">${appLang === 'ro' ? 'Redare automată' : 'Auto-playing'}</span>
              <button class="next-ep-cancel" id="nextEpCancel">${appLang === 'ro' ? 'Anulează' : 'Cancel'}</button>
            </div>
          </div>
        </div>`;
        o.classList.add('visible');
        let countdown = 10;
        clearInterval(this._nextEpInterval);
        this._nextEpInterval = setInterval(() => {
          countdown--;
          const circle = document.getElementById('nextEpCircle');
          const count = document.getElementById('nextEpCount');
          if (circle) circle.style.strokeDashoffset = 100 - (countdown / 10 * 100);
          if (count) count.textContent = countdown;
          if (countdown <= 0) {
            clearInterval(this._nextEpInterval);
            o.classList.remove('visible');
            this.playerNext();
          }
        }, 1000);
        document.getElementById('nextEpCard')?.addEventListener('click', () => { clearInterval(this._nextEpInterval); o.classList.remove('visible'); this.playerNext(); });
        document.getElementById('nextEpCancel')?.addEventListener('click', (e) => { e.stopPropagation(); clearInterval(this._nextEpInterval); o.classList.remove('visible'); });
      }
    },

    // ====== SKIP INTRO ======
    showSkipIntro() {
      let o = document.getElementById('skipIntroOverlay');
      if (!o) {
        o = document.createElement('div');
        o.id = 'skipIntroOverlay';
        o.className = 'skip-intro-overlay';
        o.innerHTML = `<button class="skip-btn" id="skipIntroBtn"><i class="fas fa-forward"></i> ${appLang === 'ro' ? 'Sari peste introducere' : 'Skip Intro'}</button>`;
        document.getElementById('playerScreen')?.appendChild(o);
      }
      o.classList.add('visible');
      document.getElementById('skipIntroBtn')?.addEventListener('click', () => { playerState.currentTime += 60; this.updatePlayerProgress(); o.classList.remove('visible'); });
      clearTimeout(this._skipIntroTimer);
      this._skipIntroTimer = setTimeout(() => o.classList.remove('visible'), 15000);
    },

    // ====== SEARCH HISTORY ======
    async saveSearchHistory(query, rc) {
      if (!currentProfile || !query || query.length < 2) return;
      try { await fetch(`${API}/search/history`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ profileId:currentProfile.id, query, resultsCount:rc||0 }) }); } catch {}
    },

    async showSearchHistory() {
      if (!currentProfile) return;
      try {
        const [hR, tR] = await Promise.all([
          fetch(`${API}/search/history/${currentProfile.id}`),
          fetch(`${API}/search/trending`)
        ]);
        const hD = await hR.json(), tD = await tR.json();
        const hints = document.querySelector('.search-hints');
        if (!hints) return;
        let html = '';
        if (hD.success && hD.data?.length) {
          html += `<div class="search-history-list"><p style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px;"><i class="fas fa-history"></i> Recent</p>
            ${hD.data.slice(0,5).map(h => `<div class="search-history-item" data-q="${h.query}"><span class="search-history-icon"><i class="fas fa-clock-rotate"></i></span><span class="search-history-query">${h.query}</span><span class="search-history-time">${h.search_count}x</span></div>`).join('')}</div>`;
        }
        if (tD.success && tD.data?.length) {
          html += `<div style="margin-top:16px;"><p style="font-size:12px;color:var(--text-tertiary);margin-bottom:8px;"><i class="fas fa-fire"></i> Trending</p>
            <div class="search-tags">${tD.data.slice(0,8).map(t => `<span class="search-tag" data-q="${t.query}">${t.query}</span>`).join('')}</div></div>`;
        }
        if (html) { hints.innerHTML = html; hints.style.display = ''; document.getElementById('searchResultsGrid').innerHTML = ''; }
        hints.querySelectorAll('[data-q]').forEach(el => { el.addEventListener('click', () => { const inp = document.getElementById('searchOverlayInput'); if(inp){inp.value=el.dataset.q;App.search(el.dataset.q);} }); });
      } catch {}
    },

    // ====== AGE VERIFICATION ======
    async checkAgeGate(itemId) {
      if (!currentProfile) return true;
      try {
        const aR = await fetch(`${API}/user/${currentProfile.id}/age-status`);
        const aD = await aR.json();
        if (aD.success && aD.verified) return true;
        const rR = await fetch(`${API}/content/${itemId}/age-rating`);
        const rD = await rR.json();
        if (!rD.success || (rD.data?.min_age||0) < 13) return true;
        return new Promise(resolve => {
          const overlay = document.createElement('div');
          overlay.className = 'age-gate-overlay';
          overlay.innerHTML = `<div class="age-gate-modal"><span class="age-gate-icon">🔞</span>
            <h2 class="age-gate-title">${appLang === 'ro' ? 'Verificare vârstă' : 'Age Verification'}</h2>
            <p class="age-gate-subtitle">${appLang === 'ro' ? 'Conținutul necesită verificare.' : 'Content requires verification.'}</p>
            <div class="age-gate-form">
              <select id="ageDay">${Array.from({length:31},(_,i)=>'<option>'+(i+1)+'</option>').join('')}</select>
              <select id="ageMonth">${['Ian','Feb','Mar','Apr','Mai','Iun','Iul','Aug','Sep','Oct','Nov','Dec'].map((m,i)=>'<option value="'+(i+1)+'">'+m+'</option>').join('')}</select>
              <select id="ageYear">${Array.from({length:100},(_,i)=>new Date().getFullYear()-i).map(y=>'<option>'+y+'</option>').join('')}</select>
              <button class="btn btn-primary age-gate-btn" id="ageVerifyBtn">${appLang === 'ro' ? 'Verifică' : 'Verify'}</button>
              <p id="ageGateError" class="age-gate-error"></p>
            </div></div>`;
          document.body.appendChild(overlay);
          document.getElementById('ageVerifyBtn').addEventListener('click', async () => {
            const bd = document.getElementById('ageYear').value+'-'+String(document.getElementById('ageMonth').value).padStart(2,'0')+'-'+String(document.getElementById('ageDay').value).padStart(2,'0');
            try {
              const r = await fetch(`${API}/user/${currentProfile.id}/age-verify`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({birthDate:bd}) });
              const d = await r.json();
              if (d.success) { overlay.remove(); App.toast('Age verified!','success'); resolve(true); }
              else { document.getElementById('ageGateError').textContent = d.error||'Error'; resolve(false); }
            } catch { document.getElementById('ageGateError').textContent = 'Error'; resolve(false); }
          });
          overlay.addEventListener('click', e => { if(e.target===overlay){overlay.remove(); resolve(false);} });
        });
      } catch { return true; }
    },

    // ====== CONTENT SHARING ======
    showShareModal(item) {
      if (!item) return;
      const url = window.location.origin+'/?share='+item.id;
      const overlay = document.createElement('div');
      overlay.className = 'share-overlay';
      overlay.innerHTML = `<div class="share-modal">
        <h3><i class="fas fa-share-alt"></i> ${appLang === 'ro' ? 'Distribuie' : 'Share'}</h3>
        <div class="share-options">
          <div class="share-option" id="shNative"><i class="fas fa-share-nodes" style="color:var(--accent-secondary)"></i><span>Share API</span></div>
          <div class="share-option" id="shCopy"><i class="fas fa-link" style="color:var(--green)"></i><span>${appLang === 'ro' ? 'Copiază link' : 'Copy link'}</span></div>
          <div class="share-option" id="shFB"><i class="fab fa-facebook" style="color:#1877F2"></i><span>Facebook</span></div>
          <div class="share-option" id="shTW"><i class="fab fa-twitter" style="color:#1DA1F2"></i><span>Twitter / X</span></div>
          <div class="share-option" id="shWA"><i class="fab fa-whatsapp" style="color:#25D366"></i><span>WhatsApp</span></div>
        </div>
        <div class="share-link-field"><input type="text" value="${url}" readonly onclick="this.select()"><button class="btn btn-secondary" id="shCopyBtn"><i class="fas fa-copy"></i></button></div>
        <button class="btn btn-secondary" onclick="this.closest('.share-overlay').remove()" style="width:100%;justify-content:center;margin-top:12px;">${appLang === 'ro' ? 'Închide' : 'Close'}</button>
      </div>`;
      document.body.appendChild(overlay);
      document.getElementById('shNative')?.addEventListener('click', () => { if(navigator.share)navigator.share({title:item.title,url}); else App.toast('Share API not supported','info'); overlay.remove(); });
      document.getElementById('shCopy')?.addEventListener('click', async () => { try{await navigator.clipboard.writeText(url);App.toast('Copied!','success'); overlay.remove();}catch{} });
      document.getElementById('shCopyBtn')?.addEventListener('click', async () => { try{await navigator.clipboard.writeText(url);App.toast('Copied!','success');}catch{} });
      ['shFB','shTW','shWA'].forEach(id => {
        const urls = { shFB:'https://facebook.com/sharer/sharer.php?u='+encodeURIComponent(url), shTW:'https://twitter.com/intent/tweet?url='+encodeURIComponent(url), shWA:'https://wa.me/?text='+encodeURIComponent(url) };
        document.getElementById(id)?.addEventListener('click', () => { window.open(urls[id],'_blank','width=600,height=400'); overlay.remove(); });
      });
      overlay.addEventListener('click', e => { if(e.target===overlay) overlay.remove(); });
    },

    // ====== SHORTCUTS HUD ======
    showShortcutsHUD() {
      const ex = document.getElementById('shortcutsHUD');
      if (ex) { ex.remove(); return; }
      const el = document.createElement('div');
      el.id = 'shortcutsHUD';
      el.className = 'shortcuts-hud visible';
      el.innerHTML = `<h3><i class="fas fa-keyboard"></i> ${appLang === 'ro' ? 'Scurtături' : 'Shortcuts'}</h3>
        <div class="shortcuts-grid">
          <div class="shortcut-item"><span class="shortcut-key">Space/K</span><span class="shortcut-desc">Play/Pause</span></div>
          <div class="shortcut-item"><span class="shortcut-key">F</span><span class="shortcut-desc">Fullscreen</span></div>
          <div class="shortcut-item"><span class="shortcut-key">←/→</span><span class="shortcut-desc">Seek</span></div>
          <div class="shortcut-item"><span class="shortcut-key">↑/↓</span><span class="shortcut-desc">Volume</span></div>
          <div class="shortcut-item"><span class="shortcut-key">M</span><span class="shortcut-desc">Mute</span></div>
          <div class="shortcut-item"><span class="shortcut-key">I</span><span class="shortcut-desc">X-Ray</span></div>
          <div class="shortcut-item"><span class="shortcut-key">P</span><span class="shortcut-desc">PiP</span></div>
          <div class="shortcut-item"><span class="shortcut-key">N/B</span><span class="shortcut-desc">Next/Prev</span></div>
          <div class="shortcut-item"><span class="shortcut-key">S</span><span class="shortcut-desc">Search</span></div>
          <div class="shortcut-item"><span class="shortcut-key">?</span><span class="shortcut-desc">This list</span></div>
        </div>
        <button class="btn btn-secondary shortcuts-close" onclick="this.closest('#shortcutsHUD').remove()" style="width:100%;justify-content:center;margin-top:12px;">Close</button>`;
      document.body.appendChild(el);
    },

    // ====== TOUCH GESTURES ======
    initTouchGestures() {
      let sx = 0, sy = 0;
      document.addEventListener('touchstart', e => { sx = e.changedTouches[0].screenX; sy = e.changedTouches[0].screenY; }, { passive: true });
      document.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].screenX - sx, dy = e.changedTouches[0].screenY - sy;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) { if (dx < 0) App.navHero(1); else App.navHero(-1); }
        else if (Math.abs(dy) > 80 && dy < -80 && window.scrollY < 10) { App.toast('Refreshing...','info'); App.renderAll(); App.loadRecommendations(); }
      }, { passive: true });
    },

    // ====== INIT NEW FEATURES ======
    initNewFeatures() {
      // Global ? shortcut for shortcuts HUD
      document.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.key === '?') { e.preventDefault(); this.showShortcutsHUD(); }
        const po = document.getElementById('playerModal')?.classList.contains('active');
        if (!po) {
          if (e.key === 'ArrowLeft' && !document.getElementById('detailModal')?.classList.contains('active')) this.navHero(-1);
          if (e.key === 'ArrowRight' && !document.getElementById('detailModal')?.classList.contains('active')) this.navHero(1);
        }
      });
      this.initTouchGestures();
      
      // Add share button to detail modal
      const obs = new MutationObserver(() => {
        const actions = document.getElementById('modalActions');
        if (actions && !actions.querySelector('[data-shr]')) {
          const btn = document.createElement('button');
          btn.className = 'btn btn-secondary'; btn.dataset.shr = '1';
          btn.innerHTML = '<i class="fas fa-share-alt"></i>';
          btn.title = 'Share';
          btn.addEventListener('click', () => { const it = this.findItem(App.currentDetailId); if (it) this.showShareModal(it); });
          actions.appendChild(btn);
        }
      });
      obs.observe(document.getElementById('detailModal') || document.body, { childList: true, subtree: true });
      
      // Search history on focus
      document.getElementById('searchOverlayInput')?.addEventListener('focus', () => setTimeout(() => this.showSearchHistory(), 200));
      
      // Auto-save search history
      const origSearch = this.search.bind(this);
      this.search = function(q) { if (q && q.length >= 2 && currentProfile) this.saveSearchHistory(q, 0); return origSearch(q); };
    },

    async logout() {
      if (authToken) {
        try { await fetch(`${API}/auth/logout`, { method: 'POST', headers: { 'Authorization': `Bearer ${authToken}` } }); } catch {}
      }
      authToken = null;
      currentProfile = null;
      currentUser = null;
      userData = null;
      currentHeroItem = null;
      contentCache = null;
      window.__content = null;
      localStorage.removeItem('animaxia_token');
      sessionStorage.removeItem('reset_token');
      this.closeAll();
      this.closeAllModals();
      this.showScreen('login');
      if (this.els.verifyBanner) this.els.verifyBanner.style.display = 'none';
      this.toast(appLang === 'ro' ? 'Te-ai deconectat' : 'Signed out', 'info');
    },

    closeAllModals() {
      document.querySelectorAll('.modal, .player-modal, .channel-guide-modal, .search-overlay, .admin-modal-overlay').forEach(el => {
        el.classList.remove('active');
        if (el.id === 'adminContentModal') el.style.display = 'none';
      });
      document.body.style.overflow = '';
    },

    // ====== UTILITIES ======
    findItem(id) {
      if (!id || !contentCache) return null;
      for (const f of contentCache.featured || []) if (f.id === id) return f;
      for (const cat of contentCache.categories || []) {
        const f = (cat.items||[]).find(i => i?.id === id);
        if (f) return f;
      }
      return null;
    },

    nav(section) {
      this.els.navItems?.forEach(it => it.classList.toggle('active', it.querySelector('a')?.dataset.section === section));
      this.els.mobileNav?.forEach(it => it.classList.toggle('active', it.dataset.section === section));
      const t = {
        home: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
        trending: () => document.querySelector('[data-category="tendinte"]')?.scrollIntoView({ behavior: 'smooth' }),
        movies: () => document.querySelector('[data-category="filme"]')?.scrollIntoView({ behavior: 'smooth' }),
        series: () => document.querySelector('[data-category="seriale"]')?.scrollIntoView({ behavior: 'smooth' }),
        'my-list': () => this.renderMyList(),
        live: () => document.querySelector('#liveStrip')?.scrollIntoView({ behavior: 'smooth' }),
      };
      if (t[section]) t[section]();
    },

    toast(msg, type = 'info') {
      const icons = { success: 'fas fa-check-circle', info: 'fas fa-info-circle', error: 'fas fa-exclamation-circle' };
      const t = document.createElement('div');
      t.className = `toast ${type}`; t.setAttribute('role', 'alert');
      t.innerHTML = `<i class="${icons[type]||icons.info}"></i><span>${msg}</span>`;
      this.els.toastContainer.appendChild(t);
      setTimeout(() => t.remove(), 3500);
    },

    // ====== SIDEBAR ======
    toggleSidebar() {
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebarOverlay');
      if (!sidebar) return;
      const isOpen = sidebar.classList.toggle('open');
      if (overlay) overlay.classList.toggle('active', isOpen);
      document.body.style.overflow = isOpen ? 'hidden' : '';
    },

    closeSidebar() {
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebarOverlay');
      if (sidebar) sidebar.classList.remove('open');
      if (overlay) overlay.classList.remove('active');
      document.body.style.overflow = '';
    },

    updateSidebarUser() {
      const avatar = document.getElementById('sidebarAvatar');
      const name = document.getElementById('sidebarUserName');
      const plan = document.getElementById('sidebarUserPlan');
      if (avatar && currentUser) avatar.textContent = currentUser.name?.[0] || 'A';
      if (name && currentUser) name.textContent = currentUser.name || 'Utilizator';
      if (plan && currentUser) plan.textContent = currentUser.plan ? 'Plan ' + currentUser.plan : 'Plan Free';
      if (currentUser?.role === 'admin') {
        document.querySelectorAll('.sidebar-item.admin-link').forEach(function(el) { el.style.display = ''; });
      }
    },

    closeAll() { 
      this.closeDetail(); 
      this.closePlayer(); 
      this.closeSearch(); 
      this.closeGuide(); 
    },

    // ====== CACHE ======
    cache() {
      const $ = (s) => document.querySelector(s);
      const $$ = (s) => document.querySelectorAll(s);
      this.els = {
        login: $('#login-screen'), register: $('#register-screen'),
        forgot: $('#forgot-screen'), reset: $('#reset-screen'),
        settings: $('#settings-screen'), profileScreen: $('#profile-screen'),
        app: $('#app'), loginForm: $('#loginForm'), registerForm: $('#registerForm'),
        forgotForm: $('#forgotForm'), resetForm: $('#resetForm'),
        changePassForm: $('#changePasswordForm'),
        loginToggle: $('#loginToggle'), registerToggle: $('#registerToggle'),
        forgotLink: $('#forgotLink'), backToLogin: $('#backToLogin'), backToLogin2: $('#backToLogin2'),
        authError: $('#authError'), registerError: $('#registerError'),
        forgotError: $('#forgotError'), forgotSuccess: $('#forgotSuccess'),
        resetError: $('#resetError'), changePassError: $('#changePassError'),
        changePassSuccess: $('#changePassSuccess'),
        header: $('#header'),
        heroBackdrop: $('#heroBackdrop'), heroTitle: $('#heroTitle'),
        heroDesc: $('#heroDescription'), heroGenres: $('#heroGenres'),
        heroContent: $('.hero-content'),
        heroDots: $('#heroDots'), heroPrev: $('#heroPrev'), heroNext: $('#heroNext'),
        heroPlay: $('#heroPlayBtn'), heroInfo: $('#heroInfoBtn'), heroAdd: $('#heroAddListBtn'),
        continueRow: $('#continueWatchingRow'), liveStrip: $('#liveStripContainer'),
        contentRows: $('#contentRows'), notifBadge: $('#notifBadge'),
        notifBtn: $('#notifBtn'),
        searchOverlay: $('#searchOverlay'), searchInput: $('#searchOverlayInput'),
        searchClose: $('#searchOverlayClose'), searchResults: $('#searchResultsGrid'),
        searchTags: $('#searchTags'),
        detailModal: $('#detailModal'), modalClose: $('.modal-close'),
        modalBg: $('.modal-backdrop'), modalHeroBg: $('#modalHeroBg'),
        modalTitle: $('#modalTitle'), modalMeta: $('#modalMeta'),
        modalGenres: $('#modalGenres'), modalDesc: $('#modalDescription'),
        modalCast: $('#modalCast'), modalDur: $('#modalDuration'),
        modalYear: $('#modalYear'), modalRating: $('#modalRating'),
        similarGrid: $('#similarGrid'),
        playerModal: $('#playerModal'), playerTitle: $('#playerTitle'),
        playerFrame: $('#playerFrame'), playerClose: $('#playerCloseBtn'),
        playerProgress: $('#playerProgressFill'),
        channelGuide: $('#channelGuide'), guideContent: $('#channelGuideContent'),
        guideClose: $('#channelGuideClose'), toastContainer: $('#toastContainer'),
        navItems: $$('.nav-item'), mobileNav: $$('.mobile-nav-item'),
        genreItems: $$('.genre-filter-item'),
        avatarPreview: $('#avatarPreview'), avatarInput: $('#avatarInput'),
        avatarInitials: $('#avatarInitials'),
        settingsName: $('#settingsName'), settingsEmail: $('#settingsEmail'),
        settingsPlan: $('#settingsPlan'), settingsVerified: $('#settingsVerified'),
        dropdownUserName: $('#dropdownUserName'), dropdownUserPlan: $('#dropdownUserPlan'),
        profileSettingsBtn: $('#profileSettingsBtn'), profileLogoutBtn: $('#profileLogoutBtn'),
        backToAppBtn: $('#backToAppBtn'), verifyBanner: $('#verifyBanner'),
        closeVerifyBanner: $('#closeVerifyBanner'),
      };
    },

    // ====== BIND ======
    bind() {
      // Auth forms
      if (this.els.loginForm) this.els.loginForm.addEventListener('submit', (e) => this.login(e));
      if (this.els.registerForm) this.els.registerForm.addEventListener('submit', (e) => this.register(e));
      if (this.els.forgotForm) this.els.forgotForm.addEventListener('submit', (e) => this.forgotPassword(e));
      if (this.els.resetForm) this.els.resetForm.addEventListener('submit', (e) => this.resetPassword(e));
      if (this.els.changePassForm) this.els.changePassForm.addEventListener('submit', (e) => this.changePassword(e));

      // Screen toggles
      if (this.els.loginToggle) this.els.loginToggle.addEventListener('click', (e) => { e.preventDefault(); this.showScreen('register'); });
      if (this.els.registerToggle) this.els.registerToggle.addEventListener('click', (e) => { e.preventDefault(); this.showScreen('login'); });
      if (this.els.forgotLink) this.els.forgotLink.addEventListener('click', (e) => { e.preventDefault(); this.showScreen('forgot'); });
      if (this.els.backToLogin) this.els.backToLogin.addEventListener('click', (e) => { e.preventDefault(); this.showScreen('login'); });
      if (this.els.backToLogin2) this.els.backToLogin2.addEventListener('click', (e) => { e.preventDefault(); this.showScreen('login'); });

      // Language
      document.getElementById('loginLangSwitch')?.addEventListener('click', () => this.toggleLanguage());
      document.getElementById('headerLangBtn')?.addEventListener('click', () => this.toggleLanguage());
      document.querySelectorAll('.lang-flag').forEach(flag => {
        flag.addEventListener('click', () => this.applyLanguage(flag.dataset.lang));
      });
      document.querySelectorAll('.lang-option').forEach(opt => {
        opt.addEventListener('click', () => {
          document.querySelectorAll('.lang-option').forEach(b => b.classList.remove('active'));
          opt.classList.add('active');
          this.applyLanguage(opt.dataset.lang);
        });
      });

      // Google login
      document.getElementById('googleLoginBtn')?.addEventListener('click', () => this.googleLogin());

      // Sidebar
      document.getElementById('sidebarToggle')?.addEventListener('click', () => this.toggleSidebar());
      document.getElementById('sidebarClose')?.addEventListener('click', () => this.closeSidebar());
      document.getElementById('sidebarOverlay')?.addEventListener('click', () => this.closeSidebar());
      document.querySelectorAll('.sidebar-item[data-section]').forEach(function(el) {
        el.addEventListener('click', function(e) {
          e.preventDefault();
          var section = this.getAttribute('data-section');
          App.closeSidebar();
          App.navTo(section);
          // Update active state
          document.querySelectorAll('.sidebar-item').forEach(function(s) { s.classList.remove('active'); });
          this.classList.add('active');
        });
      });
      document.getElementById('sidebarLogout')?.addEventListener('click', function(e) { e.preventDefault(); App.logout(); App.closeSidebar(); });

      // Profile screen
      if (this.els.profileSettingsBtn) this.els.profileSettingsBtn.addEventListener('click', () => this.showScreen('settings'));
      if (this.els.profileLogoutBtn) this.els.profileLogoutBtn.addEventListener('click', () => this.logout());
      if (this.els.backToAppBtn) this.els.backToAppBtn.addEventListener('click', () => this.showScreen('profiles'));

      // Avatar
      if (this.els.avatarPreview) this.els.avatarPreview.addEventListener('click', () => this.els.avatarInput?.click());
      if (this.els.avatarInput) this.els.avatarInput.addEventListener('change', (e) => this.uploadAvatar(e));

      // ====== PREMIUM FEATURES INIT ======
      this.initKeyboardShortcuts();
      document.getElementById("heroShuffleBtn")?.addEventListener("click", () => this.playShuffle());
      document.getElementById("playerXrayBtn")?.addEventListener("click", () => this.toggleXRay());
      document.getElementById("playerPipBtn")?.addEventListener("click", () => this.togglePiP());
      document.getElementById("playerQualitySelect")?.addEventListener("change", (e) => this.setQuality(e.target.value));
      setTimeout(() => this.initCardPreviews(), 2000);
      // Password strength
      document.getElementById('regPassword')?.addEventListener('input', (e) => this.checkStrength(e.target.value));

      // Verify banner
      if (this.els.closeVerifyBanner) this.els.closeVerifyBanner.addEventListener('click', () => {
        this.els.verifyBanner.style.display = 'none';
        sessionStorage.setItem('verify_banner_dismissed', 'true');
      });
      document.getElementById('resendVerifyLink')?.addEventListener('click', (e) => { e.preventDefault(); this.resendVerification(); });
      document.getElementById('resendVerifyLinkEn')?.addEventListener('click', (e) => { e.preventDefault(); this.resendVerification(); });

      // Hero
      if (this.els.heroPrev) this.els.heroPrev.addEventListener('click', () => { this.stopHero(); this.navHero(-1); });
      if (this.els.heroNext) this.els.heroNext.addEventListener('click', () => { this.stopHero(); this.navHero(1); });
      if (this.els.heroPlay) this.els.heroPlay.addEventListener('click', () => { if (currentHeroItem) this.openPlayer(currentHeroItem.id); });
      if (this.els.heroInfo) this.els.heroInfo.addEventListener('click', () => { if (currentHeroItem) this.openDetail(currentHeroItem.id); });
      if (this.els.heroAdd) this.els.heroAdd.addEventListener('click', () => { if (currentHeroItem) this.toggleWatchlist(currentHeroItem.id); });

      // Scroll
      window.addEventListener('scroll', () => {
        if (this.els.header) this.els.header.classList.toggle('scrolled', window.scrollY > 50);
      });

      // Search toggle
      document.querySelector('.search-toggle')?.addEventListener('click', () => {
        this.els.searchOverlay?.classList.toggle('active');
        if (this.els.searchOverlay?.classList.contains('active')) {
          setTimeout(() => this.els.searchInput?.focus(), 100);
        }
      });
      if (this.els.searchInput) this.els.searchInput.addEventListener('input', (e) => this.search(e.target.value));
      if (this.els.searchClose) this.els.searchClose.addEventListener('click', () => this.closeSearch());
      if (this.els.searchOverlay) this.els.searchOverlay.addEventListener('click', (e) => { if (e.target === this.els.searchOverlay) this.closeSearch(); });
      if (this.els.searchTags) this.els.searchTags.addEventListener('click', (e) => {
        const tag = e.target.closest('.search-tag');
        if (tag) { this.els.searchInput.value = tag.textContent.trim(); this.search(tag.textContent.trim()); }
      });

      // Search advanced button
      document.getElementById('searchAdvancedBtn')?.addEventListener('click', () => {
        this.closeSearch();
        this.showScreen('search-page');
      });

      // Search page
      document.getElementById('searchPageInput')?.addEventListener('input', () => this.searchAdvanced());
      document.getElementById('sfSearchBtn')?.addEventListener('click', () => this.searchAdvanced());
      document.getElementById('sfGenre')?.addEventListener('change', () => this.searchAdvanced());
      document.getElementById('sfType')?.addEventListener('change', () => this.searchAdvanced());
      document.getElementById('sfYearFrom')?.addEventListener('change', () => this.searchAdvanced());
      document.getElementById('sfSort')?.addEventListener('change', () => this.searchAdvanced());
      document.getElementById('searchPageBack')?.addEventListener('click', () => this.showScreen('app'));

      // My List page
      document.getElementById('myListBack')?.addEventListener('click', () => this.showScreen('app'));
      document.getElementById('myListGenreFilter')?.addEventListener('change', () => this.renderMyList());
      document.getElementById('myListTypeFilter')?.addEventListener('change', () => this.renderMyList());
      document.getElementById('myListSortFilter')?.addEventListener('change', () => this.renderMyList());

      // Notifications
      document.getElementById('notifBack')?.addEventListener('click', () => this.showScreen('app'));
      document.getElementById('notifReadAll')?.addEventListener('click', () => this.markAllNotifsRead());
      if (this.els.notifBtn) this.els.notifBtn.addEventListener('click', () => this.navTo('notifications'));

      // Watch History (NEW)
      document.getElementById('whBack')?.addEventListener('click', () => this.showScreen('app'));
      document.getElementById('whRefresh')?.addEventListener('click', () => this.renderWatchHistory(1));
      document.getElementById('whClear')?.addEventListener('click', () => this.clearWatchHistory());

      // Downloads (NEW)
      document.getElementById('dlBack')?.addEventListener('click', () => this.showScreen('app'));

      // Admin (NEW)
      document.getElementById('adminBack')?.addEventListener('click', () => this.showScreen('app'));
      document.getElementById('adminAddContentBtn')?.addEventListener('click', () => this.adminShowAddContent());
      document.getElementById('acSaveBtn')?.addEventListener('click', () => this.adminSaveContent());
      document.getElementById('acCancelBtn')?.addEventListener('click', () => {
        document.getElementById('adminContentModal').style.display = 'none';
      });

      // Reviews (NEW)
      document.querySelectorAll('.review-stars .star').forEach(star => {
        star.addEventListener('click', () => {
          reviewRating = parseInt(star.dataset.val);
          document.querySelectorAll('.review-stars .star').forEach(s => {
            s.classList.toggle('active', parseInt(s.dataset.val) <= reviewRating);
          });
        });
        star.addEventListener('mouseenter', () => {
          const val = parseInt(star.dataset.val);
          document.querySelectorAll('.review-stars .star').forEach(s => {
            s.style.color = parseInt(s.dataset.val) <= val ? 'var(--yellow)' : '';
          });
        });
        star.addEventListener('mouseleave', () => {
          document.querySelectorAll('.review-stars .star').forEach(s => {
            s.style.color = '';
          });
        });
      });
      document.getElementById('reviewSubmitBtn')?.addEventListener('click', () => this.submitReview());

      // Recommendations refresh
      document.getElementById('recRefresh')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.loadRecommendations();
        this.toast(appLang === 'ro' ? 'Recomandări actualizate' : 'Recommendations refreshed', 'info');
      });

      // Modals
      if (this.els.modalClose) this.els.modalClose.addEventListener('click', () => this.closeDetail());
      if (this.els.modalBg) this.els.modalBg.addEventListener('click', () => this.closeDetail());
      if (this.els.playerClose) this.els.playerClose.addEventListener('click', () => this.closePlayer());
      if (this.els.playerModal) this.els.playerModal.addEventListener('click', (e) => { if (e.target === this.els.playerModal) this.closePlayer(); });
      if (this.els.guideClose) this.els.guideClose.addEventListener('click', () => this.closeGuide());
      if (this.els.channelGuide) this.els.channelGuide.addEventListener('click', (e) => { if (e.target === this.els.channelGuide) this.closeGuide(); });

      // Player controls
      document.getElementById('playerPlayBtn')?.addEventListener('click', () => this.playerPlayPause());
      document.getElementById('playerPrevBtn')?.addEventListener('click', () => this.playerPrev());
      document.getElementById('playerNextBtn')?.addEventListener('click', () => this.playerNext());
      document.getElementById('playerRewindBtn')?.addEventListener('click', () => this.playerRewind());
      document.getElementById('playerForwardBtn')?.addEventListener('click', () => this.playerForward());
      document.getElementById('playerVolumeBtn')?.addEventListener('click', () => this.playerToggleMute());
      document.getElementById('playerVolumeRange')?.addEventListener('input', (e) => this.playerSetVolume(e.target.value));
      document.getElementById('playerSpeedBtn')?.addEventListener('click', () => this.playerCycleSpeed());
      document.getElementById('playerFullscreenBtn')?.addEventListener('click', () => this.playerToggleFullscreen());
      document.getElementById('playerEpisodesBtn')?.addEventListener('click', () => this.playerToggleEpisodes());
      document.getElementById('playerSubtitlesBtn')?.addEventListener('click', () => this.playerToggleSubtitles());
      document.getElementById('playerProgressBar')?.addEventListener('click', (e) => this.playerSeek(e));
      document.getElementById('playerBigPlayBtn')?.addEventListener('click', () => this.playerPlayPause());

      // Keyboard
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { this.closeAllModals(); this.closeAll(); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); document.querySelector('.search-toggle')?.click(); }
        if (e.key === 'ArrowLeft' && !this.els.searchOverlay?.classList.contains('active')) { this.stopHero(); this.navHero(-1); }
        if (e.key === 'ArrowRight' && !this.els.searchOverlay?.classList.contains('active')) { this.stopHero(); this.navHero(1); }
        if (this.els.playerModal?.classList.contains('active')) {
          if (e.key === ' ') { e.preventDefault(); this.playerPlayPause(); }
          if (e.key === 'ArrowLeft') this.playerRewind();
          if (e.key === 'ArrowRight') this.playerForward();
          if (e.key === 'f' || e.key === 'F') this.playerToggleFullscreen();
          if (e.key === 'm' || e.key === 'M') this.playerToggleMute();
        }
      });

      // Wheel scroll
      document.querySelectorAll('.content-row, .live-strip, .channel-guide-progs').forEach(el => {
        el.addEventListener('wheel', (e) => {
          if (Math.abs(e.deltaY) > 5) { e.preventDefault(); el.scrollLeft += e.deltaY > 0 ? 60 : -60; }
        }, { passive: false });
      });

      // Dropdown items
      document.querySelectorAll('.dropdown-item').forEach(item => {
        const action = item.dataset.action;
        item.addEventListener('click', (e) => {
          e.preventDefault();
          const actions = {
            'logout': () => this.logout(),
            'profiles': () => this.showScreen('profiles'),
            'settings': () => { this.loadSettings(); this.showScreen('settings'); },
            'profile': () => { this.loadSettings(); this.showScreen('settings'); },
            'notifications': () => { this.renderNotifications(); this.showScreen('notifications'); },
            'my-list-dropdown': () => { this.renderMyList(); this.showScreen('my-list'); },
            'watch-history': () => { whPage = 1; this.renderWatchHistory(); this.showScreen('watch-history'); },
            'downloads': () => { this.renderDownloads(); this.showScreen('downloads'); },
            'admin': () => { this.adminRefresh(); this.showScreen('admin'); },
            'billing': () => { this.navTo('billing'); },
          };
          const fn = actions[action];
          fn ? fn() : this.toast(appLang === 'ro' ? 'Funcționalitate în dezvoltare' : 'Feature in development', 'info');
        });
      });

      // Navigation
      this.els.navItems?.forEach(item => {
        item.addEventListener('click', (e) => { e.preventDefault(); App.closeSidebar(); const s = item.querySelector('a')?.dataset.section; if (s === 'my-list') this.navTo('my-list'); else { this.showScreen('app'); this.nav(s); } });
      });
      this.els.mobileNav?.forEach(item => {
        item.addEventListener('click', (e) => { e.preventDefault(); App.closeSidebar(); const s = item.dataset.section; if (s === 'my-list') this.navTo('my-list'); else { this.showScreen('app'); this.nav(s); } });
      });

      // Genre filter
      if (!genreBound && this.els.genreItems.length) {
        genreBound = true;
        this.els.genreItems.forEach(item => {
          item.addEventListener('click', () => {
            this.els.genreItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            const genre = item.dataset.genre;
            document.querySelectorAll('.content-section').forEach(s => {
              if (genre === 'all') { s.style.display = ''; return; }
              const has = [...s.querySelectorAll('.content-card-genre')].some(g =>
                g.textContent.toLowerCase().includes(genre.toLowerCase())
              );
              s.style.display = has ? '' : 'none';
            });
            ['#continueWatching', '#liveStrip', '.top10-row', '.plans-section', '#recommendationsSection'].forEach(sel => {
              const el = document.querySelector(sel);

            });
          });
        });
      }
    },

    async resendVerification() {
      if (!currentUser?.email) return;
      try {
        await fetch(`${API}/auth/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: currentUser.email }) });
        this.toast(appLang === 'ro' ? 'Link retrimis!' : 'Link resent!', 'success');
      } catch { this.toast('Eroare', 'error'); }
    },
  };

  window.App = App;
  document.addEventListener('DOMContentLoaded', () => App.init());
})();
