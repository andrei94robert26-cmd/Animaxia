/**
 * Animaxia v5.4 - My Timeline
 * Visual watch history timeline with activity stream
 * Netflix-style "My Activity" visual log
 */
(function() {
  'use strict';

  const TL = {
    init() {
      this.addTimelineLink();
    },

    addTimelineLink() {
      const dropdown = document.getElementById('userDropdown');
      if (!dropdown) return;
      const existing = dropdown.querySelector('[data-action="my-timeline"]');
      if (existing) return;

      const a = document.createElement('a');
      a.href = '#';
      a.className = 'dropdown-item';
      a.dataset.action = 'my-timeline';
      a.innerHTML = '<i class="fas fa-stream" style="color:var(--green);"></i> <span data-lang="ro">Activitate</span><span data-lang="en" style="display:none;">Activity</span>';
      a.addEventListener('click', (e) => {
        e.preventDefault();
        this.showTimelinePage();
      });
      dropdown.insertBefore(a, dropdown.querySelector('[data-action="watch-history"]'));
    },

    async showTimelinePage() {
      const lang = window.appLang || 'ro';
      if (window.App?.stopHero) window.App.stopHero();

      const existing = document.getElementById('timelineScreen');
      if (existing) existing.remove();

      const screen = document.createElement('div');
      screen.id = 'timelineScreen';
      screen.className = 'full-page-screen';
      screen.style.zIndex = '1000';
      screen.innerHTML = `
        <div class="full-page-header">
          <div class="full-page-header-content">
            <button class="full-page-back" id="tlBack"><i class="fas fa-arrow-left"></i></button>
            <h1><i class="fas fa-stream" style="color:var(--green);"></i> ${lang === 'ro' ? 'Activitate Recentă' : 'Recent Activity'}</h1>
          </div>
        </div>
        <div class="full-page-body" style="max-width:600px;">
          <div class="tl-loading" style="text-align:center;padding:60px;color:var(--text-tertiary);">
            <i class="fas fa-spinner fa-spin" style="font-size:32px;display:block;margin-bottom:16px;"></i>
          </div>
        </div>`;
      document.body.appendChild(screen);

      document.getElementById('tlBack').addEventListener('click', () => {
        screen.remove();
        if (window.App?.startHero) window.App.startHero();
      });

      await this.loadTimeline();
    },

    async loadTimeline() {
      const lang = window.appLang || 'ro';
      const body = document.querySelector('#timelineScreen .full-page-body');
      if (!body || !window.App?.currentProfile) return;

      try {
        const res = await fetch(`/api/user/${window.App.currentProfile.id}/watch-history?page=1&limit=50`);
        const data = await res.json();

        if (!data.success || !data.data) {
          body.innerHTML = `<div class="tl-empty" style="text-align:center;padding:60px;">
            <i class="fas fa-history" style="font-size:48px;opacity:0.2;display:block;margin-bottom:16px;"></i>
            <h3>${lang === 'ro' ? 'Nicio activitate' : 'No activity yet'}</h3>
          </div>`;
          return;
        }

        const allEntries = [];
        Object.entries(data.data).forEach(([date, entries]) => {
          entries.forEach(e => {
            const item = window.AnimaxiaData?.findItem?.(e.item_id) || window.__content?.categories?.flatMap(c => c.items || []).find(i => i?.id === e.item_id);
            allEntries.push({
              ...e,
              displayDate: date,
              itemTitle: item?.title || e.title || e.item_id,
              itemBg: item?.bg_color || e.bg_color || '#1e1e2e',
              itemType: item?.content_type || e.content_type || 'movie',
              itemGenre: item?.genre || []
            });
          });
        });

        // Sort by watched_at descending
        allEntries.sort((a, b) => new Date(b.watched_at) - new Date(a.watched_at));

        // Group by date
        const grouped = {};
        allEntries.forEach(e => {
          if (!grouped[e.displayDate]) grouped[e.displayDate] = [];
          grouped[e.displayDate].push(e);
        });

        if (Object.keys(grouped).length === 0) {
          body.innerHTML = `<div class="tl-empty" style="text-align:center;padding:60px;">
            <i class="fas fa-history" style="font-size:48px;opacity:0.2;display:block;margin-bottom:16px;"></i>
            <h3>${lang === 'ro' ? 'Nicio activitate' : 'No activity yet'}</h3>
          </div>`;
          return;
        }

        body.innerHTML = '<div class="tl-timeline">' +
          Object.entries(grouped).map(([date, entries]) => {
            const d = new Date(date);
            const now = new Date();
            const isToday = date === now.toISOString().split('T')[0];
            const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
            const isYesterday = date === yesterday.toISOString().split('T')[0];

            let dateLabel;
            if (isToday) dateLabel = lang === 'ro' ? 'Astăzi' : 'Today';
            else if (isYesterday) dateLabel = lang === 'ro' ? 'Ieri' : 'Yesterday';
            else dateLabel = d.toLocaleDateString(lang === 'ro' ? 'ro-RO' : 'en-US', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });

            return `
              <div class="tl-date-group">
                <div class="tl-date-header">
                  <div class="tl-date-dot ${isToday ? 'today' : ''}"></div>
                  <span class="tl-date-label">${dateLabel}</span>
                  <span class="tl-date-count">${entries.length} ${lang === 'ro' ? 'vizionări' : 'watches'}</span>
                </div>
                <div class="tl-entries">
                  ${entries.map(e => {
                    const isSeries = e.itemType === 'series';
                    return `
                      <div class="tl-entry" data-id="${e.item_id}" onclick="App.openDetail('${e.item_id}')">
                        <div class="tl-entry-dot ${e.completed ? 'done' : 'partial'}"></div>
                        <div class="tl-entry-thumb" style="background:${e.itemBg}">${isSeries ? '📺' : '🎬'}</div>
                        <div class="tl-entry-info">
                          <div class="tl-entry-title">${e.itemTitle}</div>
                          <div class="tl-entry-meta">
                            ${isSeries && e.episode ? `<span class="tl-entry-ep">${e.episode}</span>` : ''}
                            <span class="tl-entry-time">${new Date(e.watched_at).toLocaleTimeString(lang === 'ro' ? 'ro-RO' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                            ${e.duration_seconds ? `<span class="tl-entry-dur">${Math.floor(e.duration_seconds / 60)}min</span>` : ''}
                            <span class="tl-entry-badge ${e.completed ? 'done' : 'part'}">${e.completed ? (lang === 'ro' ? 'Complet' : 'Done') : (lang === 'ro' ? 'Parțial' : 'Part')}</span>
                          </div>
                        </div>
                      </div>`;
                  }).join('')}
                </div>
              </div>`;
          }).join('') +
          '</div>';

      } catch {
        body.innerHTML = `<div class="tl-empty" style="text-align:center;padding:60px;">
          <i class="fas fa-exclamation-circle" style="font-size:48px;opacity:0.3;display:block;margin-bottom:16px;"></i>
          <h3>${lang === 'ro' ? 'Eroare la încărcare' : 'Error loading'}</h3>
        </div>`;
      }
    }
  };

  if (document.readyState !== 'loading') {
    TL.init();
  } else {
    document.addEventListener('DOMContentLoaded', () => TL.init());
  }

  window.TimelineModule = TL;
})();
