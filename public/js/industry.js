/**
 * Animaxia v7.0 - Industry Module
 * Professional hub for media & entertainment industry.
 * Features: News feed, Company directory, Events, Jobs, Dashboard
 */
(function() {
  'use strict';

  const Industry = {
    currentTab: 'dashboard',
    page: 1,

    init() {
      // Module ready
    },

    // ====== SHOW INDUSTRY PAGE ======
    showPage(tab) {
      if (window.App?.stopHero) window.App.stopHero();
      this.currentTab = tab || 'dashboard';

      const existing = document.getElementById('industryScreen');
      if (existing) existing.remove();
      const lang = window.appLang || 'ro';

      const screen = document.createElement('div');
      screen.id = 'industryScreen';
      screen.className = 'full-page-screen';
      screen.style.zIndex = '1000';
      screen.innerHTML = `
        <div class="full-page-header">
          <div class="full-page-header-content">
            <button class="full-page-back" id="industryBack"><i class="fas fa-arrow-left"></i></button>
            <h1><i class="fas fa-building" style="color:var(--accent-secondary);"></i> ${lang === 'ro' ? 'Industry Hub' : 'Industry Hub'}</h1>
            <div class="industry-tabs" style="margin-left:auto;display:flex;gap:6px;">
              <button class="industry-tab-btn active" data-tab="dashboard"><i class="fas fa-chart-pie"></i> <span class="industry-tab-label">${lang === 'ro' ? 'Dashboard' : 'Dashboard'}</span></button>
              <button class="industry-tab-btn" data-tab="news"><i class="fas fa-newspaper"></i> <span class="industry-tab-label">${lang === 'ro' ? 'Știri' : 'News'}</span></button>
              <button class="industry-tab-btn" data-tab="companies"><i class="fas fa-building"></i> <span class="industry-tab-label">${lang === 'ro' ? 'Companii' : 'Companies'}</span></button>
              <button class="industry-tab-btn" data-tab="events"><i class="fas fa-calendar-alt"></i> <span class="industry-tab-label">${lang === 'ro' ? 'Evenimente' : 'Events'}</span></button>
              <button class="industry-tab-btn" data-tab="jobs"><i class="fas fa-briefcase"></i> <span class="industry-tab-label">${lang === 'ro' ? 'Joburi' : 'Jobs'}</span></button>
            </div>
          </div>
        </div>
        <div class="full-page-body">
          <div id="industryContent">
            <div style="text-align:center;padding:60px;"><i class="fas fa-spinner fa-spin" style="font-size:32px;color:var(--text-tertiary);"></i><p style="margin-top:12px;color:var(--text-tertiary);">${lang === 'ro' ? 'Se încarcă...' : 'Loading...'}</p></div>
          </div>
        </div>`;

      document.body.appendChild(screen);

      document.getElementById('industryBack').addEventListener('click', () => {
        screen.remove();
        if (window.App?.startHero) window.App.startHero();
      });

      // Tab switching
      screen.querySelectorAll('.industry-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          screen.querySelectorAll('.industry-tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.currentTab = btn.dataset.tab;
          this.loadTab(this.currentTab);
        });
      });

      this.loadTab(this.currentTab);
    },

    async loadTab(tab) {
      const container = document.getElementById('industryContent');
      if (!container) return;
      
      try {
        switch(tab) {
          case 'dashboard': await this.renderDashboard(container); break;
          case 'news': await this.renderNews(container); break;
          case 'companies': await this.renderCompanies(container); break;
          case 'events': await this.renderEvents(container); break;
          case 'jobs': await this.renderJobs(container); break;
        }
      } catch(e) {
        container.innerHTML = `<div class="industry-error"><i class="fas fa-exclamation-circle"></i><p>${e.message}</p></div>`;
      }
    },

    // ====== DASHBOARD ======
    async renderDashboard(container) {
      const lang = window.appLang || 'ro';
      container.innerHTML = '<div style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin" style="font-size:24px;"></i></div>';

      const res = await fetch('/api/industry/stats');
      const data = await res.json();
      const stats = data.success ? data.stats : { companies: 0, news: 0, upcomingEvents: 0, activeJobs: 0 };

      // Load latest news for feed
      const newsRes = await fetch('/api/industry/news?limit=5');
      const newsData = await newsRes.json();
      const latestNews = newsData.success ? newsData.data : [];

      container.innerHTML = `
        <div class="industry-dashboard">
          <!-- Stats Grid -->
          <div class="industry-stats-grid">
            <div class="industry-stat-card" style="background:rgba(108,92,231,0.08);border-color:rgba(108,92,231,0.15);">
              <div class="industry-stat-icon" style="color:var(--accent-secondary);"><i class="fas fa-building"></i></div>
              <div class="industry-stat-value">${stats.companies}</div>
              <div class="industry-stat-label">${lang === 'ro' ? 'Companii înregistrate' : 'Registered Companies'}</div>
            </div>
            <div class="industry-stat-card" style="background:rgba(0,184,148,0.08);border-color:rgba(0,184,148,0.15);">
              <div class="industry-stat-icon" style="color:var(--green);"><i class="fas fa-newspaper"></i></div>
              <div class="industry-stat-value">${stats.news}</div>
              <div class="industry-stat-label">${lang === 'ro' ? 'Articole de știri' : 'News Articles'}</div>
            </div>
            <div class="industry-stat-card" style="background:rgba(253,203,110,0.08);border-color:rgba(253,203,110,0.15);">
              <div class="industry-stat-icon" style="color:var(--yellow);"><i class="fas fa-calendar-alt"></i></div>
              <div class="industry-stat-value">${stats.upcomingEvents}</div>
              <div class="industry-stat-label">${lang === 'ro' ? 'Evenimente viitoare' : 'Upcoming Events'}</div>
            </div>
            <div class="industry-stat-card" style="background:rgba(9,132,227,0.08);border-color:rgba(9,132,227,0.15);">
              <div class="industry-stat-icon" style="color:var(--blue);"><i class="fas fa-briefcase"></i></div>
              <div class="industry-stat-value">${stats.activeJobs}</div>
              <div class="industry-stat-label">${lang === 'ro' ? 'Joburi active' : 'Active Jobs'}</div>
            </div>
          </div>

          <!-- Quick Actions -->
          <div class="industry-section">
            <h3 class="industry-section-title"><i class="fas fa-bolt"></i> ${lang === 'ro' ? 'Acțiuni rapide' : 'Quick Actions'}</h3>
            <div class="industry-quick-actions">
              <button class="industry-quick-btn" onclick="Industry.loadTab('news')"><i class="fas fa-newspaper"></i><span>${lang === 'ro' ? 'Ultimele știri' : 'Latest News'}</span></button>
              <button class="industry-quick-btn" onclick="Industry.loadTab('companies')"><i class="fas fa-building"></i><span>${lang === 'ro' ? 'Companii' : 'Companies'}</span></button>
              <button class="industry-quick-btn" onclick="Industry.showAddCompany()"><i class="fas fa-plus-circle"></i><span>${lang === 'ro' ? 'Adaugă companie' : 'Add Company'}</span></button>
              <button class="industry-quick-btn" onclick="Industry.loadTab('events')"><i class="fas fa-calendar-plus"></i><span>${lang === 'ro' ? 'Evenimente' : 'Events'}</span></button>
              <button class="industry-quick-btn" onclick="Industry.loadTab('jobs')"><i class="fas fa-briefcase"></i><span>${lang === 'ro' ? 'Joburi' : 'Jobs'}</span></button>
            </div>
          </div>

          <!-- Latest News Feed -->
          <div class="industry-section">
            <h3 class="industry-section-title"><i class="fas fa-newspaper"></i> ${lang === 'ro' ? 'Ultimele știri' : 'Latest News'}</h3>
            <div class="industry-news-feed">
              ${latestNews.length === 0 
                ? `<div class="industry-empty"><i class="fas fa-newspaper"></i><h4>${lang === 'ro' ? 'Nicio știre momentan' : 'No news yet'}</h4></div>`
                : latestNews.map(item => `
                  <div class="industry-news-card" onclick="Industry.loadTab('news')">
                    <div class="industry-news-tag" style="background:${Industry.getCategoryColor(item.category)}">${item.category}</div>
                    <h4 class="industry-news-title">${item.title}</h4>
                    <p class="industry-news-summary">${item.summary || ''}</p>
                    <span class="industry-news-date">${new Date(item.published_at).toLocaleDateString(lang === 'ro' ? 'ro-RO' : 'en-US')}</span>
                  </div>
                `).join('')}
            </div>
          </div>
        </div>`;
    },

    // ====== NEWS ======
    async renderNews(container) {
      const lang = window.appLang || 'ro';
      container.innerHTML = '<div style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin" style="font-size:24px;"></i></div>';

      const res = await fetch(`/api/industry/news?page=${this.page}`);
      const data = await res.json();
      const news = data.success ? data.data : [];
      const categories = data.success ? (data.categories || []) : [];

      container.innerHTML = `
        <div class="industry-news-page">
          <div class="industry-news-toolbar">
            <div class="industry-news-categories">
              <button class="industry-cat-btn active" data-cat="">${lang === 'ro' ? 'Toate' : 'All'}</button>
              ${categories.map(c => `<button class="industry-cat-btn" data-cat="${c.category}">${c.category} (${c.count})</button>`).join('')}
            </div>
          </div>
          <div class="industry-news-grid">
            ${news.length === 0
              ? `<div class="industry-empty" style="grid-column:1/-1;"><i class="fas fa-newspaper"></i><h4>${lang === 'ro' ? 'Nicio știre' : 'No news'}</h4></div>`
              : news.map(item => `
                <div class="industry-article-card">
                  <div class="industry-article-header">
                    <span class="industry-article-cat" style="background:${Industry.getCategoryColor(item.category)}">${item.category}</span>
                    ${item.is_featured ? '<span class="industry-article-featured"><i class="fas fa-star"></i> Featured</span>' : ''}
                  </div>
                  <h3 class="industry-article-title">${item.title}</h3>
                  <p class="industry-article-summary">${item.summary || ''}</p>
                  <div class="industry-article-meta">
                    <span><i class="far fa-calendar"></i> ${new Date(item.published_at).toLocaleDateString(lang === 'ro' ? 'ro-RO' : 'en-US')}</span>
                    ${item.tags && item.tags.length ? ' • ' + item.tags.slice(0, 3).map(t => `<span class="industry-tag">${t}</span>`).join('') : ''}
                  </div>
                </div>
              `).join('')}
          </div>
          ${data.pages > 1 ? `
            <div class="industry-pagination">
              ${Array.from({length: data.pages}, (_, i) => `
                <button class="industry-page-btn ${i + 1 === this.page ? 'active' : ''}" data-page="${i + 1}">${i + 1}</button>
              `).join('')}
            </div>` : ''}
        </div>`;

      container.querySelectorAll('.industry-cat-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          container.querySelectorAll('.industry-cat-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.page = 1;
          this.renderNews(container);
        });
      });
      container.querySelectorAll('.industry-page-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          this.page = parseInt(btn.dataset.page);
          this.renderNews(container);
        });
      });
    },

    // ====== COMPANIES ======
    async renderCompanies(container) {
      const lang = window.appLang || 'ro';
      container.innerHTML = '<div style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin" style="font-size:24px;"></i></div>';

      const res = await fetch('/api/industry/companies');
      const data = await res.json();
      const companies = data.success ? data.data : [];

      container.innerHTML = `
        <div class="industry-companies-page">
          <div class="industry-toolbar">
            <button class="btn btn-primary" onclick="Industry.showAddCompany()"><i class="fas fa-plus"></i> ${lang === 'ro' ? 'Adaugă Companie' : 'Add Company'}</button>
          </div>
          <div class="industry-companies-grid">
            ${companies.length === 0
              ? `<div class="industry-empty" style="grid-column:1/-1;"><i class="fas fa-building"></i><h4>${lang === 'ro' ? 'Nicio companie' : 'No companies'}</h4><p>${lang === 'ro' ? 'Fii primul care adaugă o companie!' : 'Be the first to add a company!'}</p></div>`
              : companies.map(c => `
                <div class="industry-company-card">
                  <div class="industry-company-logo" style="background:linear-gradient(135deg, #6c5ce7, #a29bfe);">
                    <span>${c.name[0]}</span>
                    ${c.is_verified ? '<div class="industry-verified-badge"><i class="fas fa-check-circle"></i></div>' : ''}
                  </div>
                  <div class="industry-company-info">
                    <h3 class="industry-company-name">${c.name}</h3>
                    <p class="industry-company-desc">${c.description || ''}</p>
                    ${c.specialties && c.specialties.length ? `<div class="industry-company-specialties">${c.specialties.map(s => `<span class="industry-tag">${s}</span>`).join('')}</div>` : ''}
                    <div class="industry-company-meta">
                      ${c.location ? `<span><i class="fas fa-map-marker-alt"></i> ${c.location}</span>` : ''}
                      ${c.founded_year ? `<span><i class="fas fa-calendar"></i> ${c.founded_year}</span>` : ''}
                      ${c.website ? `<a href="${c.website}" target="_blank" class="industry-company-link"><i class="fas fa-external-link-alt"></i> Website</a>` : ''}
                    </div>
                  </div>
                </div>
              `).join('')}
          </div>
        </div>`;
    },

    showAddCompany() {
      const lang = window.appLang || 'ro';
      const modal = document.createElement('div');
      modal.className = 'admin-modal-overlay';
      modal.style.zIndex = '10001';
      modal.innerHTML = `
        <div class="admin-modal" style="max-width:500px;">
          <h3><i class="fas fa-building"></i> ${lang === 'ro' ? 'Adaugă Companie' : 'Add Company'}</h3>
          <div class="admin-modal-grid">
            <div class="admin-field"><label>${lang === 'ro' ? 'Nume companie *' : 'Company Name *'}</label><input id="acName" placeholder="Ex: Animaxia Studios"></div>
            <div class="admin-field"><label>${lang === 'ro' ? 'Website' : 'Website'}</label><input id="acWebsite" placeholder="https://..."></div>
            <div class="admin-field"><label>${lang === 'ro' ? 'Locație' : 'Location'}</label><input id="acLocation" placeholder="București, România"></div>
            <div class="admin-field"><label>${lang === 'ro' ? 'An fondare' : 'Founded Year'}</label><input id="acFounded" placeholder="2020"></div>
          </div>
          <div class="admin-field"><label>${lang === 'ro' ? 'Descriere' : 'Description'}</label><textarea id="acDescription" rows="3" placeholder="${lang === 'ro' ? 'Descrie compania...' : 'Describe the company...'}"></textarea></div>
          <div class="admin-field"><label>${lang === 'ro' ? 'Specializări (separate prin virgulă)' : 'Specialties (comma-separated)'}</label><input id="acSpecialties" placeholder="Animație, Producție, Streaming"></div>
          <div class="admin-modal-actions">
            <button class="btn btn-primary" id="acSaveBtn"><i class="fas fa-save"></i> ${lang === 'ro' ? 'Salvează' : 'Save'}</button>
            <button class="btn btn-secondary" onclick="this.closest('.admin-modal-overlay').remove()">${lang === 'ro' ? 'Anulează' : 'Cancel'}</button>
          </div>
          <p id="acError" class="auth-error"></p>
        </div>`;
      document.body.appendChild(modal);

      document.getElementById('acSaveBtn').addEventListener('click', async () => {
        const name = document.getElementById('acName').value.trim();
        if (!name) { document.getElementById('acError').textContent = 'Numele companiei este obligatoriu'; document.getElementById('acError').style.display = 'block'; return; }
        try {
          const token = localStorage.getItem('animaxia_token');
          const res = await fetch('/api/industry/companies', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              name,
              description: document.getElementById('acDescription').value.trim(),
              website: document.getElementById('acWebsite').value.trim(),
              location: document.getElementById('acLocation').value.trim(),
              founded_year: document.getElementById('acFounded').value.trim(),
              specialties: document.getElementById('acSpecialties').value.split(',').map(s => s.trim()).filter(Boolean)
            })
          });
          const data = await res.json();
          if (data.success) {
            modal.remove();
            if (window.App?.toast) window.App.toast(lang === 'ro' ? '✅ Companie adăugată!' : '✅ Company added!', 'success');
            this.loadTab('companies');
          } else {
            document.getElementById('acError').textContent = data.error || 'Error';
            document.getElementById('acError').style.display = 'block';
          }
        } catch(e) {
          document.getElementById('acError').textContent = e.message;
          document.getElementById('acError').style.display = 'block';
        }
      });
    },

    // ====== EVENTS ======
    async renderEvents(container) {
      const lang = window.appLang || 'ro';
      container.innerHTML = '<div style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin" style="font-size:24px;"></i></div>';

      const res = await fetch('/api/industry/events');
      const data = await res.json();
      const events = data.success ? data.data : [];

      container.innerHTML = `
        <div class="industry-events-page">
          <div class="industry-toolbar">
            <button class="btn btn-primary" onclick="Industry.showAddEvent()"><i class="fas fa-plus"></i> ${lang === 'ro' ? 'Adaugă Eveniment' : 'Add Event'}</button>
          </div>
          <div class="industry-events-grid">
            ${events.length === 0
              ? `<div class="industry-empty" style="grid-column:1/-1;"><i class="fas fa-calendar-alt"></i><h4>${lang === 'ro' ? 'Niciun eveniment' : 'No events'}</h4></div>`
              : events.map(e => {
                  const eventDate = new Date(e.start_date);
                  const daysUntil = Math.ceil((eventDate - new Date()) / (1000*60*60*24));
                  return `
                  <div class="industry-event-card">
                    <div class="industry-event-date">
                      <span class="industry-event-day">${eventDate.getDate()}</span>
                      <span class="industry-event-month">${eventDate.toLocaleDateString(lang === 'ro' ? 'ro-RO' : 'en-US', {month: 'short'})}</span>
                    </div>
                    <div class="industry-event-info">
                      <h3 class="industry-event-title">${e.title}</h3>
                      <p class="industry-event-desc">${e.description || ''}</p>
                      <div class="industry-event-meta">
                        <span><i class="fas ${e.is_online ? 'fa-globe' : 'fa-map-marker-alt'}"></i> ${e.is_online ? (lang === 'ro' ? 'Online' : 'Online') : e.location || (lang === 'ro' ? 'TBD' : 'TBD')}</span>
                        <span class="industry-event-type" style="background:${Industry.getEventColor(e.event_type)}">${e.event_type}</span>
                        ${daysUntil > 0 ? `<span class="industry-event-countdown">${lang === 'ro' ? 'În' : 'In'} ${daysUntil} ${lang === 'ro' ? 'zile' : 'days'}</span>` : '<span class="industry-event-countdown" style="color:var(--green);">' + (lang === 'ro' ? 'În curs' : 'Ongoing') + '</span>'}
                      </div>
                    </div>
                  </div>`;
                }).join('')}
          </div>
        </div>`;
    },

    showAddEvent() {
      const lang = window.appLang || 'ro';
      const modal = document.createElement('div');
      modal.className = 'admin-modal-overlay';
      modal.style.zIndex = '10001';
      modal.innerHTML = `
        <div class="admin-modal" style="max-width:500px;">
          <h3><i class="fas fa-calendar-plus"></i> ${lang === 'ro' ? 'Adaugă Eveniment' : 'Add Event'}</h3>
          <div class="admin-modal-grid">
            <div class="admin-field"><label>${lang === 'ro' ? 'Titlu *' : 'Title *'}</label><input id="aeTitle" placeholder="Ex: Conferința Animaxia 2025"></div>
            <div class="admin-field"><label>${lang === 'ro' ? 'Tip' : 'Type'}</label>
              <select id="aeType">
                <option value="conference">${lang === 'ro' ? 'Conferință' : 'Conference'}</option>
                <option value="workshop">${lang === 'ro' ? 'Atelier' : 'Workshop'}</option>
                <option value="networking">${lang === 'ro' ? 'Networking' : 'Networking'}</option>
                <option value="premiere">${lang === 'ro' ? 'Premieră' : 'Premiere'}</option>
                <option value="festival">${lang === 'ro' ? 'Festival' : 'Festival'}</option>
              </select>
            </div>
            <div class="admin-field"><label>${lang === 'ro' ? 'Data început *' : 'Start Date *'}</label><input id="aeStart" type="datetime-local"></div>
            <div class="admin-field"><label>${lang === 'ro' ? 'Data sfârșit' : 'End Date'}</label><input id="aeEnd" type="datetime-local"></div>
            <div class="admin-field"><label>${lang === 'ro' ? 'Locație' : 'Location'}</label><input id="aeLocation" placeholder="București"></div>
            <div class="admin-field"><label>${lang === 'ro' ? 'Online' : 'Online'}</label><select id="aeOnline"><option value="false">Nu</option><option value="true">Da</option></select></div>
            <div class="admin-field"><label>${lang === 'ro' ? 'URL înscriere' : 'Registration URL'}</label><input id="aeUrl" placeholder="https://..."></div>
            <div class="admin-field"><label>${lang === 'ro' ? 'Organizator' : 'Organizer'}</label><input id="aeOrganizer" placeholder="Animaxia"></div>
          </div>
          <div class="admin-field"><label>${lang === 'ro' ? 'Descriere' : 'Description'}</label><textarea id="aeDescription" rows="3"></textarea></div>
          <div class="admin-modal-actions">
            <button class="btn btn-primary" id="aeSaveBtn"><i class="fas fa-save"></i> ${lang === 'ro' ? 'Salvează' : 'Save'}</button>
            <button class="btn btn-secondary" onclick="this.closest('.admin-modal-overlay').remove()">${lang === 'ro' ? 'Anulează' : 'Cancel'}</button>
          </div>
          <p id="aeError" class="auth-error"></p>
        </div>`;
      document.body.appendChild(modal);

      document.getElementById('aeSaveBtn').addEventListener('click', async () => {
        const title = document.getElementById('aeTitle').value.trim();
        const start = document.getElementById('aeStart').value;
        if (!title || !start) { document.getElementById('aeError').textContent = 'Titlu și dată obligatorii'; document.getElementById('aeError').style.display = 'block'; return; }
        try {
          const token = localStorage.getItem('animaxia_token');
          const res = await fetch('/api/industry/events', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              title, description: document.getElementById('aeDescription').value.trim(),
              event_type: document.getElementById('aeType').value,
              location: document.getElementById('aeLocation').value.trim(),
              is_online: document.getElementById('aeOnline').value === 'true',
              start_date: new Date(start).toISOString(),
              end_date: document.getElementById('aeEnd').value ? new Date(document.getElementById('aeEnd').value).toISOString() : null,
              registration_url: document.getElementById('aeUrl').value.trim(),
              organizer: document.getElementById('aeOrganizer').value.trim()
            })
          });
          const data = await res.json();
          if (data.success) {
            modal.remove();
            if (window.App?.toast) window.App.toast('✅ ' + (lang === 'ro' ? 'Eveniment adăugat!' : 'Event added!'), 'success');
            this.loadTab('events');
          } else {
            document.getElementById('aeError').textContent = data.error || 'Error';
            document.getElementById('aeError').style.display = 'block';
          }
        } catch(e) {
          document.getElementById('aeError').textContent = e.message;
          document.getElementById('aeError').style.display = 'block';
        }
      });
    },

    // ====== JOBS ======
    async renderJobs(container) {
      const lang = window.appLang || 'ro';
      container.innerHTML = '<div style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin" style="font-size:24px;"></i></div>';

      const res = await fetch('/api/industry/jobs');
      const data = await res.json();
      const jobs = data.success ? data.data : [];

      container.innerHTML = `
        <div class="industry-jobs-page">
          <div class="industry-toolbar">
            <button class="btn btn-primary" onclick="Industry.showAddJob()"><i class="fas fa-plus"></i> ${lang === 'ro' ? 'Postează Job' : 'Post Job'}</button>
          </div>
          <div class="industry-jobs-list">
            ${jobs.length === 0
              ? `<div class="industry-empty"><i class="fas fa-briefcase"></i><h4>${lang === 'ro' ? 'Nicio poziție deschisă' : 'No open positions'}</h4></div>`
              : jobs.map(j => `
                <div class="industry-job-card">
                  <div class="industry-job-header">
                    <h3 class="industry-job-title">${j.title}</h3>
                    <span class="industry-job-type" style="background:${Industry.getJobColor(j.job_type)}">${j.job_type}</span>
                  </div>
                  <div class="industry-job-company">
                    <div class="industry-job-avatar" style="background:linear-gradient(135deg,#6c5ce7,#a29bfe);">${(j.company_name || '?')[0]}</div>
                    <span>${j.company_name}</span>
                  </div>
                  <p class="industry-job-desc">${j.description || ''}</p>
                  <div class="industry-job-meta">
                    ${j.location ? `<span><i class="fas fa-map-marker-alt"></i> ${j.location}</span>` : ''}
                    ${j.is_remote ? '<span><i class="fas fa-wifi"></i> Remote</span>' : ''}
                    ${j.salary_range ? `<span><i class="fas fa-money-bill-wave"></i> ${j.salary_range}</span>` : ''}
                  </div>
                  ${j.requirements ? `<div class="industry-job-reqs"><strong>${lang === 'ro' ? 'Cerințe:' : 'Requirements:'}</strong> ${j.requirements}</div>` : ''}
                  ${j.contact_email ? `<a href="mailto:${j.contact_email}" class="industry-job-apply"><i class="fas fa-envelope"></i> ${lang === 'ro' ? 'Aplică acum' : 'Apply Now'}</a>` : ''}
                </div>
              `).join('')}
          </div>
        </div>`;
    },

    // ====== HELPERS ======
    getCategoryColor(category) {
      const colors = {
        'platform': 'rgba(108,92,231,0.2)',
        'tech': 'rgba(9,132,227,0.2)',
        'analysis': 'rgba(0,184,148,0.2)',
        'general': 'rgba(255,255,255,0.1)'
      };
      return colors[category] || colors.general;
    },

    getEventColor(type) {
      const colors = {
        'conference': 'rgba(108,92,231,0.15)',
        'workshop': 'rgba(0,184,148,0.15)',
        'networking': 'rgba(253,203,110,0.15)',
        'premiere': 'rgba(233,69,96,0.15)',
        'festival': 'rgba(253,121,168,0.15)'
      };
      return colors[type] || 'rgba(255,255,255,0.1)';
    },

    getJobColor(type) {
      const colors = {
        'full-time': 'rgba(108,92,231,0.15)',
        'part-time': 'rgba(0,184,148,0.15)',
        'contract': 'rgba(253,203,110,0.15)',
        'internship': 'rgba(9,132,227,0.15)',
        'freelance': 'rgba(233,69,96,0.15)'
      };
      return colors[type] || 'rgba(255,255,255,0.1)';
    }
  };

  window.Industry = Industry;
})();
