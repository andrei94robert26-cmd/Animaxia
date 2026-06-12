/* ============================================
   Animaxia Parental Controls Module v1.0
   Screen time limits, content filters, 
   activity reports, approval requests
   ============================================ */

(function() {
  'use strict';

  if (typeof App === 'undefined') { setTimeout(arguments.callee, 500); return; }

  const PM = {
    currentProfileId: null,

    init() {
      this.addParentalUI();
      this.addProfileManagement();
      this.trackUsage();
    },

    // ====== ADD PARENTAL CONTROLS TO SETTINGS ======
    addParentalUI() {
      // Add "Parental Controls" to user dropdown
      const dropdown = document.querySelector('.user-dropdown');
      if (dropdown) {
        const billingLink = dropdown.querySelector('[data-action="billing"]');
        if (billingLink) {
          const li = document.createElement('div');
          li.className = 'dropdown-divider';
          billingLink.parentNode.insertBefore(li, billingLink);
          const parentalLink = document.createElement('a');
          parentalLink.href = '#';
          parentalLink.className = 'dropdown-item';
          parentalLink.setAttribute('data-action', 'parental');
          parentalLink.innerHTML = '<i class="fas fa-child"></i> <span data-lang="ro">Control Parental</span><span data-lang="en" style="display:none;">Parental Controls</span>';
          billingLink.parentNode.insertBefore(parentalLink, billingLink);
          parentalLink.addEventListener('click', (e) => {
            e.preventDefault();
            this.openParentalPanel();
          });
        }
      }

      // Watch for kid profile selection to check screen time
      const origSelectProfile = App.selectProfile;
      if (origSelectProfile) {
        App.selectProfile = async function(profileId) {
          const profiles = await PM.getProfiles();
          const prof = profiles.find(p => p.id === profileId);
          if (prof?.is_kid) {
            PM.currentProfileId = profileId;
            const allowed = await PM.checkScreenTime(profileId);
            if (!allowed) {
              App.toast(window.appLang === 'en' ? '⏰ Screen time limit reached for today!' : '⏰ Timpul zilnic de ecran a fost atins!', 'error');
              App.showScreen('profiles');
              return;
            }
            // Check bedtime
            if (PM.isBedtime(profileId)) {
              App.toast(window.appLang === 'en' ? '🌙 Bedtime! Come back tomorrow.' : '🌙 E ora de culcare! Revino mâine.', 'info');
              App.showScreen('profiles');
              return;
            }
          }
          return origSelectProfile.call(this, profileId);
        };
      }
    },

    async getProfiles() {
      try {
        const res = await fetch(`/api/auth/session`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('animaxia_token')}` }
        });
        const data = await res.json();
        return data.success ? data.profiles || [] : [];
      } catch { return []; }
    },

    // ====== SCREEN TIME ======
    async checkScreenTime(profileId) {
      const token = localStorage.getItem('animaxia_token');
      if (!token) return true;
      try {
        const res = await fetch(`/api/parental/settings/${profileId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success || !data.data?.settings) return true;

        const settings = data.data.settings;
        if (!settings.is_active) return true;
        
        // Cache bedtime settings for isBedtime check
        if (!PM._bedtimeSettings) PM._bedtimeSettings = {};
        PM._bedtimeSettings[profileId] = settings;

        const today = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date().getDay()];
        const dayLimit = settings[today] || settings.daily_limit_minutes || 120;
        const used = data.data.todayUsage?.minutes_watched || 0;
        
        return used < dayLimit;
      } catch { return true; }
    },

    isBedtime(profileId) {
      // Checked via stored settings
      const bedtime = PM._bedtimeSettings?.[profileId];
      if (!bedtime) return false;
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const current = hours * 60 + minutes;
      
      const startParts = (bedtime.bedtime_start || '21:00').split(':').map(Number);
      const endParts = (bedtime.bedtime_end || '07:00').split(':').map(Number);
      const startMins = startParts[0] * 60 + startParts[1];
      const endMins = endParts[0] * 60 + endParts[1];
      
      if (startMins < endMins) {
        return current >= startMins && current <= endMins;
      } else {
        return current >= startMins || current <= endMins;
      }
    },

    // ====== TRACK USAGE ======
    trackUsage() {
      let trackingInterval = null;
      let trackingProfile = null;
      
      // Monkey-patch openPlayer to start tracking (using Player module if available)
      const origOpenPlayer = App.openPlayer;
      if (origOpenPlayer) {
        App.openPlayer = async function(...args) {
          // Use Player module directly if available
          if (window.Player && args[0]) {
            const item = AnimaxiaData.findItem ? AnimaxiaData.findItem(args[0]) : null;
            if (item) {
              Player.play(item);
              if (PM.currentProfileId) {
                trackingProfile = PM.currentProfileId;
                if (trackingInterval) clearInterval(trackingInterval);
                trackingInterval = setInterval(() => {
                  if (trackingProfile) {
                    fetch(`/api/parental/usage/${trackingProfile}`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ minutes: 1 })
                    }).catch(() => {});
                  }
                }, 60000);
              }
              return;
            }
          }
          
          const result = await origOpenPlayer.apply(this, args);
          if (PM.currentProfileId) {
            trackingProfile = PM.currentProfileId;
            if (trackingInterval) clearInterval(trackingInterval);
            trackingInterval = setInterval(() => {
              if (trackingProfile) {
                fetch(`/api/parental/usage/${trackingProfile}`, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ minutes: 1 })
                }).catch(() => {});
              }
            }, 60000); // Every minute
          }
          return result;
        };
        
        // Stop tracking on close
        const origClosePlayer = App.closePlayer;
        App.closePlayer = function() {
          if (trackingInterval) { clearInterval(trackingInterval); trackingInterval = null; }
          trackingProfile = null;
          return origClosePlayer.apply(this, arguments);
        };
      }
    },

    // ====== PARENTAL CONTROLS PANEL ======
    openParentalPanel(profileId) {
      const existing = document.getElementById('parentalModal');
      if (existing) existing.remove();
      
      const modal = document.createElement('div');
      modal.id = 'parentalModal';
      modal.className = 'admin-modal-overlay';
      modal.style.zIndex = '10001';
      
      const token = localStorage.getItem('animaxia_token');
      
      // Load all kid profiles first
      fetch(`/api/auth/session`, { headers: { 'Authorization': `Bearer ${token}` } })
        .then(r => r.json())
        .then(async sessionData => {
          if (!sessionData.success) return;
          const kidProfiles = (sessionData.profiles || []).filter(p => p.is_kid);
          
          if (kidProfiles.length === 0) {
            modal.innerHTML = `
              <div class="admin-modal" style="max-width:500px;">
                <div style="text-align:center;padding:20px;">
                  <i class="fas fa-child" style="font-size:48px;color:var(--accent-secondary);margin-bottom:12px;"></i>
                  <h3>${window.appLang === 'en' ? 'No Kid Profiles' : 'Nicio profil de copii'}</h3>
                  <p style="color:var(--text-tertiary);margin:12px 0;">
                    ${window.appLang === 'en' ? 'Create a kids profile first in Manage Profiles.' : 'Creează mai întâi un profil de copii în Gestionează Profiluri.'}
                  </p>
                  <button class="btn btn-secondary" onclick="document.getElementById('parentalModal').remove()" style="justify-content:center;">
                    ${window.appLang === 'en' ? 'Close' : 'Închide'}
                  </button>
                </div>
              </div>`;
            document.body.appendChild(modal);
            return;
          }
          
          modal.innerHTML = `
            <div class="admin-modal" style="max-width:600px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
                <h3><i class="fas fa-child" style="color:var(--accent-secondary);"></i> ${window.appLang === 'en' ? 'Parental Controls' : 'Control Parental'}</h3>
                <button class="quiz-modal-close" onclick="document.getElementById('parentalModal').remove()"><i class="fas fa-times"></i></button>
              </div>
              
              <div class="parental-tabs" style="display:flex;gap:8px;margin-bottom:16px;">
                <button class="parental-tab active" data-tab="profiles" style="padding:6px 16px;border-radius:8px;font-size:13px;font-weight:600;background:var(--accent-primary);color:white;">
                  <i class="fas fa-users"></i> ${window.appLang === 'en' ? 'Profiles' : 'Profiluri'}
                </button>
                <button class="parental-tab" data-tab="limits" style="padding:6px 16px;border-radius:8px;font-size:13px;font-weight:600;background:rgba(255,255,255,0.06);color:var(--text-tertiary);">
                  <i class="fas fa-clock"></i> ${window.appLang === 'en' ? 'Screen Time' : 'Timp Ecran'}
                </button>
                <button class="parental-tab" data-tab="filters" style="padding:6px 16px;border-radius:8px;font-size:13px;font-weight:600;background:rgba(255,255,255,0.06);color:var(--text-tertiary);">
                  <i class="fas fa-filter"></i> ${window.appLang === 'en' ? 'Filters' : 'Filtre'}
                </button>
                <button class="parental-tab" data-tab="reports" style="padding:6px 16px;border-radius:8px;font-size:13px;font-weight:600;background:rgba(255,255,255,0.06);color:var(--text-tertiary);">
                  <i class="fas fa-chart-bar"></i> ${window.appLang === 'en' ? 'Reports' : 'Rapoarte'}
                </button>
              </div>
              
              <div id="parentalContent">
                ${PM.renderProfileList(kidProfiles, token)}
              </div>
            </div>`;
          document.body.appendChild(modal);
          
          // Tab switching
          modal.querySelectorAll('.parental-tab').forEach(tab => {
            tab.addEventListener('click', () => {
              modal.querySelectorAll('.parental-tab').forEach(t => {
                t.style.background = 'rgba(255,255,255,0.06)';
                t.style.color = 'var(--text-tertiary)';
              });
              tab.style.background = 'var(--accent-primary)';
              tab.style.color = 'white';
              PM.showParentalTab(tab.dataset.tab, kidProfiles, token);
            });
          });
        })
        .catch(() => {});
    },

    renderProfileList(profiles, token) {
      const lang = window.appLang || 'ro';
      return `
        <div style="max-width:400px;margin:0 auto;">
          <p style="color:var(--text-tertiary);font-size:13px;margin-bottom:16px;text-align:center;">
            ${lang === 'en' ? 'Select a kid profile to manage' : 'Selectează un profil de copii pentru gestionare'}
          </p>
          <div style="display:flex;flex-direction:column;gap:12px;">
            ${profiles.map(p => `
              <div class="parental-profile-card" data-pid="${p.id}" style="display:flex;align-items:center;gap:16px;padding:14px 18px;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);cursor:pointer;transition:all var(--transition-normal);">
                <div style="width:48px;height:48px;border-radius:50%;background:${p.color};display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:white;flex-shrink:0;">
                  ${p.name[0]}
                </div>
                <div style="flex:1;">
                  <div style="font-size:15px;font-weight:600;">${p.name}</div>
                  <div style="font-size:12px;color:var(--text-tertiary);">
                    <i class="fas fa-child"></i> ${lang === 'en' ? 'Kid Profile' : 'Profil Copii'}
                  </div>
                </div>
                <i class="fas fa-chevron-right" style="color:var(--text-tertiary);font-size:14px;"></i>
              </div>
            `).join('')}
          </div>
        </div>`;
    },

    async showParentalTab(tab, profiles, token) {
      const content = document.getElementById('parentalContent');
      if (!content) return;
      
      const selectedProfile = document.querySelector('.parental-profile-card.active');
      const profileId = selectedProfile?.dataset.pid || profiles[0]?.id;
      if (!profileId) return;
      
      if (tab === 'profiles') {
        content.innerHTML = this.renderProfileList(profiles, token);
        this.bindProfileCards(profiles, token);
        return;
      }
      
      let settings = null;
      let usage = null;
      let blocklist = [];
      let approvals = [];
      try {
        const res = await fetch(`/api/parental/settings/${profileId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
          settings = data.data.settings;
          usage = data.data.todayUsage;
          blocklist = data.data.blocklist || [];
          approvals = data.data.pendingApprovals || [];
        }
      } catch {}
      
      const lang = window.appLang || 'ro';
      const prof = profiles.find(p => p.id === profileId);
      
      if (tab === 'limits') {
        content.innerHTML = PM.renderScreenTime(profileId, settings, usage, prof, lang);
        PM.bindScreenTimeEvents(profileId, token);
      } else if (tab === 'filters') {
        content.innerHTML = PM.renderFilters(profileId, settings, blocklist, approvals, prof, lang);
        PM.bindFilterEvents(profileId, token);
      } else if (tab === 'reports') {
        content.innerHTML = await PM.renderReports(profileId, token, lang);
      }
      
      // Highlight selected profile
      document.querySelectorAll('.parental-profile-card').forEach(c => c.classList.remove('active'));
      document.querySelector(`.parental-profile-card[data-pid="${profileId}"]`)?.classList.add('active');
      this.bindProfileCards(profiles, token);
    },

    bindProfileCards(profiles, token) {
      document.querySelectorAll('.parental-profile-card').forEach(card => {
        card.addEventListener('click', () => {
          const pid = card.dataset.pid;
          const activeTab = document.querySelector('.parental-tab.active');
          const tab = activeTab?.dataset.tab || 'limits';
          PM.showParentalTab(tab, profiles, token);
        });
      });
    },

    renderScreenTime(profileId, settings, usage, prof, lang) {
      const s = settings || {};
      const today = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date().getDay()];
      const dayLimit = s[today] || s.daily_limit_minutes || 120;
      const used = usage?.minutes_watched || 0;
      const remaining = Math.max(0, dayLimit - used);
      const pct = dayLimit > 0 ? Math.min(100, (used / dayLimit) * 100) : 0;
      
      return `
        <div style="text-align:center;margin-bottom:20px;">
          <div style="display:flex;align-items:center;gap:12px;justify-content:center;margin-bottom:16px;">
            <div style="width:40px;height:40px;border-radius:50%;background:${prof?.color||'#6c5ce7'};display:flex;align-items:center;justify-content:center;font-weight:700;color:white;">${prof?.name?.[0]||'K'}</div>
            <span style="font-size:18px;font-weight:700;">${prof?.name||'Kid'}</span>
          </div>
          
          <div class="parental-usage-ring" style="position:relative;width:140px;height:140px;margin:0 auto 16px;">
            <svg width="140" height="140" style="transform:rotate(-90deg);">
              <circle cx="70" cy="70" r="60" stroke="rgba(255,255,255,0.06)" stroke-width="8" fill="none"/>
              <circle cx="70" cy="70" r="60" stroke="var(--accent-gradient)" stroke-width="8" fill="none" 
                stroke-dasharray="${2 * Math.PI * 60}" stroke-dashoffset="${2 * Math.PI * 60 * (1 - pct/100)}"
                style="transition:stroke-dashoffset 1s ease;stroke:${pct > 80 ? 'var(--red)' : pct > 50 ? 'var(--yellow)' : 'var(--green)'};"/>
            </svg>
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;">
              <div style="font-size:32px;font-weight:900;">${remaining}</div>
              <div style="font-size:11px;color:var(--text-tertiary);">${lang === 'en' ? 'min left' : 'min rămase'}</div>
            </div>
          </div>
          
          <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:4px;">
            ${lang === 'en' ? 'Used' : 'Folosit'}: <strong>${used}min</strong> / ${dayLimit}min
          </div>
          <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:20px;">
            ${lang === 'en' ? 'Sessions today' : 'Sesiuni azi'}: ${usage?.sessions_count || 0}
          </div>
        </div>
        
        <div style="padding:16px;background:rgba(255,255,255,0.02);border-radius:12px;border:1px solid rgba(255,255,255,0.06);">
          <h4 style="font-size:14px;font-weight:600;margin-bottom:16px;">
            <i class="fas fa-cog"></i> ${lang === 'en' ? 'Daily Limits (minutes)' : 'Limite Zilnice (minute)'}
          </h4>
          <div class="parental-day-limits" style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:16px;">
            ${[
              {key:'monday',label:lang==='en'?'Mon':'Lun'},{key:'tuesday',label:lang==='en'?'Tue':'Mar'},
              {key:'wednesday',label:lang==='en'?'Wed':'Mie'},{key:'thursday',label:lang==='en'?'Thu':'Joi'},
              {key:'friday',label:lang==='en'?'Fri':'Vin'},{key:'saturday',label:lang==='en'?'Sat':'Sâm'},
              {key:'sunday',label:lang==='en'?'Sun':'Dum'}
            ].map(d => `
              <div style="text-align:center;">
                <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:4px;">${d.label}</div>
                <input type="number" class="parental-day-input" data-day="${d.key}" 
                  value="${s[d.key] || s.daily_limit_minutes || 120}" 
                  min="0" max="600" step="15"
                  style="width:100%;text-align:center;padding:8px 4px;border-radius:8px;font-size:13px;font-weight:600;background:rgba(255,255,255,0.04);">
              </div>
            `).join('')}
          </div>
          
          <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px;">
            <i class="fas fa-bed" style="color:var(--text-tertiary);font-size:14px;"></i>
            <span style="font-size:13px;">${lang === 'en' ? 'Bedtime' : 'Ora de culcare'}</span>
            <input type="time" id="bedtimeStart" value="${s.bedtime_start||'21:00'}" style="width:80px;padding:6px 8px;border-radius:8px;font-size:12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);">
            <span style="color:var(--text-tertiary);">→</span>
            <input type="time" id="bedtimeEnd" value="${s.bedtime_end||'07:00'}" style="width:80px;padding:6px 8px;border-radius:8px;font-size:12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);">
          </div>
          
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;margin-bottom:16px;">
            <input type="checkbox" id="parentalActive" ${s.is_active !== false ? 'checked' : ''} style="width:auto;">
            ${lang === 'en' ? 'Enable screen time limits' : 'Activează limitele de timp'}
          </label>
          
          <button class="btn btn-primary" id="saveScreenTimeBtn" style="width:100%;justify-content:center;">
            <i class="fas fa-save"></i> ${lang === 'en' ? 'Save Settings' : 'Salvează Setări'}
          </button>
        </div>`;
    },

    bindScreenTimeEvents(profileId, token) {
      document.getElementById('saveScreenTimeBtn')?.addEventListener('click', async () => {
        const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
        const body = {};
        days.forEach(d => {
          const input = document.querySelector(`.parental-day-input[data-day="${d}"]`);
          if (input) body[d] = parseInt(input.value) || 120;
        });
        body.bedtime_start = document.getElementById('bedtimeStart')?.value || '21:00';
        body.bedtime_end = document.getElementById('bedtimeEnd')?.value || '07:00';
        body.is_active = document.getElementById('parentalActive')?.checked || false;
        
        try {
          const res = await fetch(`/api/parental/settings/${profileId}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(body)
          });
          const data = await res.json();
          if (data.success) {
            App.toast(window.appLang === 'en' ? '✅ Settings saved!' : '✅ Setări salvate!', 'success');
          }
        } catch { App.toast('Error saving', 'error'); }
      });
    },

    renderFilters(profileId, settings, blocklist, approvals, prof, lang) {
      return `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
          <div style="width:36px;height:36px;border-radius:50%;background:${prof?.color||'#6c5ce7'};display:flex;align-items:center;justify-content:center;font-weight:700;color:white;font-size:16px;">${prof?.name?.[0]||'K'}</div>
          <span style="font-size:16px;font-weight:600;">${prof?.name||'Kid'}</span>
        </div>
        
        <!-- Content Filter -->
        <div style="padding:16px;background:rgba(255,255,255,0.02);border-radius:12px;border:1px solid rgba(255,255,255,0.06);margin-bottom:12px;">
          <h4 style="font-size:14px;font-weight:600;margin-bottom:12px;">
            <i class="fas fa-shield-alt" style="color:var(--green);"></i> ${lang === 'en' ? 'Content Filter' : 'Filtru Conținut'}
          </h4>
          <select id="contentFilterSelect" style="width:100%;padding:10px 12px;border-radius:8px;font-size:13px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);">
            <option value="kids_only" ${(settings?.content_filter||'kids_only')==='kids_only'?'selected':''}>${lang === 'en' ? 'Kids only (safe content)' : 'Doar pentru copii (conținut sigur)'}</option>
            <option value="all_ages" ${settings?.content_filter==='all_ages'?'selected':''}>${lang === 'en' ? 'All ages (PG-13 included)' : 'Toate vârstele (inclusiv PG-13)'}</option>
            <option value="custom" ${settings?.content_filter==='custom'?'selected':''}>${lang === 'en' ? 'Custom (manually block)' : 'Personalizat (blochează manual)'}</option>
          </select>
        </div>
        
        <!-- Blocked Content -->
        <div style="padding:16px;background:rgba(255,255,255,0.02);border-radius:12px;border:1px solid rgba(255,255,255,0.06);margin-bottom:12px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <h4 style="font-size:14px;font-weight:600;">
              <i class="fas fa-ban" style="color:var(--red);"></i> ${lang === 'en' ? 'Blocked Content' : 'Conținut Blocat'}
            </h4>
            <span style="font-size:12px;color:var(--text-tertiary);">${blocklist.length} ${lang === 'en' ? 'items' : 'iteme'}</span>
          </div>
          ${blocklist.length === 0 
            ? `<p style="font-size:13px;color:var(--text-tertiary);padding:8px 0;">${lang === 'en' ? 'No content blocked yet.' : 'Niciun conținut blocat.'}</p>`
            : blocklist.map(b => `
              <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;background:rgba(231,76,60,0.06);margin-bottom:4px;">
                <span style="font-size:13px;flex:1;">${b.title || b.item_id}</span>
                <span style="font-size:11px;color:var(--text-tertiary);">${b.reason || ''}</span>
                <button class="unblock-btn" data-item="${b.item_id}" style="color:var(--red);font-size:12px;padding:4px 8px;border-radius:4px;">
                  <i class="fas fa-undo"></i>
                </button>
              </div>
            `).join('')}
        </div>
        
        <!-- Pending Approvals -->
        <div style="padding:16px;background:rgba(255,255,255,0.02);border-radius:12px;border:1px solid rgba(255,255,255,0.06);margin-bottom:12px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <h4 style="font-size:14px;font-weight:600;">
              <i class="fas fa-question-circle" style="color:var(--yellow);"></i> ${lang === 'en' ? 'Approval Requests' : 'Cereri de Aprobare'}
            </h4>
            <span style="font-size:12px;color:var(--text-tertiary);">${approvals.length} ${lang === 'en' ? 'pending' : 'în așteptare'}</span>
          </div>
          ${approvals.length === 0 
            ? `<p style="font-size:13px;color:var(--text-tertiary);padding:8px 0;">${lang === 'en' ? 'No pending requests.' : 'Nicio cerere în așteptare.'}</p>`
            : approvals.map(a => `
              <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;background:rgba(253,203,110,0.06);border:1px solid rgba(253,203,110,0.12);margin-bottom:6px;">
                <div style="width:32px;height:32px;border-radius:8px;background:${a.bg_color||'#1e1e2e'};display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;">🎬</div>
                <div style="flex:1;min-width:0;">
                  <div style="font-size:13px;font-weight:600;">${a.title}</div>
                  <div style="font-size:11px;color:var(--text-tertiary);">${(a.genre||[]).slice(0,2).join(', ')} • ${a.rating || ''}</div>
                </div>
                <button class="approve-btn" data-request="${a.id}" style="padding:6px 12px;border-radius:6px;background:rgba(0,184,148,0.15);color:var(--green);font-size:12px;font-weight:600;">
                  <i class="fas fa-check"></i>
                </button>
                <button class="deny-btn" data-request="${a.id}" style="padding:6px 12px;border-radius:6px;background:rgba(231,76,60,0.15);color:var(--red);font-size:12px;font-weight:600;">
                  <i class="fas fa-times"></i>
                </button>
              </div>
            `).join('')}
        </div>
        
        <button class="btn btn-primary" id="saveFilterBtn" style="width:100%;justify-content:center;margin-top:8px;">
          <i class="fas fa-save"></i> ${lang === 'en' ? 'Save Filters' : 'Salvează Filtre'}
        </button>`;
    },

    bindFilterEvents(profileId, token) {
      document.getElementById('saveFilterBtn')?.addEventListener('click', async () => {
        try {
          const contentFilter = document.getElementById('contentFilterSelect')?.value || 'kids_only';
          const res = await fetch(`/api/parental/settings/${profileId}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ content_filter: contentFilter })
          });
          const data = await res.json();
          if (data.success) App.toast(window.appLang === 'en' ? '✅ Filters saved!' : '✅ Filtre salvate!', 'success');
        } catch { App.toast('Error saving filters', 'error'); }
      });
      
      document.querySelectorAll('.unblock-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const itemId = btn.dataset.item;
          try {
            const res = await fetch(`/api/parental/block/${profileId}/${itemId}`, {
              method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
              App.toast(window.appLang === 'en' ? '✅ Content unblocked!' : '✅ Conținut deblocat!', 'success');
              btn.closest('div').remove();
            }
          } catch {}
        });
      });
      
      document.querySelectorAll('.approve-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const requestId = btn.dataset.request;
          try {
            const res = await fetch(`/api/parental/approve/${profileId}`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ requestId, status: 'approved' })
            });
            if (res.ok) {
              App.toast(window.appLang === 'en' ? '✅ Approved!' : '✅ Aprobat!', 'success');
              btn.closest('div').remove();
            }
          } catch {}
        });
      });
      
      document.querySelectorAll('.deny-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const requestId = btn.dataset.request;
          try {
            const res = await fetch(`/api/parental/approve/${profileId}`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ requestId, status: 'denied' })
            });
            if (res.ok) {
              App.toast(window.appLang === 'en' ? 'Denied' : 'Respins', 'info');
              btn.closest('div').remove();
            }
          } catch {}
        });
      });
    },

    async renderReports(profileId, token, lang) {
      try {
        const res = await fetch(`/api/parental/report/${profileId}?days=7`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error();
        
        const stats = data.data.stats || {};
        const dailyUsage = data.data.dailyUsage || [];
        const history = data.data.history || [];
        const topGenres = data.data.topGenres || [];
        
        return `
          <div>
            <!-- Stats Cards -->
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px;">
              <div style="padding:14px;border-radius:10px;background:rgba(108,92,231,0.1);border:1px solid rgba(108,92,231,0.15);text-align:center;">
                <div style="font-size:24px;font-weight:900;color:var(--accent-secondary);">${stats.totalSessions || 0}</div>
                <div style="font-size:11px;color:var(--text-tertiary);">${lang === 'en' ? 'Sessions' : 'Sesiuni'}</div>
              </div>
              <div style="padding:14px;border-radius:10px;background:rgba(0,184,148,0.1);border:1px solid rgba(0,184,148,0.15);text-align:center;">
                <div style="font-size:24px;font-weight:900;color:var(--green);">${stats.totalMinutes || 0}</div>
                <div style="font-size:11px;color:var(--text-tertiary);">${lang === 'en' ? 'Minutes' : 'Minute'}</div>
              </div>
              <div style="padding:14px;border-radius:10px;background:rgba(253,203,110,0.1);border:1px solid rgba(253,203,110,0.15);text-align:center;">
                <div style="font-size:24px;font-weight:900;color:var(--yellow);">${stats.uniqueItems || 0}</div>
                <div style="font-size:11px;color:var(--text-tertiary);">${lang === 'en' ? 'Titles' : 'Titluri'}</div>
              </div>
            </div>
            
            <!-- Weekly Chart (simple bar) -->
            <div style="padding:16px;background:rgba(255,255,255,0.02);border-radius:12px;border:1px solid rgba(255,255,255,0.06);margin-bottom:12px;">
              <h4 style="font-size:14px;font-weight:600;margin-bottom:12px;">
                <i class="fas fa-calendar-week"></i> ${lang === 'en' ? 'This Week' : 'Săptămâna Aceasta'}
              </h4>
              <div style="display:flex;gap:4px;height:80px;align-items:flex-end;">
                ${Array.from({length:7}, (_, i) => {
                  const date = new Date();
                  date.setDate(date.getDate() - (6 - i));
                  const dateStr = date.toISOString().split('T')[0];
                  const day = dailyUsage.find(d => {
                    const dStr = typeof d.date === 'string' ? d.date.split('T')[0] : '';
                    return dStr === dateStr;
                  });
                  const maxMins = Math.max(...dailyUsage.map(d => d.minutes_watched), 1);
                  const height = day ? (day.minutes_watched / maxMins) * 100 : 0;
                  const dayLabels = lang === 'en' ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] : ['Du','Lu','Ma','Mi','Jo','Vi','Sâ'];
                  return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">
                    <div style="flex:1;width:100%;display:flex;align-items:flex-end;justify-content:center;">
                      <div style="width:70%;border-radius:4px 4px 0 0;background:var(--accent-gradient);height:${height}%;min-height:${day ? '4px' : '0'};transition:height 0.5s ease;"></div>
                    </div>
                    <div style="font-size:9px;color:var(--text-tertiary);">${dayLabels[date.getDay()]}</div>
                    <div style="font-size:8px;color:var(--text-muted);">${day ? day.minutes_watched+'m' : ''}</div>
                  </div>`;
                }).join('')}
              </div>
            </div>
            
            <!-- Top Genres -->
            ${topGenres.length > 0 ? `
            <div style="padding:16px;background:rgba(255,255,255,0.02);border-radius:12px;border:1px solid rgba(255,255,255,0.06);margin-bottom:12px;">
              <h4 style="font-size:14px;font-weight:600;margin-bottom:12px;">
                <i class="fas fa-star"></i> ${lang === 'en' ? 'Top Genres' : 'Genuri Preferate'}
              </h4>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                ${topGenres.map(g => `
                  <span style="padding:4px 12px;border-radius:20px;font-size:12px;font-weight:500;background:rgba(108,92,231,0.1);color:var(--accent-secondary);border:1px solid rgba(108,92,231,0.15);">
                    ${g.genre} (${g.count})
                  </span>
                `).join('')}
              </div>
            </div>` : ''}
            
            <!-- Recent Activity -->
            <div style="padding:16px;background:rgba(255,255,255,0.02);border-radius:12px;border:1px solid rgba(255,255,255,0.06);">
              <h4 style="font-size:14px;font-weight:600;margin-bottom:12px;">
                <i class="fas fa-history"></i> ${lang === 'en' ? 'Recent Activity' : 'Activitate Recentă'}
              </h4>
              ${history.length === 0 
                ? `<p style="font-size:13px;color:var(--text-tertiary);padding:8px 0;">${lang === 'en' ? 'No activity this week.' : 'Nicio activitate săptămâna aceasta.'}</p>`
                : history.slice(0, 10).map(h => `
                  <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.03);">
                    <div style="width:28px;height:28px;border-radius:6px;background:${h.bg_color||'#1e1e2e'};display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0;">🎬</div>
                    <div style="flex:1;min-width:0;">
                      <div style="font-size:13px;font-weight:500;">${h.title}</div>
                      <div style="font-size:11px;color:var(--text-tertiary);">
                        ${new Date(h.watched_at).toLocaleDateString(lang === 'en' ? 'en-US' : 'ro-RO')} • ${Math.floor(h.duration_seconds/60)}min
                      </div>
                    </div>
                    <span style="font-size:10px;padding:2px 6px;border-radius:4px;font-weight:600;background:${h.completed ? 'rgba(0,184,148,0.15)' : 'rgba(253,203,110,0.15)'};color:${h.completed ? 'var(--green)' : 'var(--yellow)'};">${h.completed ? (lang==='en'?'Done':'Gata') : (lang==='en'?'Partial':'Parțial')}</span>
                  </div>
                `).join('')}
            </div>
          </div>`;
      } catch {
        return `<p style="color:var(--red);padding:20px;text-align:center;">${lang === 'en' ? 'Failed to load report' : 'Eroare la încărcarea raportului'}</p>`;
      }
    },

    // ====== ADD PROFILE MANAGEMENT UI ======
    addProfileManagement() {
      // Add "Create Kid Profile" button to profile screen
      const profileList = document.querySelector('.profile-list');
      if (profileList) {
        const addKidBtn = document.createElement('div');
        addKidBtn.className = 'profile-item';
        addKidBtn.style.cssText = 'opacity:0.6;cursor:pointer;';
        addKidBtn.innerHTML = `
          <div class="profile-avatar" style="background:var(--green);font-size:32px;">+</div>
          <span class="profile-name" data-lang="ro">Adaugă copil</span>
          <span class="profile-name" data-lang="en" style="display:none;">Add kid</span>`;
        profileList.appendChild(addKidBtn);
        
        addKidBtn.addEventListener('click', () => {
          const name = prompt(window.appLang === 'en' ? 'Enter kid name:' : 'Numele copilului:');
          if (name && name.trim()) {
            this.createKidProfile(name.trim());
          }
        });
      }
    },

    async createKidProfile(name) {
      const token = localStorage.getItem('animaxia_token');
      if (!token) { App.toast('Not logged in', 'error'); return; }
      
      try {
        const res = await fetch(`/api/parental/create-profile`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ name })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Creation failed');
        
        App.toast(window.appLang === 'en' ? `👶 Kid profile "${name}" created! PIN: ${data.profile.kids_pin}` : `👶 Profil copil "${name}" creat! PIN: ${data.profile.kids_pin}`, 'success');
        
        // Re-render profiles to show the new kid profile
        setTimeout(async () => {
          try {
            const sessionRes = await fetch(`/api/auth/session`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            const sessionData = await sessionRes.json();
            if (sessionData.success && sessionData.profiles) {
              App.renderProfiles(sessionData.profiles);
              PM.addProfileManagement();
            }
          } catch {}
        }, 1000);
      } catch (e) {
        App.toast('Error: ' + e.message, 'error');
      }
    }
  };

  // Init after App is ready
  function waitForApp() {
    if (window.App && document.getElementById('contentRows')) {
      setTimeout(() => PM.init(), 2000);
    } else {
      setTimeout(waitForApp, 500);
    }
  }
  waitForApp();

  window.ParentalModule = PM;
})();
