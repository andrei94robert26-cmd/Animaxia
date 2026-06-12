/**
 * Animaxia v5.2 - User Collections Module
 * Create, manage, and share custom content collections
 */

(function() {
  'use strict';

  const Collections = {
    initialized: false,

    async init() {
      if (this.initialized) return;
      this.initialized = true;
      
      // Wait for App to be ready
      const checkApp = setInterval(() => {
        if (window.App && window.App.currentProfile) {
          clearInterval(checkApp);
          this.addCollectionBtn();
        }
      }, 500);
      
      // Add collect button to detail modal
      this.injectCollectBtn();
    },

    injectCollectBtn() {
      // Watch for detail modal to open
      document.addEventListener('click', (e) => {
        const modal = document.getElementById('detailModal');
        if (modal?.classList.contains('active')) {
          setTimeout(() => this.addCollectButtonToModal(), 300);
        }
      });
    },

    addCollectButtonToModal() {
      const actions = document.getElementById('modalActions');
      if (!actions || actions.querySelector('[data-collect-btn]')) return;
      
      const btn = document.createElement('button');
      btn.className = 'btn btn-secondary';
      btn.dataset.collectBtn = 'true';
      btn.innerHTML = '<i class="fas fa-folder-plus"></i> <span data-lang="ro">Salvează în colecție</span><span data-lang="en" style="display:none;">Save to collection</span>';
      btn.addEventListener('click', () => this.showCollectionPicker(App.currentDetailId));
      actions.appendChild(btn);
    },

    addCollectionBtn() {
      // Add to user dropdown
      const dropdown = document.getElementById('userDropdown');
      if (dropdown) {
        const existing = dropdown.querySelector('[data-action="collections"]');
        if (!existing && window.App?.currentUser?.role !== 'admin') {
          const div = document.createElement('div');
          div.className = 'dropdown-divider';
          dropdown.insertBefore(div, dropdown.querySelector('[data-action="logout"]')?.previousElementSibling);
          
          const a = document.createElement('a');
          a.href = '#';
          a.className = 'dropdown-item';
          a.dataset.action = 'collections';
          a.innerHTML = '<i class="fas fa-folder"></i> <span data-lang="ro">Colecțiile mele</span><span data-lang="en" style="display:none;">My Collections</span>';
          a.addEventListener('click', (e) => {
            e.preventDefault();
            this.showCollectionsPage();
          });
          dropdown.insertBefore(a, dropdown.querySelector('[data-action="logout"]'));
        }
      }
    },

    async showCollectionsPage() {
      if (!window.App?.currentProfile) return;
      
      const profileId = window.App.currentProfile.id;
      const lang = window.appLang || 'ro';
      
      try {
        const res = await fetch(`/api/collections/${profileId}`);
        const data = await res.json();
        
        let html = `
          <div class="full-page-screen" id="collections-screen" style="z-index:1001;">
            <div class="full-page-header">
              <div class="full-page-header-content">
                <button class="full-page-back" id="collectionsBack"><i class="fas fa-arrow-left"></i></button>
                <h1>${lang === 'ro' ? 'Colecțiile mele' : 'My Collections'}</h1>
                <button class="btn btn-primary" id="createCollectionBtn" style="margin-left:auto;padding:8px 16px;font-size:13px;">
                  <i class="fas fa-plus"></i> ${lang === 'ro' ? 'Colecție nouă' : 'New Collection'}
                </button>
              </div>
            </div>
            <div class="full-page-body" id="collectionsBody">`;
        
        if (data.success && data.data.length > 0) {
          html += `<div class="collections-grid">${data.data.map(c => `
            <div class="collection-card" data-id="${c.id}">
              <div class="collection-card-bg" style="background:${c.cover_color || '#6c5ce7'}">
                <span class="collection-card-icon">📁</span>
                <span class="collection-card-count">${c.item_count || 0} ${lang === 'ro' ? 'iteme' : 'items'}</span>
              </div>
              <div class="collection-card-info">
                <div class="collection-card-name">${c.name}</div>
                ${c.description ? `<div class="collection-card-desc">${c.description}</div>` : ''}
                <div class="collection-card-meta">
                  ${c.is_public ? '<span class="collection-badge public"><i class="fas fa-globe"></i> Public</span>' : '<span class="collection-badge private"><i class="fas fa-lock"></i> Private</span>'}
                  <button class="collection-delete-btn" data-id="${c.id}" title="${lang === 'ro' ? 'Șterge colecția' : 'Delete collection'}"><i class="fas fa-trash"></i></button>
                </div>
              </div>
            </div>`).join('')}</div>`;
        } else {
          html += `<div class="collections-empty">
            <i class="fas fa-folder-open"></i>
            <h3>${lang === 'ro' ? 'Nicio colecție încă' : 'No collections yet'}</h3>
            <p>${lang === 'ro' ? 'Creează-ți prima colecție personalizată de conținut!' : 'Create your first custom content collection!'}</p>
            <button class="btn btn-primary" id="createCollectionEmptyBtn"><i class="fas fa-plus"></i> ${lang === 'ro' ? 'Creează colecție' : 'Create Collection'}</button>
          </div>`;
        }
        
        html += `</div></div>`;
        
        // Add to body
        const existing = document.getElementById('collections-screen');
        if (existing) existing.remove();
        document.body.insertAdjacentHTML('beforeend', html);
        
        // Bind events
        document.getElementById('collectionsBack')?.addEventListener('click', () => {
          document.getElementById('collections-screen')?.remove();
        });
        
        document.getElementById('createCollectionBtn')?.addEventListener('click', () => this.showCreateDialog());
        document.getElementById('createCollectionEmptyBtn')?.addEventListener('click', () => this.showCreateDialog());
        
        document.querySelectorAll('.collection-card').forEach(card => {
          card.addEventListener('click', (e) => {
            if (e.target.closest('.collection-delete-btn')) return;
            this.showCollectionDetail(card.dataset.id);
          });
        });
        
        document.querySelectorAll('.collection-delete-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteCollection(btn.dataset.id);
          });
        });
        
      } catch (e) {
        if (window.App?.toast) window.App.toast('Error loading collections', 'error');
      }
    },

    showCreateDialog() {
      const lang = window.appLang || 'ro';
      const overlay = document.createElement('div');
      overlay.className = 'admin-modal-overlay';
      overlay.style.zIndex = '10010';
      overlay.innerHTML = `
        <div class="admin-modal" style="max-width:400px;">
          <h3>${lang === 'ro' ? 'Colecție nouă' : 'New Collection'}</h3>
          <div class="admin-field">
            <label>${lang === 'ro' ? 'Nume' : 'Name'}</label>
            <input id="collectionName" placeholder="${lang === 'ro' ? 'Ex: Favoritele mele' : 'E.g.: My Favorites'}" autofocus>
          </div>
          <div class="admin-field">
            <label>${lang === 'ro' ? 'Descriere (opțional)' : 'Description (optional)'}</label>
            <input id="collectionDesc" placeholder="${lang === 'ro' ? 'O scurtă descriere...' : 'A short description...'}">
          </div>
          <div class="admin-field" style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" id="collectionPublic" style="width:auto;">
            <label for="collectionPublic" style="margin:0;">${lang === 'ro' ? 'Colecție publică' : 'Public collection'}</label>
          </div>
          <div class="admin-modal-actions">
            <button class="btn btn-primary" id="saveCollectionBtn">${lang === 'ro' ? 'Salvează' : 'Save'}</button>
            <button class="btn btn-secondary" id="cancelCollectionBtn">${lang === 'ro' ? 'Anulează' : 'Cancel'}</button>
          </div>
          <p id="collectionError" class="auth-error"></p>
        </div>`;
      document.body.appendChild(overlay);
      
      document.getElementById('saveCollectionBtn').addEventListener('click', () => this.createCollection());
      document.getElementById('cancelCollectionBtn').addEventListener('click', () => overlay.remove());
      document.getElementById('collectionName')?.focus();
    },

    async createCollection() {
      const name = document.getElementById('collectionName')?.value?.trim();
      if (!name) {
        document.getElementById('collectionError').textContent = window.appLang === 'ro' ? 'Numele este obligatoriu' : 'Name is required';
        return;
      }
      
      try {
        const res = await fetch('/api/collections', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profileId: window.App.currentProfile.id,
            name,
            description: document.getElementById('collectionDesc')?.value || '',
            isPublic: document.getElementById('collectionPublic')?.checked || false
          })
        });
        const data = await res.json();
        if (data.success) {
          document.querySelector('.admin-modal-overlay')?.remove();
          if (window.App?.toast) window.App.toast(window.appLang === 'ro' ? 'Colecție creată!' : 'Collection created!', 'success');
          this.showCollectionsPage();
        }
      } catch {
        if (window.App?.toast) window.App.toast('Error', 'error');
      }
    },

    async showCollectionPicker(itemId) {
      if (!window.App?.currentProfile) return;
      const profileId = window.App.currentProfile.id;
      const lang = window.appLang || 'ro';
      
      try {
        const res = await fetch(`/api/collections/${profileId}`);
        const data = await res.json();
        
        const overlay = document.createElement('div');
        overlay.className = 'admin-modal-overlay';
        overlay.style.zIndex = '10010';
        
        let html = `<div class="admin-modal" style="max-width:400px;">
          <h3>${lang === 'ro' ? 'Salvează în colecție' : 'Save to Collection'}</h3>`;
        
        if (data.success && data.data.length > 0) {
          html += `<div class="collection-picker-list">${data.data.map(c => `
            <div class="collection-picker-item" data-coll-id="${c.id}">
              <span class="collection-picker-icon" style="background:${c.cover_color || '#6c5ce7'}">📁</span>
              <span class="collection-picker-name">${c.name}</span>
              <span class="collection-picker-count">${c.item_count || 0}</span>
            </div>`).join('')}</div>`;
        } else {
          html += `<p style="color:var(--text-tertiary);text-align:center;padding:20px;">
            ${lang === 'ro' ? 'Nu ai nicio colecție. Creează una mai întâi!' : 'No collections yet. Create one first!'}</p>
          <button class="btn btn-primary" id="createFirstColl" style="width:100%;justify-content:center;">
            <i class="fas fa-plus"></i> ${lang === 'ro' ? 'Colecție nouă' : 'New Collection'}
          </button>`;
        }
        
        html += `<button class="btn btn-secondary" id="closePicker" style="width:100%;justify-content:center;margin-top:8px;">
          ${lang === 'ro' ? 'Închide' : 'Close'}</button></div>`;
        
        overlay.innerHTML = html;
        document.body.appendChild(overlay);
        
        overlay.querySelectorAll('.collection-picker-item').forEach(el => {
          el.addEventListener('click', async () => {
            const res = await fetch(`/api/collections/${el.dataset.collId}/items`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ itemId })
            });
            const d = await res.json();
            if (d.success) {
              overlay.remove();
              if (window.App?.toast) window.App.toast(window.appLang === 'ro' ? 'Adăugat în colecție!' : 'Added to collection!', 'success');
            }
          });
        });
        
        document.getElementById('closePicker')?.addEventListener('click', () => overlay.remove());
        document.getElementById('createFirstColl')?.addEventListener('click', () => {
          overlay.remove();
          this.showCreateDialog();
        });
        
      } catch (e) {
        if (window.App?.toast) window.App.toast('Error', 'error');
      }
    },

    async showCollectionDetail(collectionId) {
      const lang = window.appLang || 'ro';
      
      try {
        const res = await fetch(`/api/collections/${collectionId}/items`);
        const data = await res.json();
        
        const overlay = document.createElement('div');
        overlay.className = 'admin-modal-overlay';
        overlay.style.zIndex = '10010';
        
        let html = `<div class="admin-modal" style="max-width:600px;">
          <h3 style="display:flex;align-items:center;gap:8px;"><span>📁</span> ${lang === 'ro' ? 'Iteme din colecție' : 'Collection Items'}</h3>`;
        
        if (data.success && data.data.length > 0) {
          html += `<div class="collection-items-list">${data.data.map(item => `
            <div class="collection-item" data-id="${item.item_id}">
              <div class="collection-item-thumb" style="background:${item.bg_color || '#1e1e2e'}">🎬</div>
              <div class="collection-item-info">
                <div class="collection-item-title">${item.title}</div>
                <div class="collection-item-meta">${item.year || ''} • ${item.content_type === 'series' ? (lang === 'ro' ? 'Serial' : 'Series') : (lang === 'ro' ? 'Film' : 'Movie')}</div>
              </div>
              <div class="collection-item-actions">
                <button class="collection-rm-btn" data-item="${item.item_id}"><i class="fas fa-times"></i></button>
              </div>
            </div>`).join('')}</div>`;
        } else {
          html += `<p style="color:var(--text-tertiary);text-align:center;padding:20px;">
            ${lang === 'ro' ? 'Colecția este goală' : 'Collection is empty'}</p>`;
        }
        
        html += `<button class="btn btn-secondary" id="closeCollectionDetail" style="width:100%;justify-content:center;margin-top:8px;">
          ${lang === 'ro' ? 'Închide' : 'Close'}</button></div>`;
        
        overlay.innerHTML = html;
        document.body.appendChild(overlay);
        
        overlay.querySelectorAll('.collection-rm-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const res = await fetch(`/api/collections/${collectionId}/items/${btn.dataset.item}`, { method: 'DELETE' });
            const d = await res.json();
            if (d.success) {
              overlay.remove();
              this.showCollectionDetail(collectionId);
            }
          });
        });
        
        overlay.querySelectorAll('.collection-item').forEach(el => {
          el.addEventListener('click', (e) => {
            if (e.target.closest('.collection-rm-btn')) return;
            overlay.remove();
            if (window.App?.openDetail) window.App.openDetail(el.dataset.id);
          });
        });
        
        document.getElementById('closeCollectionDetail')?.addEventListener('click', () => overlay.remove());
        
      } catch { if (window.App?.toast) window.App.toast('Error', 'error'); }
    },

    async deleteCollection(id) {
      const lang = window.appLang || 'ro';
      if (!confirm(lang === 'ro' ? 'Ești sigur?' : 'Are you sure?')) return;
      try {
        const res = await fetch(`/api/collections/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          if (window.App?.toast) window.App.toast(lang === 'ro' ? 'Colecție ștearsă' : 'Collection deleted', 'info');
          this.showCollectionsPage();
        }
      } catch { if (window.App?.toast) window.App.toast('Error', 'error'); }
    }
  };

  // Auto-initialize when DOM is ready
  if (document.readyState !== 'loading') {
    Collections.init();
  } else {
    document.addEventListener('DOMContentLoaded', () => Collections.init());
  }

  window.Collections = Collections;
})();
