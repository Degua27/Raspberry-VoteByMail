// Configuración de WebSocket y estado
let socket = null;
let lastUpdateData = null;
let reconnectTimer = null;

// Tracking de estados anteriores para detectar cambios y aplicar feedback visual
const previousStates = {}; // { instanceName: 'running' | 'stopped', ... }
let previousServerState = null;

// Elementos del DOM generales
const wsDot = document.getElementById('ws-dot');
const wsStatus = document.getElementById('ws-status');
const lastUpdateEl = document.getElementById('last-update');

// Servidor Ubuntu DOM
const gsNameEl = document.getElementById('gs-name');
const gsIpEl = document.getElementById('gs-ip');
const gsBadge = document.getElementById('gs-badge');
const gsDurationLabel = document.getElementById('gs-duration-label');
const gsDurationEl = document.getElementById('gs-duration');
const gsLastChangeEl = document.getElementById('gs-last-change');
const gsDurationBox = document.getElementById('gs-duration-box');

// Instancias DOM
const instancesGrid = document.getElementById('instances-grid');
const instancesCountEl = document.getElementById('instances-count');

// ==========================================================================
// CONEXIÓN WEBSOCKET
// ==========================================================================
function connectWebSocket() {
  clearTimeout(reconnectTimer);
  
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  
  wsStatus.textContent = 'CONECTANDO...';
  wsDot.className = 'pulse-dot';

  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    console.log('✅ Conectado al servidor de monitoreo.');
    wsStatus.textContent = 'CONECTADO';
    wsDot.className = 'pulse-dot online';
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      lastUpdateData = data;
      updateUI(data);
    } catch (err) {
      console.error('Error al procesar telemetría:', err);
    }
  };

  socket.onclose = () => {
    console.warn('⚠️ Conexión perdida. Reintentando en 5 segundos...');
    wsStatus.textContent = 'DESCONECTADO';
    wsDot.className = 'pulse-dot offline';
    
    reconnectTimer = setTimeout(connectWebSocket, 5000);
  };

  socket.onerror = (err) => {
    console.error('Error de comunicación:', err);
    socket.close();
  };
}

// ==========================================================================
// ACTUALIZACIÓN DE LA INTERFAZ DE USUARIO (UI)
// ==========================================================================
function updateUI(data) {
  // 1. Actualizar hora de última sincronización
  const now = new Date();
  lastUpdateEl.textContent = now.toLocaleTimeString();

  // 2. Actualizar Servidor Ubuntu (Máquina Principal)
  const gs = data.gameServer;
  if (gs) {
    gsNameEl.textContent = gs.name.toUpperCase();
    if (gsIpEl) gsIpEl.textContent = gs.ip;
    gsLastChangeEl.textContent = formatDate(gs.lastChange);
    gsDurationEl.setAttribute('data-last-change', gs.lastChange);
    
    if (gs.state === 'online') {
      gsBadge.className = 'status-badge online';
      gsBadge.textContent = 'APROBADO';
      gsDurationLabel.textContent = 'Tiempo Encendido (Uptime)';
      gsDurationBox.className = 'status-duration-box online';
    } else {
      gsBadge.className = 'status-badge offline';
      gsBadge.textContent = 'DENEGADO';
      gsDurationLabel.textContent = 'Tiempo Apagado (Downtime)';
      gsDurationBox.className = 'status-duration-box offline';
    }

    // Flash visual si el estado del servidor cambió
    if (previousServerState !== null && previousServerState !== gs.state) {
      const serverCard = document.getElementById('card-gameserver');
      if (serverCard) {
        serverCard.classList.remove('state-changed');
        void serverCard.offsetWidth; // forzar reflow para reiniciar animación
        serverCard.classList.add('state-changed');
      }
    }
    previousServerState = gs.state;
  }

  // 3. Actualizar Instancias AMP
  if (data.instances && data.instances.length > 0) {
    instancesCountEl.textContent = `${data.instances.length} activas`;

    // Si había mensaje de "no hay datos", limpiar
    if (instancesGrid.querySelector('.no-data-msg')) {
      instancesGrid.innerHTML = '';
    }

    const currentNames = new Set(data.instances.map(i => i.name));

    // Eliminar tarjetas de instancias que ya no existan
    instancesGrid.querySelectorAll('.instance-card').forEach(card => {
      if (!currentNames.has(card.dataset.instanceName)) {
        card.remove();
      }
    });

    let hasNewCards = false;

    data.instances.forEach(inst => {
      let card = instancesGrid.querySelector(`.instance-card[data-instance-name="${inst.name}"]`);
      const isRunning = inst.state === 'running';
      const statusBadgeClass = isRunning ? 'status-badge online' : 'status-badge offline';
      const statusBadgeText = isRunning ? 'APROBADO' : 'DENEGADO';

      const appLower = inst.app.toLowerCase();
      let appBadgeClass = 'instance-app-badge font-mono';
      if (appLower.includes('minecraft')) appBadgeClass += ' app-minecraft';
      else if (appLower.includes('ark')) appBadgeClass += ' app-ark';
      else if (appLower.includes('valheim')) appBadgeClass += ' app-valheim';
      else if (appLower.includes('satisfactory')) appBadgeClass += ' app-satisfactory';
      else if (appLower.includes('zomboid')) appBadgeClass += ' app-zomboid';
      else if (appLower.includes('palworld')) appBadgeClass += ' app-palworld';

      let playersCountHtml = '';
      if (!isRunning) {
        if (inst.maxPlayers > 0) {
          playersCountHtml = `<span class="font-mono" style="color: var(--text-muted);">0 / ${inst.maxPlayers}</span>`;
        } else {
          playersCountHtml = `<span class="font-mono" style="color: var(--text-muted);">0 conect.</span>`;
        }
      } else {
        if (inst.maxPlayers > 0) {
          playersCountHtml = `<span class="font-mono font-bold" style="color: var(--stamp-approved); font-size: 1.05rem;">${inst.players} / ${inst.maxPlayers}</span>`;
        } else {
          playersCountHtml = `<span class="font-mono font-bold" style="color: var(--stamp-approved); font-size: 1.05rem;">${inst.players} online</span>`;
        }
      }

      if (!card) {
        hasNewCards = true;
        card = document.createElement('div');
        card.className = 'card instance-card';
        card.dataset.instanceName = inst.name;
        card.innerHTML = `
          <div class="card-header">
            <div class="device-info">
              <span class="device-icon pi-icon"><i data-lucide="gamepad-2"></i></span>
              <div>
                <h3 title="${inst.name}" class="font-pixel js-inst-title">${inst.friendlyName.toUpperCase()}</h3>
                <span class="js-inst-badge ${appBadgeClass}">${inst.app}</span>
              </div>
            </div>
            <span class="js-inst-status ${statusBadgeClass}">${statusBadgeText}</span>
          </div>
          
          <div class="card-body">
            <div class="status-duration-box js-inst-box ${isRunning ? 'online' : 'offline'}">
              <div class="instance-status-info">
                <div class="instance-time-counter">
                  <span class="duration-title js-inst-dur-label">${isRunning ? 'TIEMPO ENCENDIDO (UPTIME)' : 'TIEMPO APAGADO (DOWNTIME)'}</span>
                  <strong class="font-mono duration-time js-instance-duration" data-last-change="${inst.lastChange}">0d 00h 00m 00s</strong>
                </div>
                
                <div class="instance-players" title="Jugadores Conectados">
                  <i data-lucide="users"></i>
                  <div>
                    <div class="players-title">JUGADORES</div>
                    <div class="js-inst-players">${playersCountHtml}</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="divider-thin"></div>

            <div class="extra-info">
              <div class="info-row">
                <span>Último cambio de estado:</span>
                <span class="font-mono js-inst-last-change">${formatDate(inst.lastChange)}</span>
              </div>
            </div>
          </div>
        `;
        instancesGrid.appendChild(card);
        // Registrar estado inicial
        previousStates[inst.name] = inst.state;
      } else {
        // Detectar cambio de estado para flash visual
        if (previousStates[inst.name] && previousStates[inst.name] !== inst.state) {
          card.classList.remove('state-changed');
          void card.offsetWidth; // forzar reflow para reiniciar animación
          card.classList.add('state-changed');
        }
        previousStates[inst.name] = inst.state;

        // Actualización in-place sin parpadeos ni recreación del DOM
        card.querySelector('.js-inst-title').textContent = inst.friendlyName.toUpperCase();
        
        const badgeEl = card.querySelector('.js-inst-badge');
        badgeEl.className = `js-inst-badge ${appBadgeClass}`;
        badgeEl.textContent = inst.app;
        
        const statusEl = card.querySelector('.js-inst-status');
        statusEl.className = `js-inst-status ${statusBadgeClass}`;
        statusEl.textContent = statusBadgeText;
        
        const boxEl = card.querySelector('.js-inst-box');
        boxEl.className = `status-duration-box js-inst-box ${isRunning ? 'online' : 'offline'}`;
        
        card.querySelector('.js-inst-dur-label').textContent = isRunning ? 'TIEMPO ENCENDIDO (UPTIME)' : 'TIEMPO APAGADO (DOWNTIME)';
        card.querySelector('.js-instance-duration').setAttribute('data-last-change', inst.lastChange);
        card.querySelector('.js-inst-players').innerHTML = playersCountHtml;
        card.querySelector('.js-inst-last-change').textContent = formatDate(inst.lastChange);
      }
    });

    if (hasNewCards) {
      lucide.createIcons();
    }
  } else {
    instancesCountEl.textContent = '0 activas';
    instancesGrid.innerHTML = `
      <div class="no-data-msg">
        <i data-lucide="info"></i>
        <p class="font-pixel">No se encontraron instancias activas o el servidor está apagado.</p>
      </div>
    `;
    lucide.createIcons();
  }

  // Actualizar los cronómetros de inmediato
  tickCounters();
}

// Formatear fechas legibles
function formatDate(timestamp) {
  if (!timestamp) return '--';
  const d = new Date(timestamp);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

// Formatear duración en ms a texto retro (0d 00h 00m 00s)
function formatDuration(ms) {
  if (ms < 0) ms = 0;
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const d = days;
  const h = hours % 24;
  const m = minutes % 60;
  const s = seconds % 60;

  let str = '';
  if (d > 0) str += `${d}d `;
  if (d > 0 || h > 0) str += `${h.toString().padStart(2, '0')}h `;
  str += `${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
  return str;
}

// ==========================================================================
// CRONÓMETROS EN TIEMPO REAL
// ==========================================================================
function tickCounters() {
  const now = Date.now();

  // 1. Ticking del servidor
  if (gsDurationEl.hasAttribute('data-last-change')) {
    const lastChange = parseInt(gsDurationEl.getAttribute('data-last-change'), 10);
    gsDurationEl.textContent = formatDuration(now - lastChange);
  }

  // 2. Ticking de las instancias de juegos
  const instanceDurationElements = document.querySelectorAll('.js-instance-duration');
  instanceDurationElements.forEach(el => {
    if (el.hasAttribute('data-last-change')) {
      const lastChange = parseInt(el.getAttribute('data-last-change'), 10);
      el.textContent = formatDuration(now - lastChange);
    }
  });
}

// Temporizador cliente
setInterval(tickCounters, 1000);

// ==========================================================================
// INICIALIZACIÓN
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  connectWebSocket();
});
