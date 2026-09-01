const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const exec = require('child_process').exec;
const db = require('./database');

// Función de ping multiplataforma (admite Windows y Linux/Raspberry Pi)
function ping(ip) {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const cmd = isWindows ? `ping -n 1 -w 500 ${ip}` : `ping -c 1 -W 1 ${ip}`;
    exec(cmd, (err, stdout, stderr) => {
      resolve(!err);
    });
  });
}

// Función para extraer valores numéricos de métricas de AMP (que pueden venir como objetos { Value: X })
function parseMetricValue(val) {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? 0 : parsed;
  }
  if (typeof val === 'object') {
    if (val.Value !== undefined) return parseMetricValue(val.Value);
    if (val.RawValue !== undefined) return parseMetricValue(val.RawValue);
    if (val.Current !== undefined) return parseMetricValue(val.Current);
  }
  return 0;
}

// Extraer lista de instancias de diferentes formatos de respuesta JSON de AMP
function extractInstances(data) {
  if (!data) return [];

  const raw = (data.Result !== undefined) ? data.Result :
    ((data.result !== undefined) ? data.result :
      (data.Instances || data.instances || data.data || data.Data || data));

  const list = Array.isArray(raw) ? raw : (typeof raw === 'object' ? Object.values(raw) : []);
  const flattened = [];

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;

    const subInstances = item.Instances || item.instances || item.AvailableInstances || item.availableInstances;

    if (subInstances && typeof subInstances === 'object') {
      const subList = Array.isArray(subInstances) ? subInstances : Object.values(subInstances);
      for (const inst of subList) {
        if (inst && typeof inst === 'object') {
          flattened.push(inst);
        }
      }
    } else if (item.InstanceName || item.InstanceId || item.InstanceID || item.name || item.ApplicationName || item.module || item.Module) {
      flattened.push(item);
    } else if (item.State !== undefined || item.Metrics !== undefined || item.Running !== undefined) {
      flattened.push(item);
    }
  }

  if (flattened.length > 0) {
    return flattened;
  }

  return Array.isArray(raw) ? raw : [];
}

// Cliente API de AMP
class AMPClient {
  constructor(url, username, password) {
    this.url = url.replace(/\/$/, '');
    this.username = username;
    this.password = password;
    this.sessionId = null;
    this.workingEndpoint = `${this.url}/API/ADSModule/GetInstances`;
  }

  async login() {
    try {
      if (!this.password) {
        throw new Error('La variable de entorno AMP_PASSWORD no está configurada');
      }

      console.log(`🔑 Intentando login en AMP API: ${this.url}/API/Core/Login`);
      const response = await fetch(`${this.url}/API/Core/Login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          username: this.username,
          password: this.password,
          token: "",
          rememberMe: true
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}`);
      }

      const data = await response.json();
      const sessionId = data.SessionID || data.sessionID || data.sessionId ||
        (data.result && (data.result.SessionID || data.result.sessionID || data.result.sessionId)) ||
        (data.Result && (data.Result.SessionID || data.Result.sessionID || data.Result.sessionId));

      if (!sessionId) {
        throw new Error(`No se recibió SessionID en la respuesta: ${JSON.stringify(data)}`);
      }

      this.sessionId = sessionId;
      console.log('✅ Login exitoso en AMP. Nueva sesión iniciada.');
      return this.sessionId;
    } catch (error) {
      console.error('❌ Error de login en AMP:', error.message);
      this.sessionId = null;
      return null;
    }
  }

  async getInstances() {
    if (!this.sessionId) {
      const loggedIn = await this.login();
      if (!loggedIn) return null;
    }

    const endpoints = [
      this.workingEndpoint,
      `${this.url}/API/ADSModule/GetInstances`,
      `${this.url}/API/ADS/GetInstances`,
      `${this.url}/API/Core/GetInstances`
    ];

    const uniqueEndpoints = [...new Set(endpoints)];

    for (const endpoint of uniqueEndpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ SESSIONID: this.sessionId })
        });

        if (response.ok) {
          const data = await response.json();

          // Si la sesión expiró
          if (data && data.error && (data.error.includes('Session') || data.error.includes('auth') || data.error.includes('Auth'))) {
            console.log('⚠️ Sesión de AMP expirada. Reintentando login...');
            this.sessionId = null;
            return this.getInstances();
          }

          if (data && !data.error && !data.Title) {
            const list = extractInstances(data);
            this.workingEndpoint = endpoint;
            return list;
          }
        }
      } catch (error) {
        // Fallback silencioso al siguiente endpoint
      }
    }
    return null;
  }
}

class Monitor {
  constructor(config, onUpdateCallback) {
    this.config = config;
    this.onUpdate = onUpdateCallback;
    this.ampClient = (config.amp && config.amp.enabled !== false)
      ? new AMPClient(config.amp.url, config.amp.username, process.env.AMP_PASSWORD)
      : null;
    this.intervalId = null;
    this.currentState = null;
  }

  start() {
    const intervalTime = this.config.pollInterval || 2000;
    console.log(`🚀 Iniciando ciclo de monitoreo ultra rápido cada ${intervalTime / 1000}s...`);

    // Ejecutar monitoreo de inmediato y luego establecer el intervalo
    this.poll();
    this.intervalId = setInterval(() => this.poll(), intervalTime);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('🛑 Monitoreo detenido.');
    }
  }

  async poll() {
    const now = Date.now();
    const ampEnabled = this.config.amp && this.config.amp.enabled !== false;

    // Ejecución en paralelo de Ping y consulta a AMP para latencia mínima
    const [pingOnline, rawInstances] = await Promise.all([
      (this.config.server && this.config.server.ip) ? ping(this.config.server.ip) : Promise.resolve(true),
      (ampEnabled && this.ampClient) ? this.ampClient.getInstances() : Promise.resolve(null)
    ]);

    // Si AMP responde, el servidor está 100% online
    const gsOnline = (rawInstances && rawInstances.length > 0) ? true : pingOnline;
    db.updateState('gameServer', gsOnline ? 'online' : 'offline');

    let ampInstances = [];

    if (ampEnabled && this.ampClient && gsOnline && rawInstances && Array.isArray(rawInstances)) {
      ampInstances = rawInstances.map(inst => {
            const name = inst.InstanceName || inst.name || inst.InstanceId || inst.InstanceID || 'Desconocido';
            const app = inst.ModuleDisplayName || inst.ApplicationName || inst.module || inst.Module || inst.AppType || 'Juego';
            const friendlyName = inst.FriendlyName || inst.friendlyName || name;

            // Omitir el controlador maestro ADS (solo mostrar instancias de juegos)
            const appUpper = app.toUpperCase();
            const nameUpper = name.toUpperCase();
            const friendlyUpper = friendlyName.toUpperCase();
            if (appUpper === 'ADS' || nameUpper.startsWith('ADS') || friendlyUpper.startsWith('ADS')) {
              return null;
            }

            // Detección del estado real del servidor de juegos en AMP:
            // inst.AppState = estado de la aplicación del juego (0 = Detenido, 20/30 = En Ejecución)
            let isRunning = false;
            if (inst.AppState !== undefined) {
              const appStateNum = Number(inst.AppState);
              if (!isNaN(appStateNum)) {
                isRunning = (appStateNum === 20 || appStateNum === 30);
              } else {
                const appStateStr = String(inst.AppState).toLowerCase();
                isRunning = (appStateStr === 'running' || appStateStr === 'ready');
              }
            } else if (typeof inst.Running === 'boolean') {
              isRunning = inst.Running;
            } else if (typeof inst.running === 'boolean') {
              isRunning = inst.running;
            }

            const state = isRunning ? 'running' : 'stopped';

            // Actualizar estado en DB
            db.updateState(name, state, true);

            const dbState = db.getState(name, true);
            const timeSinceChange = dbState ? (now - dbState.lastChange) : 0;

            const activePlayers = parseMetricValue(
              inst.ActiveUsers !== undefined ? inst.ActiveUsers :
              (inst.ActivePlayers !== undefined ? inst.ActivePlayers :
              (inst.Metrics && (inst.Metrics['Active Users'] || inst.Metrics['ActivePlayers'] || inst.Metrics['Players'] || inst.Metrics['User Count'])))
            );

            let maxPlayers = parseMetricValue(
              inst.MaxUsers !== undefined ? inst.MaxUsers :
              (inst.MaxPlayers !== undefined ? inst.MaxPlayers :
              (inst.Metrics && (inst.Metrics['Max Users'] || inst.Metrics['MaxPlayers'] || inst.Metrics['User Limit'] || inst.Metrics['Max Players'])))
            );

            // Si maxPlayers es 0, buscar en claves de configuración de la instancia (ej. Minecraft.Server.MaxPlayers)
            if (maxPlayers === 0) {
              for (const key of Object.keys(inst)) {
                const kLower = key.toLowerCase();
                if (kLower.includes('maxplayer') || kLower.includes('maxuser') || kLower.includes('userlimit') || kLower.includes('max_players')) {
                  const parsed = parseMetricValue(inst[key]);
                  if (parsed > 0) {
                    maxPlayers = parsed;
                    break;
                  }
                }
              }
            }

            return {
              name: name,
              friendlyName: friendlyName,
              app: app,
              state: state,
              lastChange: dbState ? dbState.lastChange : now,
              duration: timeSinceChange, // cuánto lleva encendido o apagado
              players: activePlayers,
              maxPlayers: maxPlayers
            };
          }).filter(Boolean);

          console.log(`📊 Procesadas ${ampInstances.length} instancias de juegos.`);
        } else if (ampEnabled && this.ampClient && !gsOnline) {
          console.warn('⚠️ El servidor físico no responde a ping, marcando instancias como offline.');
          // Servidor físico está caído, todas las instancias conocidas se consideran detenidas
          const allDbStates = db.getAllStates();
          const storedInstances = allDbStates.instances || {};

          ampInstances = Object.keys(storedInstances).map(name => {
            db.updateState(name, 'stopped', true);
            const dbState = db.getState(name, true);
            return {
              name: name,
              friendlyName: name,
              app: 'Desconocido (Servidor Caído)',
              state: 'stopped',
              lastChange: dbState ? dbState.lastChange : now,
              duration: dbState ? (now - dbState.lastChange) : 0,
              players: 0,
              maxPlayers: 0
            };
          });
        }

    // 3. Construir Estado Consolidado
    const dbGS = db.getState('gameServer');

    this.currentState = {
      timestamp: now,
      gameServer: {
        name: this.config.server.name,
        ip: this.config.server.ip,
        state: dbGS ? dbGS.state : 'offline',
        lastChange: dbGS ? dbGS.lastChange : now,
        duration: dbGS ? (now - dbGS.lastChange) : 0
      },
      instances: ampInstances
    };

    // Emitir estado actualizado
    if (this.onUpdate) {
      this.onUpdate(this.currentState);
    }
  }

  getCurrentState() {
    return this.currentState;
  }
}

module.exports = Monitor;
