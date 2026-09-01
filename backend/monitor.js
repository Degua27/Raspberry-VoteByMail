const exec = require('child_process').exec;
const path = require('path');
const db = require('./database');

// Función de ping multiplataforma (admite Windows y Linux/Raspberry Pi)
function ping(ip) {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const cmd = isWindows ? `ping -n 1 -w 1000 ${ip}` : `ping -c 1 -W 1 ${ip}`;
    exec(cmd, (err, stdout, stderr) => {
      resolve(!err);
    });
  });
}

// Cliente API de AMP
class AMPClient {
  constructor(url, username, password) {
    this.url = url.replace(/\/$/, '');
    this.username = username;
    this.password = password;
    this.sessionId = null;
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
      `${this.url}/API/ADS/GetInstances`,
      `${this.url}/API/Core/GetInstances`
    ];

    for (const endpoint of endpoints) {
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
            return this.getInstances(); // Reintentar login y llamada
          }

          if (data && !data.error) {
            return Array.isArray(data) ? data : (data.result || data.instances || data.Instances || []);
          }
        }
      } catch (error) {
        console.warn(`⚠️ Endpoint ${endpoint} falló o no está disponible:`, error.message);
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
    const intervalTime = this.config.pollInterval || 10000;
    console.log(`🚀 Iniciando ciclo de monitoreo cada ${intervalTime / 1000}s...`);

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

    // 1. Monitorear Servidor de Juegos (Ping)
    let gsOnline = false;
    if (this.config.server && this.config.server.ip) {
      gsOnline = await ping(this.config.server.ip);
      db.updateState('gameServer', gsOnline ? 'online' : 'offline');
    }

    // 2. Monitorear Instancias AMP (si el servidor está online y AMP habilitado)
    let ampInstances = [];
    const ampEnabled = this.config.amp && this.config.amp.enabled !== false;

    if (ampEnabled && this.ampClient) {
      if (gsOnline) {
        const rawInstances = await this.ampClient.getInstances();
        if (rawInstances) {
          ampInstances = rawInstances.map(inst => {
            const name = inst.InstanceName || inst.name || 'Desconocido';
            const isRunning = inst.Running || inst.running || false;
            const state = isRunning ? 'running' : 'stopped';

            // Actualizar estado en DB
            db.updateState(name, state, true);

            const dbState = db.getState(name, true);
            const timeSinceChange = dbState ? (now - dbState.lastChange) : 0;

            return {
              name: name,
              friendlyName: inst.FriendlyName || name,
              app: inst.ApplicationName || inst.module || 'Desconocido',
              state: state,
              lastChange: dbState ? dbState.lastChange : now,
              duration: timeSinceChange, // cuánto lleva encendido o apagado
              players: inst.ActiveUsers !== undefined ? inst.ActiveUsers : 0,
              maxPlayers: inst.MaxUsers !== undefined ? inst.MaxUsers : 0,
              cpu: inst.Metrics && inst.Metrics['Percent CPU'] ? Math.round(inst.Metrics['Percent CPU'].Value) : (inst.PercentCPU || 0),
              ram: inst.Metrics && inst.Metrics['Percent RAM'] ? Math.round(inst.Metrics['Percent RAM'].Value) : (inst.PercentMemory || 0)
            };
          });
        } else {
          console.warn('⚠️ El servidor responde a ping pero falló la API de AMP.');
        }
      } else {
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
            lastChange: dbState.lastChange,
            duration: now - dbState.lastChange,
            players: 0,
            maxPlayers: 0,
            cpu: 0,
            ram: 0
          };
        });
      }
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
