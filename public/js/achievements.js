/**
 * Animaxia v5.3 - Achievement & Badge System
 * Track user milestones: content watched, reviews written, days active, quizzes completed
 * Gamification - Netflix-style engagement features
 */
(function() {
  'use strict';

  const AC = {
    achievements: [
      { id: 'first_watch', icon: '🎬', title: { ro: 'Prima Vizionare', en: 'First Watch' }, desc: { ro: 'Vizionează primul tău conținut', en: 'Watch your first content' }, condition: (s) => s.watchCount >= 1 },
      { id: 'binge_5', icon: '🔥', title: { ro: 'Binge Watcher', en: 'Binge Watcher' }, desc: { ro: 'Vizionează 5 conținuturi', en: 'Watch 5 titles' }, condition: (s) => s.watchCount >= 5 },
      { id: 'binge_20', icon: '💫', title: { ro: 'Maratonist', en: 'Marathoner' }, desc: { ro: 'Vizionează 20 de conținuturi', en: 'Watch 20 titles' }, condition: (s) => s.watchCount >= 20 },
      { id: 'first_review', icon: '✍️', title: { ro: 'Critic în devenire', en: 'Budding Critic' }, desc: { ro: 'Scrie prima recenzie', en: 'Write your first review' }, condition: (s) => s.reviewCount >= 1 },
      { id: 'review_10', icon: '🎯', title: { ro: 'Top Critic', en: 'Top Critic' }, desc: { ro: 'Scrie 10 recenzii', en: 'Write 10 reviews' }, condition: (s) => s.reviewCount >= 10 },
      { id: 'quiz_master', icon: '🧠', title: { ro: 'Maestru Quiz', en: 'Quiz Master' }, desc: { ro: 'Completează primul quiz', en: 'Complete your first quiz' }, condition: (s) => s.quizCount >= 1 },
      { id: 'collector_5', icon: '📁', title: { ro: 'Colecționar', en: 'Collector' }, desc: { ro: 'Creează o colecție', en: 'Create a collection' }, condition: (s) => s.collectionCount >= 1 },
      { id: 'social', icon: '👥', title: { ro: 'Social Butterfly', en: 'Social Butterfly' }, desc: { ro: 'Participă la un Watch Party', en: 'Join a Watch Party' }, condition: (s) => s.watchPartyCount >= 1 },
      { id: 'streak_3', icon: '⭐', title: { ro: 'Vizionare Consecutivă', en: 'Streak' }, desc: { ro: 'Vizionează 3 zile consecutive', en: 'Watch 3 days in a row' }, condition: (s) => s.streak >= 3 },
      { id: 'streak_7', icon: '🔥', title: { ro: 'Săptămâna Perfectă', en: 'Perfect Week' }, desc: { ro: 'Vizionează 7 zile consecutive', en: 'Watch 7 days in a row' }, condition: (s) => s.streak >= 7 },
      { id: 'explorer', icon: '🌍', title: { ro: 'Explorator', en: 'Explorer' }, desc: { ro: 'Vizionează din 5 genuri diferite', en: 'Watch 5 different genres' }, condition: (s) => s.genreCount >= 5 },
      { id: 'premium', icon: '👑', title: { ro: 'Premium Member', en: 'Premium Member' }, desc: { ro: 'Ai un abonament Premium', en: 'Have a Premium plan' }, condition: (s) => s.isPremium },
      { id: 'veteran', icon: '🏆', title: { ro: 'Veteran Animaxia', en: 'Animaxia Veteran' }, desc: { ro: '30 de zile de la înregistrare', en: '30 days since registration' }, condition: (s) => s.daysOld >= 30 },
      { id: 'night_owl', icon: '🦉', title: { ro: 'Bufniță de Noapte', en: 'Night Owl' }, desc: { ro: 'Vizionează după miezul nopții', en: 'Watch after midnight' }, condition: (s) => s.nightWatch >= 1 },
    ],

    userStats: null,
    unlockedAchievements: JSON.parse(localStorage.getItem('animaxia_achievements') || '[]'),

    init() {
      this.addAchievementsLink();
      this.checkProgress();
      this.trackNightWatch();
    },

    addAchievementsLink() {
      const dropdown = document.getElementById('userDropdown');
      if (!dropdown) return;
      const existing = dropdown.querySelector('[data-action="achievements"]');
      if (existing) return;

      const a = document.createElement('a');
      a.href = '#';
      a.className = 'dropdown-item';
      a.dataset.action = 'achievements';
      a.innerHTML = '<i class="fas fa-trophy" style="color:var(--yellow);"></i> <span data-lang="ro">Realizări</span><span data-lang="en" style="display:none;">Achievements</span>';
      a.addEventListener('click', (e) => {
        e.preventDefault();
        this.showAchievementsPage();
      });
      dropdown.insertBefore(a, dropdown.querySelector('[data-action="settings"]'));
    },

    async checkProgress() {
      if (!window.App?.currentProfile) return;

      try {
        const [watchRes, sessionRes, collectionsRes] = await Promise.all([
          fetch(`/api/user/${window.App.currentProfile.id}/watch-history?page=1`),
          fetch(`/api/auth/session`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('animaxia_token')}` } }),
          fetch(`/api/collections/${window.App.currentProfile.id}`)
        ]);
        const watchData = await watchRes.json();
        const sessionData = await sessionRes.json();
        const collectionsData = await collectionsRes.json();

        const quizProgress = JSON.parse(localStorage.getItem('animaxia_quiz_progress') || '{}');
        const quizCount = Object.keys(quizProgress).length;
        const collectionCount = collectionsData.success ? collectionsData.data.length : 0;

        const watchCount = watchData.total || 0;
        const genres = new Set();
        if (watchData.data) {
          Object.values(watchData.data).flat().forEach(w => {
            if (w.content_type) genres.add(w.content_type);
          });
        }

        const user = sessionData.success ? sessionData.user : null;
        const daysOld = user ? Math.floor((Date.now() - new Date(user.created_at || Date.now()).getTime()) / (86400000)) : 0;

        // Fetch review count from API
        let reviewCount = 0;
        try {
          const res = await fetch(`/api/auth/session`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('animaxia_token')}` }
          });
          const sessionData2 = await res.json();
          if (sessionData2.success && sessionData2.profiles) {
            // Estimate from total content reviews - use the user's profile data
            const profiles2 = sessionData2.profiles;
            for (const p of profiles2) {
              try {
                const userDataRes = await fetch(`/api/user/${p.id}/data`);
                const userData2 = await userDataRes.json();
                if (userData2.success && userData2.data?.ratings) {
                  reviewCount += Object.keys(userData2.data.ratings).length;
                }
              } catch {}
            }
          }
        } catch {}

        // Calculate streak from localStorage
        const watchDates = JSON.parse(localStorage.getItem('animaxia_watch_dates') || '[]');
        let streak = 0;
        if (watchDates.length > 0) {
          const sorted = [...new Set(watchDates)].sort().reverse();
          const today = new Date().toISOString().split('T')[0];
          let check = new Date(today);
          for (const date of sorted) {
            const d = new Date(date).toISOString().split('T')[0];
            const expected = check.toISOString().split('T')[0];
            if (d === expected) {
              streak++;
              check.setDate(check.getDate() - 1);
            } else if (d < expected) break;
          }
        }

        this.userStats = {
          watchCount,
          reviewCount,
          quizCount,
          collectionCount,
          watchPartyCount: 0,
          streak,
          genreCount: genres.size,
          isPremium: user?.plan === 'Premium' || user?.plan === 'Animaxia+',
          daysOld,
          nightWatch: 0
        };

        // Check and unlock achievements
        this.checkUnlocks();
      } catch {}
    },

    checkUnlocks() {
      if (!this.userStats) return;
      let newUnlocks = 0;

      this.achievements.forEach(ach => {
        if (!this.unlockedAchievements.includes(ach.id) && ach.condition(this.userStats)) {
          this.unlockedAchievements.push(ach.id);
          newUnlocks++;
          if (window.App?.toast) {
            setTimeout(() => {
              window.App.toast(`🏆 ${ach.icon} ${ach.title[window.appLang || 'ro']} ${(window.appLang || 'ro') === 'ro' ? 'deblocat!' : 'unlocked!'}`, 'success');
              this.showUnlockNotification(ach);
            }, 2000);
          }
        }
      });

      if (newUnlocks > 0) {
        localStorage.setItem('animaxia_achievements', JSON.stringify(this.unlockedAchievements));
      }
    },

    showUnlockNotification(ach) {
      const lang = window.appLang || 'ro';
      const existing = document.getElementById('achUnlockModal');
      if (existing) existing.remove();

      const modal = document.createElement('div');
      modal.id = 'achUnlockModal';
      modal.className = 'admin-modal-overlay';
      modal.style.zIndex = '10020';
      modal.innerHTML = `
        <div class="admin-modal" style="max-width:360px;text-align:center;animation:toastIn 0.5s ease;">
          <div style="font-size:64px;margin-bottom:12px;animation:scaleIn 0.5s ease;">${ach.icon}</div>
          <h3 style="margin-bottom:4px;">🏆 ${lang === 'ro' ? 'Realizare deblocată!' : 'Achievement Unlocked!'}</h3>
          <p style="font-size:18px;font-weight:700;margin:8px 0;color:var(--accent-secondary);">${ach.title[lang]}</p>
          <p style="font-size:13px;color:var(--text-tertiary);margin-bottom:16px;">${ach.desc[lang]}</p>
          <button class="btn btn-primary" onclick="this.closest('.admin-modal-overlay').remove()" style="justify-content:center;width:100%;">
            ${lang === 'ro' ? 'Super!' : 'Awesome!'} 🎉
          </button>
        </div>`;
      document.body.appendChild(modal);

      setTimeout(() => modal.remove(), 5000);
    },

    showAchievementsPage() {
      const lang = window.appLang || 'ro';
      if (window.App?.stopHero) window.App.stopHero();

      const existing = document.getElementById('achievementsScreen');
      if (existing) existing.remove();

      const unlocked = this.unlockedAchievements;
      const total = this.achievements.length;
      const pct = Math.round((unlocked.length / total) * 100);

      const screen = document.createElement('div');
      screen.id = 'achievementsScreen';
      screen.className = 'full-page-screen';
      screen.style.zIndex = '1000';
      screen.innerHTML = `
        <div class="full-page-header">
          <div class="full-page-header-content">
            <button class="full-page-back" id="achBack"><i class="fas fa-arrow-left"></i></button>
            <h1><i class="fas fa-trophy" style="color:var(--yellow);"></i> ${lang === 'ro' ? 'Realizări' : 'Achievements'}</h1>
            <div style="margin-left:auto;font-size:13px;color:var(--text-tertiary);">
              ${unlocked.length}/${total}
            </div>
          </div>
        </div>
        <div class="full-page-body" style="max-width:700px;">
          <div style="margin-bottom:24px;">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
              <span style="font-size:14px;font-weight:600;">${lang === 'ro' ? 'Progres total' : 'Total Progress'}</span>
              <span style="font-size:13px;color:var(--text-tertiary);">${pct}%</span>
            </div>
            <div style="height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:${pct}%;background:var(--accent-gradient);border-radius:3px;transition:width 1s ease;"></div>
            </div>
          </div>
          <div class="ach-grid">
            ${this.achievements.map(ach => {
              const isUnlocked = unlocked.includes(ach.id);
              return `
                <div class="ach-card ${isUnlocked ? 'unlocked' : 'locked'}">
                  <div class="ach-icon ${isUnlocked ? '' : 'grayscale'}">${ach.icon}</div>
                  <div class="ach-info">
                    <div class="ach-title">${ach.title[lang]}</div>
                    <div class="ach-desc">${ach.desc[lang]}</div>
                  </div>
                  <div class="ach-status">
                    ${isUnlocked ? '✅' : '🔒'}
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>`;
      document.body.appendChild(screen);

      document.getElementById('achBack').addEventListener('click', () => {
        screen.remove();
        if (window.App?.startHero) window.App.startHero();
      });
    },

    trackNightWatch() {
      const hour = new Date().getHours();
      if (hour >= 0 && hour < 5) {
        const tracked = localStorage.getItem('animaxia_night_owl');
        if (!tracked) {
          localStorage.setItem('animaxia_night_owl', 'true');
          if (this.userStats) {
            this.userStats.nightWatch = 1;
            this.checkUnlocks();
          }
        }
      }
    },

    recordWatch() {
      const dates = JSON.parse(localStorage.getItem('animaxia_watch_dates') || '[]');
      dates.push(new Date().toISOString().split('T')[0]);
      localStorage.setItem('animaxia_watch_dates', JSON.stringify(dates));
      if (this.userStats) {
        this.userStats.watchCount = (this.userStats.watchCount || 0) + 1;
        // Recalculate streak
        const sorted = [...new Set(dates)].sort().reverse();
        let streak = 0;
        const today = new Date().toISOString().split('T')[0];
        let check = new Date(today);
        for (const date of sorted) {
          const d = new Date(date).toISOString().split('T')[0];
          if (d === check.toISOString().split('T')[0]) {
            streak++;
            check.setDate(check.getDate() - 1);
          } else break;
        }
        this.userStats.streak = streak;
        this.checkUnlocks();
      }
    }
  };

  if (document.readyState !== 'loading') {
    AC.init();
  } else {
    document.addEventListener('DOMContentLoaded', () => AC.init());
  }

  window.AchievementsModule = AC;
})();
