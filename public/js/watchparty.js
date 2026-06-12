/**
 * Animaxia v5.3 - Watch Party / GroupWatch Module
 * Create rooms, invite friends, chat, sync playback
 * Netflix Party / Prime Video Watch Party style
 */
(function() {
  'use strict';

  const WP = {
    currentRoomId: null,
    pollInterval: null,
    chatInputVisible: false,

    init() {
      this.addWatchPartyButton();
    },

    addWatchPartyButton() {
      document.addEventListener('click', (e) => {
        const modal = document.getElementById('detailModal');
        if (modal?.classList.contains('active')) {
          setTimeout(() => this.injectButton(), 300);
        }
      });
    },

    injectButton() {
      const actions = document.getElementById('modalActions');
      if (!actions || actions.querySelector('[data-wp-btn]')) return;

      const btn = document.createElement('button');
      btn.className = 'btn btn-secondary';
      btn.dataset.wpBtn = 'true';
      btn.innerHTML = '<i class="fas fa-users"></i> <span>Watch Party</span>';
      btn.addEventListener('click', () => this.openPanel());
      actions.appendChild(btn);
    },

    openPanel() {
      const lang = window.appLang || 'ro';
      const existing = document.getElementById('watchPartyPanel');
      if (existing) existing.remove();

      const panel = document.createElement('div');
      panel.id = 'watchPartyPanel';
      panel.className = 'admin-modal-overlay';
      panel.style.zIndex = '10005';
      panel.innerHTML = `
        <div class="admin-modal" style="max-width:450px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
            <h3><i class="fas fa-users" style="color:var(--accent-secondary);"></i> ${lang === 'ro' ? 'Watch Party' : 'Watch Party'}</h3>
            <button class="quiz-modal-close" onclick="document.getElementById('watchPartyPanel').remove()"><i class="fas fa-times"></i></button>
          </div>
          <div style="display:flex;flex-direction:column;gap:12px;">
            <button class="btn btn-primary" id="wpCreateBtn" style="justify-content:center;"><i class="fas fa-plus-circle"></i> ${lang === 'ro' ? 'Creează o cameră' : 'Create a Room'}</button>
            <div style="position:relative;">
              <input type="text" id="wpJoinInput" placeholder="${lang === 'ro' ? 'Sau introdu codul camerei...' : 'Or enter room code...'}" style="padding-right:80px;">
              <button class="btn btn-secondary" id="wpJoinBtn" style="position:absolute;right:4px;top:50%;transform:translateY(-50%);padding:6px 12px;font-size:12px;">
                <i class="fas fa-sign-in-alt"></i> ${lang === 'ro' ? 'Intră' : 'Join'}
              </button>
            </div>
            <p style="font-size:12px;color:var(--text-tertiary);text-align:center;">
              <i class="fas fa-info-circle"></i> 
              ${lang === 'ro' ? 'Vizionează împreună cu prietenii în timp real!' : 'Watch together with friends in real-time!'}
            </p>
          </div>
        </div>`;
      document.body.appendChild(panel);

      document.getElementById('wpCreateBtn').addEventListener('click', () => this.createRoom());
      document.getElementById('wpJoinBtn').addEventListener('click', () => this.joinRoom());
      document.getElementById('wpJoinInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.joinRoom();
      });
    },

    async createRoom() {
      if (!window.App?.currentProfile || !window.App?.currentPlayerItemId) {
        if (window.App?.toast) window.App.toast((window.appLang || 'ro') === 'ro' ? 'Deschide mai întâi un conținut' : 'Open content first', 'error');
        return;
      }

      try {
        const res = await fetch('/api/watch-party/create', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profileId: window.App.currentProfile.id,
            itemId: window.App.currentPlayerItemId
          })
        });
        const data = await res.json();
        if (data.success) {
          this.showRoom(data.roomId, data.shareUrl);
        }
      } catch {
        if (window.App?.toast) window.App.toast('Error creating room', 'error');
      }
    },

    async joinRoom() {
      const input = document.getElementById('wpJoinInput');
      const roomId = input?.value?.trim();
      if (!roomId || !window.App?.currentProfile) return;

      try {
        const res = await fetch('/api/watch-party/join', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId, profileId: window.App.currentProfile.id })
        });
        const data = await res.json();
        if (data.success) {
          document.getElementById('watchPartyPanel')?.remove();
          this.showRoom(roomId);
        } else {
          if (window.App?.toast) window.App.toast(data.error || 'Room not found', 'error');
        }
      } catch {
        if (window.App?.toast) window.App.toast('Error joining room', 'error');
      }
    },

    async showRoom(roomId, shareUrl) {
      const lang = window.appLang || 'ro';
      const existing = document.getElementById('watchPartyRoomModal');
      if (existing) existing.remove();

      this.currentRoomId = roomId;

      const data = await this.fetchRoomData(roomId);
      if (!data) return;

      const modal = document.createElement('div');
      modal.id = 'watchPartyRoomModal';
      modal.className = 'admin-modal-overlay';
      modal.style.zIndex = '10006';
      modal.innerHTML = `
        <div class="admin-modal" style="max-width:500px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
            <h3><i class="fas fa-video" style="color:var(--accent-secondary);"></i> ${lang === 'ro' ? 'Watch Party' : 'Watch Party'}</h3>
            <button class="quiz-modal-close" onclick="WatchPartyModule.leaveRoom()"><i class="fas fa-times"></i></button>
          </div>

          <div style="padding:12px;background:rgba(108,92,231,0.06);border-radius:8px;margin-bottom:12px;text-align:center;">
            <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px;">${lang === 'ro' ? 'Cod cameră' : 'Room Code'}</div>
            <div style="font-size:24px;font-weight:900;letter-spacing:4px;color:var(--accent-secondary);font-family:monospace;">${roomId}</div>
            ${shareUrl ? `<button class="btn btn-secondary" onclick="navigator.clipboard.writeText('${shareUrl}').then(()=>{App.toast('Link copiat!','success')})" style="margin-top:8px;padding:4px 12px;font-size:11px;"><i class="fas fa-copy"></i> ${lang === 'ro' ? 'Copiază link' : 'Copy link'}</button>` : ''}
          </div>

          <div style="margin-bottom:12px;">
            <h4 style="font-size:13px;font-weight:600;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
              <i class="fas fa-user-friends"></i> ${lang === 'ro' ? 'Participanți' : 'Participants'}
              <span class="wp-count" id="wpCount">0</span>
            </h4>
            <div id="wpParticipants" style="display:flex;flex-direction:column;gap:6px;min-height:40px;">
              <div style="text-align:center;color:var(--text-tertiary);font-size:12px;"><i class="fas fa-spinner fa-spin"></i></div>
            </div>
          </div>

          <div style="margin-bottom:12px;">
            <h4 style="font-size:13px;font-weight:600;margin-bottom:8px;">
              <i class="fas fa-comments"></i> ${lang === 'ro' ? 'Chat' : 'Chat'}
            </h4>
            <div id="wpChat" style="max-height:150px;overflow-y:auto;padding:8px;background:rgba(255,255,255,0.02);border-radius:8px;border:1px solid rgba(255,255,255,0.06);margin-bottom:8px;">
              <div style="text-align:center;color:var(--text-tertiary);font-size:12px;padding:12px;">
                ${lang === 'ro' ? 'Niciun mesaj încă. Fii primul care scrie!' : 'No messages yet. Be the first!'}
              </div>
            </div>
            <div style="display:flex;gap:8px;">
              <input type="text" id="wpChatInput" placeholder="${lang === 'ro' ? 'Scrie un mesaj...' : 'Type a message...'}" style="flex:1;">
              <button class="btn btn-primary" id="wpChatSend" style="padding:8px 14px;"><i class="fas fa-paper-plane"></i></button>
            </div>
          </div>

          <button class="btn btn-secondary" id="wpLeaveBtn" style="width:100%;justify-content:center;color:var(--red);">
            <i class="fas fa-sign-out-alt"></i> ${lang === 'ro' ? 'Părăsește camera' : 'Leave Room'}
          </button>
        </div>`;
      document.body.appendChild(modal);

      document.getElementById('wpChatSend').addEventListener('click', () => this.sendMessage());
      document.getElementById('wpChatInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.sendMessage();
      });
      document.getElementById('wpLeaveBtn').addEventListener('click', () => this.leaveRoom());

      this.renderParticipants(data.participants);
      this.renderMessages(data.messages);
      this.startPolling(roomId);
    },

    async fetchRoomData(roomId) {
      try {
        const res = await fetch(`/api/watch-party/${roomId}`);
        return await res.json();
      } catch { return null; }
    },

    renderParticipants(participants) {
      const container = document.getElementById('wpParticipants');
      const count = document.getElementById('wpCount');
      if (!container) return;

      if (!participants || participants.length === 0) {
        container.innerHTML = '<div style="text-align:center;color:var(--text-tertiary);font-size:12px;padding:8px;">No participants</div>';
        return;
      }

      if (count) count.textContent = participants.length;

      container.innerHTML = participants.map(p => `
        <div style="display:flex;align-items:center;gap:10px;padding:6px 10px;border-radius:8px;background:${p.is_host ? 'rgba(108,92,231,0.08)' : 'rgba(255,255,255,0.02)'};">
          <div style="width:32px;height:32px;border-radius:50%;background:${p.profile_color || '#6c5ce7'};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:white;">
            ${(p.profile_name || '?')[0]}
          </div>
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:600;">${p.profile_name || 'User'} ${p.is_host ? '<span style="font-size:10px;color:var(--accent-secondary);font-weight:700;">★ HOST</span>' : ''}</div>
          </div>
          <div style="width:8px;height:8px;border-radius:50%;background:var(--green);"></div>
        </div>
      `).join('');
    },

    renderMessages(messages) {
      const container = document.getElementById('wpChat');
      if (!container) return;

      if (!messages || messages.length === 0) {
        container.innerHTML = '<div style="text-align:center;color:var(--text-tertiary);font-size:12px;padding:12px;">' +
          ((window.appLang || 'ro') === 'ro' ? 'Niciun mesaj încă.' : 'No messages yet.') + '</div>';
        return;
      }

      container.innerHTML = messages.map(m => `
        <div style="display:flex;gap:8px;padding:4px 0;">
          <span style="font-size:12px;font-weight:600;color:var(--accent-secondary);flex-shrink:0;">${m.profile_name || 'User'}:</span>
          <span style="font-size:12px;color:var(--text-secondary);">${m.message}</span>
        </div>
      `).join('');
      container.scrollTop = container.scrollHeight;
    },

    async sendMessage() {
      const input = document.getElementById('wpChatInput');
      const msg = input?.value?.trim();
      if (!msg || !this.currentRoomId || !window.App?.currentProfile) return;

      try {
        await fetch('/api/watch-party/message', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: this.currentRoomId,
            profileId: window.App.currentProfile.id,
            profileName: window.App.currentProfile.name || 'User',
            message: msg
          })
        });
        input.value = '';
      } catch {}
    },

    startPolling(roomId) {
      if (this.pollInterval) clearInterval(this.pollInterval);
      this.pollInterval = setInterval(async () => {
        const data = await this.fetchRoomData(roomId);
        if (data) {
          this.renderParticipants(data.participants);
          this.renderMessages(data.messages);
        }
      }, 3000);
    },

    leaveRoom() {
      if (this.pollInterval) {
        clearInterval(this.pollInterval);
        this.pollInterval = null;
      }
      this.currentRoomId = null;
      document.getElementById('watchPartyRoomModal')?.remove();
      if (window.App?.toast) window.App.toast((window.appLang || 'ro') === 'ro' ? 'Ai părăsit camera' : 'Left the room', 'info');

      // End room if host
      // Note: in production, only host should end
    }
  };

  // Auto-init
  if (document.readyState !== 'loading') {
    WP.init();
  } else {
    document.addEventListener('DOMContentLoaded', () => WP.init());
  }

  window.WatchPartyModule = WP;
})();
