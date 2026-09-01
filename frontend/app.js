// Configuración de WebSocket y estado
let socket = null;
let lastUpdateData = null;
let reconnectTimer = null;

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
    gsIpEl.textContent = gs.ip;
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
  }

  // 3. Actualizar Instancias AMP
  instancesGrid.innerHTML = '';
  
  if (data.instances && data.instances.length > 0) {
    instancesCountEl.textContent = `${data.instances.length} activas`;
    
    data.instances.forEach(inst => {
      const card = document.createElement('div');
      card.className = 'card instance-card';
      
      const isRunning = inst.state === 'running';
      const statusBadgeClass = isRunning ? 'status-badge online' : 'status-badge offline';
      const statusBadgeText = isRunning ? 'APROBADO' : 'DENEGADO';
      
      // Intentar obtener clase de estilo según tipo de juego
      const appLower = inst.app.toLowerCase();
      let appBadgeClass = 'instance-app-badge font-mono';
      if (appLower.includes('minecraft')) appBadgeClass += ' app-minecraft';
      else if (appLower.includes('ark')) appBadgeClass += ' app-ark';
      else if (appLower.includes('valheim')) appBadgeClass += ' app-valheim';
      else if (appLower.includes('satisfactory')) appBadgeClass += ' app-satisfactory';
      else if (appLower.includes('zomboid')) appBadgeClass += ' app-zomboid';
      else if (appLower.includes('palworld')) appBadgeClass += ' app-palworld';

      card.innerHTML = `
        <div class="card-header">
          <div class="device-info">
            <span class="device-icon pi-icon"><i data-lucide="gamepad-2"></i></span>
            <div>
              <h3 title="${inst.name}" class="font-pixel">${inst.friendlyName.toUpperCase()}</h3>
              <span class="${appBadgeClass}">${inst.app}</span>
            </div>
          </div>
          <span class="${statusBadgeClass}">${statusBadgeText}</span>
        </div>
        
        <div class="card-body">
          <div class="instance-status-info">
            <div class="instance-time-counter">
              <span>${isRunning ? 'Uptime' : 'Downtime'}</span>
              <strong class="font-mono js-instance-duration" data-last-change="${inst.lastChange}">0d 00h 00m 00s</strong>
            </div>
            
            <div class="instance-players" title="Jugadores Conectados">
              <i data-lucide="users"></i>
              <span class="font-mono">${inst.players} / ${inst.maxPlayers}</span>
            </div>
          </div>
          
          <div class="divider-thin"></div>
          
          <div class="metrics-grid">
            <div class="metric-item">
              <div class="metric-header">
                <span>CPU Instancia</span>
                <span>${inst.cpu}%</span>
              </div>
              <div class="progress-bar-container">
                <div class="progress-bar" style="width: ${inst.cpu}%"></div>
              </div>
            </div>

            <div class="metric-item">
              <div class="metric-header">
                <span>RAM Instancia</span>
                <span>${inst.ram}%</span>
              </div>
              <div class="progress-bar-container">
                <div class="progress-bar" style="width: ${inst.ram}%"></div>
              </div>
            </div>
          </div>
        </div>
      `;
      
      instancesGrid.appendChild(card);
    });
  } else {
    instancesCountEl.textContent = '0 activas';
    instancesGrid.innerHTML = `
      <div class="no-data-msg">
        <i data-lucide="info"></i>
        <p class="font-pixel">No se encontraron instancias activas o el servidor está apagado.</p>
      </div>
    `;
  }

  // Volver a procesar iconos
  lucide.createIcons();
  
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
