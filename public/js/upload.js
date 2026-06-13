/**
 * Animaxia v7.0 - Upload Module
 * Full video upload system with drag & drop, progress tracking,
 * metadata form, and upload management.
 */
(function() {
  'use strict';

  const Upload = {
    currentFiles: { video: null, poster: null },
    uploading: false,
    uploads: [],
    page: 1,

    init() {
      // Module ready - waiting for app init
    },

    // ====== SHOW UPLOAD PAGE ======
    showPage() {
      if (window.App?.stopHero) window.App.stopHero();

      const existing = document.getElementById('uploadScreen');
      if (existing) existing.remove();
      const lang = window.appLang || 'ro';

      const screen = document.createElement('div');
      screen.id = 'uploadScreen';
      screen.className = 'full-page-screen';
      screen.style.zIndex = '1000';
      screen.innerHTML = `
        <div class="full-page-header">
          <div class="full-page-header-content">
            <button class="full-page-back" id="uploadBack"><i class="fas fa-arrow-left"></i></button>
            <h1><i class="fas fa-upload" style="color:var(--accent-secondary);"></i> ${lang === 'ro' ? 'Upload Conținut' : 'Content Upload'}</h1>
            <div style="margin-left:auto;display:flex;gap:8px;">
              <button class="btn btn-secondary" id="uploadRefreshBtn" style="padding:6px 14px;font-size:13px;">
                <i class="fas fa-sync-alt"></i>
              </button>
            </div>
          </div>
        </div>
        <div class="full-page-body" style="max-width:800px;">
          <!-- Upload Stats -->
          <div class="upload-stats" id="uploadStats"></div>

          <!-- Upload Zone -->
          <div class="upload-zone" id="uploadZone">
            <input type="file" id="uploadVideoInput" accept="video/mp4,video/webm,video/ogg" style="display:none">
            <input type="file" id="uploadPosterInput" accept="image/jpeg,image/png,image/webp" style="display:none">
            <div class="upload-zone-content">
              <i class="fas fa-cloud-upload-alt upload-zone-icon"></i>
              <h3 class="upload-zone-title" id="uploadZoneTitle">${lang === 'ro' ? 'Trage fișierul video aici' : 'Drop video file here'}</h3>
              <p class="upload-zone-subtitle">${lang === 'ro' ? 'sau' : 'or'}</p>
              <div class="upload-zone-actions">
                <button class="btn btn-primary" id="uploadSelectVideo">
                  <i class="fas fa-video"></i> ${lang === 'ro' ? 'Selectează Video' : 'Select Video'}
                </button>
                <button class="btn btn-secondary" id="uploadSelectPoster">
                  <i class="fas fa-image"></i> ${lang === 'ro' ? 'Adaugă Poster' : 'Add Poster'}
                </button>
              </div>
              <div class="upload-file-info" id="uploadFileInfo" style="display:none;"></div>
            </div>
            <!-- Progress Bar (hidden by default) -->
            <div class="upload-progress-container" id="uploadProgressContainer" style="display:none;">
              <div class="upload-progress-bar">
                <div class="upload-progress-fill" id="uploadProgressFill" style="width:0%"></div>
              </div>
              <div class="upload-progress-text">
                <span id="uploadProgressPercent">0%</span>
                <span id="uploadProgressStatus">${lang === 'ro' ? 'Se încarcă...' : 'Uploading...'}</span>
              </div>
            </div>
          </div>

          <!-- Metadata Form -->
          <div class="upload-form" id="uploadForm" style="display:none;">
            <h3 class="upload-form-title"><i class="fas fa-info-circle"></i> ${lang === 'ro' ? 'Detalii Conținut' : 'Content Details'}</h3>
            <div class="upload-form-grid">
              <div class="upload-field">
                <label>${lang === 'ro' ? 'Titlu (Română)' : 'Title (Romanian)'} *</label>
                <input type="text" id="uploadTitle" placeholder="${lang === 'ro' ? 'Ex: Filmul Meu' : 'E.g.: My Movie'}" required>
              </div>
              <div class="upload-field">
                <label>${lang === 'ro' ? 'Titlu (Engleză)' : 'Title (English)'}</label>
                <input type="text" id="uploadTitleEn" placeholder="${lang === 'ro' ? 'Ex: My Movie' : 'E.g.: My Movie'}">
              </div>
              <div class="upload-field">
                <label>${lang === 'ro' ? 'Gen (separat prin virgulă)' : 'Genre (comma-separated)'}</label>
                <input type="text" id="uploadGenre" placeholder="${lang === 'ro' ? 'Ex: Acțiune, Aventuri, SF' : 'E.g.: Action, Adventure, Sci-Fi'}">
              </div>
              <div class="upload-field">
                <label>${lang === 'ro' ? 'An' : 'Year'}</label>
                <input type="text" id="uploadYear" placeholder="2025" value="${new Date().getFullYear()}">
              </div>
              <div class="upload-field">
                <label>${lang === 'ro' ? 'Durată' : 'Duration'}</label>
                <input type="text" id="uploadDuration" placeholder="${lang === 'ro' ? 'Ex: 2h 15min' : 'E.g.: 2h 15min'}">
              </div>
              <div class="upload-field">
                <label>Rating</label>
                <select id="uploadRating">
                  <option value="G">G</option>
                  <option value="PG">PG</option>
                  <option value="PG-13" selected>PG-13</option>
                  <option value="R">R</option>
                  <option value="TV-MA">TV-MA</option>
                  <option value="TV-14">TV-14</option>
                  <option value="TV-PG">TV-PG</option>
                </select>
              </div>
            </div>
            <div class="upload-field" style="grid-column:1/-1;">
              <label>${lang === 'ro' ? 'Descriere (Română)' : 'Description (Romanian)'}</label>
              <textarea id="uploadDescription" rows="3" placeholder="${lang === 'ro' ? 'O scurtă descriere...' : 'A short description...'}"></textarea>
            </div>
            <div class="upload-field" style="grid-column:1/-1;">
              <label>${lang === 'ro' ? 'Descriere (Engleză)' : 'Description (English)'}</label>
              <textarea id="uploadDescriptionEn" rows="3" placeholder="A short description..."></textarea>
            </div>
            <div class="upload-form-actions">
              <button class="btn btn-primary" id="uploadStartBtn" style="padding:12px 32px;font-size:16px;">
                <i class="fas fa-cloud-upload-alt"></i> ${lang === 'ro' ? 'Începe Upload-ul' : 'Start Upload'}
              </button>
              <button class="btn btn-secondary" id="uploadCancelBtn">
                <i class="fas fa-times"></i> ${lang === 'ro' ? 'Anulează' : 'Cancel'}
              </button>
            </div>
            <p id="uploadError" class="auth-error"></p>
          </div>

          <!-- Uploaded Content List -->
          <div class="uploaded-list" id="uploadedList">
            <h3 class="upload-form-title" style="margin-bottom:16px;">
              <i class="fas fa-list"></i> ${lang === 'ro' ? 'Conținutul tău încărcat' : 'Your Uploaded Content'}
            </h3>
            <div id="uploadListContainer">
              <div style="text-align:center;padding:40px;color:var(--text-tertiary);">
                <i class="fas fa-spinner fa-spin" style="font-size:24px;display:block;margin-bottom:12px;"></i>
                <p>${lang === 'ro' ? 'Se încarcă...' : 'Loading...'}</p>
              </div>
            </div>
          </div>
        </div>`;

      document.body.appendChild(screen);

      // Bind events
      document.getElementById('uploadBack').addEventListener('click', () => {
        screen.remove();
        if (window.App?.startHero) window.App.startHero();
      });
      document.getElementById('uploadRefreshBtn').addEventListener('click', () => this.loadUploads());

      // Upload zone events
      const zone = document.getElementById('uploadZone');
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
          const videoFile = Array.from(files).find(f => f.type.startsWith('video/'));
          if (videoFile) this.setVideoFile(videoFile);
        }
      });

      document.getElementById('uploadSelectVideo').addEventListener('click', () => {
        document.getElementById('uploadVideoInput').click();
      });
      document.getElementById('uploadVideoInput').addEventListener('change', (e) => {
        if (e.target.files[0]) this.setVideoFile(e.target.files[0]);
      });
      document.getElementById('uploadSelectPoster').addEventListener('click', () => {
        document.getElementById('uploadPosterInput').click();
      });
      document.getElementById('uploadPosterInput').addEventListener('change', (e) => {
        if (e.target.files[0]) this.setPosterFile(e.target.files[0]);
      });

      document.getElementById('uploadStartBtn').addEventListener('click', () => this.startUpload());
      document.getElementById('uploadCancelBtn').addEventListener('click', () => this.resetForm());

      this.loadUploads();
    },

    // ====== FILE HANDLING ======
    setVideoFile(file) {
      this.currentFiles.video = file;
      this.showFileInfo();
      document.getElementById('uploadForm').style.display = 'block';
      document.getElementById('uploadForm').scrollIntoView({ behavior: 'smooth' });
    },

    setPosterFile(file) {
      this.currentFiles.poster = file;
      this.showFileInfo();
    },

    showFileInfo() {
      const info = document.getElementById('uploadFileInfo');
      const lang = window.appLang || 'ro';
      if (!this.currentFiles.video) { info.style.display = 'none'; return; }

      const v = this.currentFiles.video;
      const size = v.size > 1024 * 1024 * 1024
        ? (v.size / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
        : (v.size / (1024 * 1024)).toFixed(1) + ' MB';
      info.style.display = 'flex';
      info.innerHTML = `
        <div class="upload-file-badge"><i class="fas fa-video"></i> ${v.name}</div>
        <span class="upload-file-size">${size}</span>
        ${this.currentFiles.poster ? '<span class="upload-file-badge poster"><i class="fas fa-image"></i> ' + this.currentFiles.poster.name + '</span>' : ''}
        <button class="upload-file-remove" onclick="Upload.resetForm()"><i class="fas fa-times"></i></button>`;
    },

    // ====== UPLOAD EXECUTION ======
    async startUpload() {
      const lang = window.appLang || 'ro';
      const title = document.getElementById('uploadTitle').value.trim();
      if (!title || !this.currentFiles.video) {
        document.getElementById('uploadError').textContent = lang === 'ro' ? 'Titlu și fișier video obligatorii' : 'Title and video file required';
        document.getElementById('uploadError').style.display = 'block';
        return;
      }
      if (this.uploading) return;

      this.uploading = true;
      document.getElementById('uploadStartBtn').disabled = true;
      document.getElementById('uploadStartBtn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (lang === 'ro' ? 'Se încarcă...' : 'Uploading...');

      const formData = new FormData();
      formData.append('video', this.currentFiles.video);
      if (this.currentFiles.poster) formData.append('poster', this.currentFiles.poster);
      formData.append('title', title);
      formData.append('title_en', document.getElementById('uploadTitleEn').value.trim());
      formData.append('genre', document.getElementById('uploadGenre').value.trim());
      formData.append('year', document.getElementById('uploadYear').value.trim());
      formData.append('duration', document.getElementById('uploadDuration').value.trim());
      formData.append('rating', document.getElementById('uploadRating').value);
      formData.append('description', document.getElementById('uploadDescription').value.trim());
      formData.append('description_en', document.getElementById('uploadDescriptionEn').value.trim());

      // Show progress
      const progressContainer = document.getElementById('uploadProgressContainer');
      const progressFill = document.getElementById('uploadProgressFill');
      const progressPercent = document.getElementById('uploadProgressPercent');
      const progressStatus = document.getElementById('uploadProgressStatus');
      progressContainer.style.display = 'block';

      try {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/upload', true);

        const token = localStorage.getItem('animaxia_token');
        if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            progressFill.style.width = pct + '%';
            progressPercent.textContent = pct + '%';
          }
        };

        const result = await new Promise((resolve, reject) => {
          xhr.onload = () => {
            try { resolve(JSON.parse(xhr.responseText)); }
            catch { reject(new Error('Invalid response')); }
          };
          xhr.onerror = () => reject(new Error('Upload failed'));
          xhr.send(formData);
        });

        if (result.success) {
          progressFill.style.width = '100%';
          progressPercent.textContent = '100%';
          progressStatus.textContent = '✅ ' + (lang === 'ro' ? 'Upload finalizat!' : 'Upload complete!');
          if (window.App?.toast) window.App.toast('✅ ' + (lang === 'ro' ? 'Conținut încărcat cu succes!' : 'Content uploaded successfully!'), 'success');
          this.resetForm();
          this.loadUploads();
        } else {
          throw new Error(result.error || 'Upload failed');
        }
      } catch (e) {
        progressFill.style.width = '0%';
        progressPercent.textContent = lang === 'ro' ? 'Eroare' : 'Error';
        progressStatus.textContent = '❌ ' + (e.message || (lang === 'ro' ? 'Eroare la upload' : 'Upload error'));
        document.getElementById('uploadError').textContent = e.message;
        document.getElementById('uploadError').style.display = 'block';
      } finally {
        this.uploading = false;
        document.getElementById('uploadStartBtn').disabled = false;
        document.getElementById('uploadStartBtn').innerHTML = '<i class="fas fa-cloud-upload-alt"></i> ' + (lang === 'ro' ? 'Începe Upload-ul' : 'Start Upload');
      }
    },

    resetForm() {
      this.currentFiles = { video: null, poster: null };
      document.getElementById('uploadForm').style.display = 'none';
      document.getElementById('uploadFileInfo').style.display = 'none';
      document.getElementById('uploadProgressContainer').style.display = 'none';
      document.getElementById('uploadError').style.display = 'none';
      document.getElementById('uploadVideoInput').value = '';
      document.getElementById('uploadPosterInput').value = '';
      document.getElementById('uploadZone').classList.remove('drag-over');
    },

    // ====== LOAD UPLOADS ======
    async loadUploads() {
      const container = document.getElementById('uploadListContainer');
      const lang = window.appLang || 'ro';
      if (!container) return;

      try {
        const token = localStorage.getItem('animaxia_token');
        if (!token) {
          container.innerHTML = '<div class="upload-empty"><i class="fas fa-lock"></i><h3>Login required</h3></div>';
          return;
        }

        const res = await fetch(`/api/upload/list?page=${this.page}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        // Update stats
        const statsEl = document.getElementById('uploadStats');
        if (statsEl && data.success) {
          statsEl.innerHTML = `
            <div class="upload-stat-card"><span class="upload-stat-value">${data.total || 0}</span><span class="upload-stat-label">${lang === 'ro' ? 'Total încărcări' : 'Total Uploads'}</span></div>
            <div class="upload-stat-card" style="background:rgba(108,92,231,0.08);border-color:rgba(108,92,231,0.15);">
              <span class="upload-stat-value" style="color:var(--accent-secondary);">${data.pages || 0}</span>
              <span class="upload-stat-label">${lang === 'ro' ? 'Pagini' : 'Pages'}</span>
            </div>`;
        }

        if (!data.success || !data.data || data.data.length === 0) {
          container.innerHTML = `<div class="upload-empty">
            <i class="fas fa-cloud-upload-alt"></i>
            <h3>${lang === 'ro' ? 'Niciun conținut încărcat' : 'No uploaded content'}</h3>
            <p>${lang === 'ro' ? 'Încarcă primul tău videoclip folosind secțiunea de mai sus.' : 'Upload your first video using the section above.'}</p>
          </div>`;
          return;
        }

        container.innerHTML = `
          <div class="upload-grid">
            ${data.data.map(item => `
              <div class="upload-item" data-id="${item.id}">
                <div class="upload-item-thumb" style="background:${item.poster_url ? `url(${item.poster_url}) center/cover` : 'linear-gradient(135deg, #6c5ce7, #a29bfe)'}">
                  ${item.poster_url ? '' : '<i class="fas fa-video" style="font-size:32px;opacity:0.5;"></i>'}
                  <div class="upload-item-overlay">
                    <button class="upload-item-play" onclick="App.openPlayer('${item.id}')"><i class="fas fa-play"></i></button>
                  </div>
                </div>
                <div class="upload-item-info">
                  <div class="upload-item-title">${item.title}</div>
                  <div class="upload-item-meta">
                    ${item.year ? `<span>${item.year}</span>` : ''}
                    ${item.duration ? `<span class="content-card-dot">•</span><span>${item.duration}</span>` : ''}
                  </div>
                  <div class="upload-item-meta">
                    ${(item.genre || []).slice(0, 2).join(', ')}
                  </div>
                  <div class="upload-item-actions">
                    <button class="btn btn-primary upload-item-play-btn" onclick="App.openPlayer('${item.id}')" style="padding:4px 12px;font-size:12px;">
                      <i class="fas fa-play"></i> ${lang === 'ro' ? 'Rulează' : 'Play'}
                    </button>
                    <button class="upload-item-delete" onclick="Upload.deleteUpload('${item.id}')" title="${lang === 'ro' ? 'Șterge' : 'Delete'}">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
          ${data.pages > 1 ? `
            <div class="upload-pagination">
              ${Array.from({length: data.pages}, (_, i) => `
                <button class="upload-page-btn ${i + 1 === this.page ? 'active' : ''}" data-page="${i + 1}">${i + 1}</button>
              `).join('')}
            </div>` : ''}`;

        // Bind pagination
        container.querySelectorAll('.upload-page-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            this.page = parseInt(btn.dataset.page);
            this.loadUploads();
          });
        });
      } catch (e) {
        container.innerHTML = `<div class="upload-empty">
          <i class="fas fa-exclamation-circle"></i>
          <h3>${lang === 'ro' ? 'Eroare la încărcare' : 'Error loading'}</h3>
          <p>${e.message}</p>
        </div>`;
      }
    },

    // ====== DELETE UPLOAD ======
    async deleteUpload(id) {
      const lang = window.appLang || 'ro';
      if (!confirm(lang === 'ro' ? 'Ești sigur că vrei să ștergi acest conținut?' : 'Are you sure you want to delete this content?')) return;

      try {
        const token = localStorage.getItem('animaxia_token');
        const res = await fetch(`/api/upload/${id}`, {
          method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
          if (window.App?.toast) window.App.toast(lang === 'ro' ? 'Conținut șters!' : 'Content deleted!', 'success');
          this.loadUploads();
        } else {
          if (window.App?.toast) window.App.toast(data.error || 'Error', 'error');
        }
      } catch {
        if (window.App?.toast) window.App.toast('Error', 'error');
      }
    }
  };

  window.Upload = Upload;
})();
