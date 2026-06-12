/**
 * Animaxia v5.4 - My Stats / Profile Analytics
 * Personalized viewing statistics: total hours, favorite genres,
 * completion rate, streaks, achievements summary
 * Netflix-style "My Animaxia" profile analytics
 */
(function() {
  'use strict';

  const MS = {
    init() {
      this.addStatsLink();
    },

    addStatsLink() {
      const dropdown = document.getElementById('userDropdown');
      if (!dropdown) return;
      const existing = dropdown.querySelector('[data-action="my-stats"]');
      if (existing) return;

      const a = document.createElement('a');
      a.href = '#';
      a.className = 'dropdown-item';
      a.dataset.action = 'my-stats';
      a.innerHTML = '<i class="fas fa-chart-pie" style="color:var(--accent-secondary);"></i> <span data-lang="ro">Statistici</span><span data-lang="en" style="display:none;">My Stats</span>';
      a.addEventListener('click', (e) => {
        e.preventDefault();
        this.showStatsPage();
      });
      dropdown.insertBefore(a, dropdown.querySelector('[data-action="billing"]'));
    },

    async showStatsPage() {
      const lang = window.appLang || 'ro';
      if (window.App?.stopHero) window.App.stopHero();

      const existing = document.getElementById('myStatsScreen');
      if (existing) existing.remove();

      const screen = document.createElement('div');
      screen.id = 'myStatsScreen';
      screen.className = 'full-page-screen';
      screen.style.zIndex = '1000';
      screen.innerHTML = `
        <div class="full-page-header">
          <div class="full-page-header-content">
            <button class="full-page-back" id="msBack"><i class="fas fa-arrow-left"></i></button>
            <h1><i class="fas fa-chart-pie" style="color:var(--accent-secondary);"></i> ${lang === 'ro' ? 'Statistici' : 'My Stats'}</h1>
          </div>
        </div>
        <div class="full-page-body" style="max-width:800px;">
          <div class="ms-loading" style="text-align:center;padding:60px;color:var(--text-tertiary);">
            <i class="fas fa-spinner fa-spin" style="font-size:32px;display:block;margin-bottom:16px;"></i>
            <p>${lang === 'ro' ? 'Se încarcă statisticile...' : 'Loading stats...'}</p>
          </div>
        </div>`;
      document.body.appendChild(screen);

      document.getElementById('msBack').addEventListener('click', () => {
        screen.remove();
        if (window.App?.startHero) window.App.startHero();
      });

      await this.loadStats();
    },

    async loadStats() {
      const lang = window.appLang || 'ro';
      const body = document.querySelector('#myStatsScreen .full-page-body');
      if (!body || !window.App?.currentProfile) return;

      try {
        const [watchRes, userRes] = await Promise.all([
          fetch(`/api/user/${window.App.currentProfile.id}/watch-history?page=1&limit=100`),
          fetch(`/api/auth/session`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('animaxia_token')}` }
          })
        ]);
        const watchData = await watchRes.json();
        const sessionData = await userRes.json();

        const user = sessionData.success ? sessionData.user : null;
        const allWatches = [];
        if (watchData.success && watchData.data) {
          Object.values(watchData.data).forEach((entries) => {
            entries.forEach((w) => allWatches.push(w));
          });
        }

        // Calculate stats
        const totalWatchSeconds = allWatches.reduce((sum, w) => sum + (w.duration_seconds || 0), 0);
        const totalHours = Math.round(totalWatchSeconds / 3600 * 10) / 10;
        const totalWatches = allWatches.length;
        const completedCount = allWatches.filter(w => w.completed).length;
        const completionRate = totalWatches > 0 ? Math.round((completedCount / totalWatches) * 100) : 0;

        // Genre distribution
        const genreCounts = {};
        const content = window.AnimaxiaData?._cache || window.__content;
        allWatches.forEach(w => {
          const item = window.AnimaxiaData?.findItem?.(w.item_id) || content?.categories?.flatMap(c => c.items || []).find(i => i?.id === w.item_id);
          if (item?.genre) {
            item.genre.forEach(g => { genreCounts[g] = (genreCounts[g] || 0) + 1; });
          }
        });

        const topGenres = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const maxGenreCount = topGenres.length > 0 ? topGenres[0][1] : 0;

        // Streak from achievements module
        const watchDates = JSON.parse(localStorage.getItem('animaxia_watch_dates') || '[]');
        const sortedDates = [...new Set(watchDates)].sort().reverse();
        let streak = 0;
        if (sortedDates.length > 0) {
          const today = new Date().toISOString().split('T')[0];
          let check = new Date(today);
          for (const date of sortedDates) {
            const d = new Date(date).toISOString().split('T')[0];
            if (d === check.toISOString().split('T')[0]) {
              streak++;
              check.setDate(check.getDate() - 1);
            } else break;
          }
        }

        // Achievements unlocked
        const achievements = JSON.parse(localStorage.getItem('animaxia_achievements') || '[]');
        const totalAchievements = 14;

        // Watch activity by day of week
        const dayLabels = lang === 'ro'
          ? ['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică']
          : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const dayCounts = [0, 0, 0, 0, 0, 0, 0];
        allWatches.forEach(w => {
          const day = new Date(w.watched_at).getDay();
          dayCounts[day === 0 ? 6 : day - 1]++;
        });
        const maxDay = Math.max(...dayCounts, 1);

        // Daily watch streak graph (last 7 days)
        const weeklyData = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().split('T')[0];
          const dayWatches = allWatches.filter(w => w.watched_at?.startsWith(dateStr));
          weeklyData.push({
            label: d.toLocaleDateString(lang === 'ro' ? 'ro-RO' : 'en-US', { weekday: 'short' }),
            count: dayWatches.length,
            date: dateStr
          });
        }
        const maxWeekly = Math.max(...weeklyData.map(d => d.count), 1);
        const totalMinutes = Math.round(totalWatchSeconds / 60);

        // Activity score (gamification)
        const activityScore = Math.min(100, Math.round(
          (totalWatches * 5) +
          (streak * 10) +
          (achievements.length * 7) +
          (completionRate / 10)
        ));

        body.innerHTML = `
          <div class="ms-grid">
            <!-- Score Card -->
            <div class="ms-card ms-card-score">
              <div class="ms-score-ring">
                <svg viewBox="0 0 100 100" style="width:100px;height:100px;">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="8"/>
                  <circle cx="50" cy="50" r="42" fill="none" stroke="var(--accent-gradient)" stroke-width="8"
                    stroke-dasharray="264" stroke-dashoffset="${264 - (264 * activityScore / 100)}"
                    transform="rotate(-90, 50, 50)" style="transition:stroke-dashoffset 1.5s ease;"/>
                </svg>
                <div class="ms-score-value">${activityScore}</div>
              </div>
              <div class="ms-score-label">${lang === 'ro' ? 'Scor Activitate' : 'Activity Score'}</div>
              <div class="ms-score-sub">${lang === 'ro' ? 'Nivel' : 'Level'} ${activityScore >= 80 ? '⭐ ' + (lang === 'ro' ? 'Expert' : 'Expert') : activityScore >= 50 ? '🔥 ' + (lang === 'ro' ? 'Avansat' : 'Advanced') : activityScore >= 20 ? '🌱 ' + (lang === 'ro' ? 'Intermediar' : 'Intermediate') : '🆕 ' + (lang === 'ro' ? 'Începător' : 'Beginner')}</div>
            </div>

            <!-- Quick Stats -->
            <div class="ms-card">
              <div class="ms-stat-icon" style="background:rgba(108,92,231,0.15);color:var(--accent-secondary);">⏱️</div>
              <div class="ms-stat-value">${totalHours}</div>
              <div class="ms-stat-label">${lang === 'ro' ? 'Ore vizionate' : 'Hours watched'}</div>
            </div>
            <div class="ms-card">
              <div class="ms-stat-icon" style="background:rgba(0,184,148,0.15);color:var(--green);">🎬</div>
              <div class="ms-stat-value">${totalWatches}</div>
              <div class="ms-stat-label">${lang === 'ro' ? 'Vizionări' : 'Watches'}</div>
            </div>
            <div class="ms-card">
              <div class="ms-stat-icon" style="background:rgba(253,203,110,0.15);color:var(--yellow);">✅</div>
              <div class="ms-stat-value">${completionRate}%</div>
              <div class="ms-stat-label">${lang === 'ro' ? 'Finalizate' : 'Completed'}</div>
            </div>
            <div class="ms-card">
              <div class="ms-stat-icon" style="background:rgba(231,76,60,0.15);color:var(--red);">🔥</div>
              <div class="ms-stat-value">${streak}</div>
              <div class="ms-stat-label">${lang === 'ro' ? 'Zile consecutiv' : 'Day streak'}</div>
            </div>
            <div class="ms-card">
              <div class="ms-stat-icon" style="background:rgba(162,155,254,0.15);color:var(--accent-secondary);">🏆</div>
              <div class="ms-stat-value">${achievements.length}/${totalAchievements}</div>
              <div class="ms-stat-label">${lang === 'ro' ? 'Realizări' : 'Achievements'}</div>
            </div>
            <div class="ms-card">
              <div class="ms-stat-icon" style="background:rgba(9,132,227,0.15);color:var(--blue);">📊</div>
              <div class="ms-stat-value">${totalMinutes}</div>
              <div class="ms-stat-label">${lang === 'ro' ? 'Minute totale' : 'Total minutes'}</div>
            </div>

            <!-- Genre Distribution -->
            <div class="ms-card ms-card-wide">
              <div class="ms-section-title"><i class="fas fa-tags"></i> ${lang === 'ro' ? 'Genuri preferate' : 'Favorite Genres'}</div>
              <div class="ms-genre-list">
                ${topGenres.length === 0
                  ? `<div class="ms-empty">${lang === 'ro' ? 'Încă nu ai vizionat suficient' : 'Not enough data yet'}</div>`
                  : topGenres.map(([genre, count]) => `
                    <div class="ms-genre-item">
                      <div class="ms-genre-name">${genre}</div>
                      <div class="ms-genre-bar-bg">
                        <div class="ms-genre-bar" style="width:${(count / maxGenreCount) * 100}%"></div>
                      </div>
                      <div class="ms-genre-count">${count}</div>
                    </div>
                  `).join('')
                }
              </div>
            </div>

            <!-- Weekly Activity -->
            <div class="ms-card ms-card-wide">
              <div class="ms-section-title"><i class="fas fa-calendar-week"></i> ${lang === 'ro' ? 'Activitate săptămânală' : 'Weekly Activity'}</div>
              <div class="ms-week-grid">
                ${weeklyData.map(d => `
                  <div class="ms-week-item">
                    <div class="ms-week-bar" style="height:${(d.count / maxWeekly) * 100}%">
                      ${d.count > 0 ? `<span class="ms-week-count">${d.count}</span>` : ''}
                    </div>
                    <div class="ms-week-label">${d.label}</div>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- Day of Week Activity -->
            <div class="ms-card ms-card-wide">
              <div class="ms-section-title"><i class="fas fa-clock"></i> ${lang === 'ro' ? 'Activitate pe zile' : 'Activity by Day'}</div>
              <div class="ms-day-grid">
                ${dayLabels.map((label, i) => `
                  <div class="ms-day-item">
                    <div class="ms-day-bar" style="height:${(dayCounts[i] / maxDay) * 100}%"></div>
                    <div class="ms-day-label">${label.substring(0, 2)}</div>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- Account Info -->
            <div class="ms-card ms-card-wide">
              <div class="ms-section-title"><i class="fas fa-user"></i> ${lang === 'ro' ? 'Informații cont' : 'Account Info'}</div>
              <div class="ms-info-grid">
                <div class="ms-info-item">
                  <span class="ms-info-label">${lang === 'ro' ? 'Membru din' : 'Member since'}</span>
                  <span class="ms-info-value">${user ? new Date(user.created_at).toLocaleDateString(lang === 'ro' ? 'ro-RO' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '-'}</span>
                </div>
                <div class="ms-info-item">
                  <span class="ms-info-label">${lang === 'ro' ? 'Plan' : 'Plan'}</span>
                  <span class="ms-info-value">${user?.plan || 'Free'}</span>
                </div>
                <div class="ms-info-item">
                  <span class="ms-info-label">${lang === 'ro' ? 'Total conținut vizionat' : 'Total content watched'}</span>
                  <span class="ms-info-value">${totalWatches} ${lang === 'ro' ? 'intrări' : 'entries'}</span>
                </div>
                <div class="ms-info-item">
                  <span class="ms-info-label">${lang === 'ro' ? 'Profile' : 'Profiles'}</span>
                  <span class="ms-info-value">${user?.profiles?.length || 1}</span>
                </div>
              </div>
            </div>
          </div>`;
      } catch (e) {
        body.innerHTML = `<div class="ms-empty" style="padding:60px;text-align:center;">
          <i class="fas fa-exclamation-circle" style="font-size:48px;opacity:0.3;display:block;margin-bottom:16px;"></i>
          <h3>${lang === 'ro' ? 'Eroare la încărcare' : 'Error loading stats'}</h3>
        </div>`;
      }
    }
  };

  if (document.readyState !== 'loading') {
    MS.init();
  } else {
    document.addEventListener('DOMContentLoaded', () => MS.init());
  }

  window.MyStatsModule = MS;
})();
