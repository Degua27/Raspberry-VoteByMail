const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, '../data');
const DB_FILE = path.join(DB_DIR, 'history.json');

class Database {
  constructor() {
    this.data = {
      states: {
        gameServer: { state: 'offline', lastChange: Date.now() },
        instances: {}
      }
    };
    this.init();
  }

  // Inicializar directorio y archivo si no existen
  init() {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    if (fs.existsSync(DB_FILE)) {
      try {
        const fileContent = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(fileContent);
        // Mezclar con estructura por defecto por si faltan claves
        this.data = {
          states: {
            ...this.data.states,
            ...parsed.states
          }
        };
      } catch (error) {
        console.error('⚠️ Error al leer history.json, re-creando archivo:', error.message);
        this.save();
      }
    } else {
      this.save();
    }
  }

  // Guardar en el archivo JSON
  save() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (error) {
      console.error('❌ Error al escribir history.json:', error.message);
    }
  }

  // Obtener estado de un dispositivo o instancia
  getState(key, isInstance = false) {
    if (isInstance) {
      return this.data.states.instances[key] || null;
    }
    return this.data.states[key] || null;
  }

  // Actualizar estado si hay un cambio y registrar el timestamp de transición
  updateState(key, newState, isInstance = false) {
    let changed = false;
    const now = Date.now();

    if (isInstance) {
      const current = this.data.states.instances[key];
      if (!current) {
        // Nueva instancia detectada
        this.data.states.instances[key] = {
          state: newState,
          lastChange: now
        };
        changed = true;
      } else if (current.state !== newState) {
        current.state = newState;
        current.lastChange = now;
        changed = true;
      }
    } else {
      const current = this.data.states[key];
      if (!current) {
        this.data.states[key] = {
          state: newState,
          lastChange: now
        };
        changed = true;
      } else if (current.state !== newState) {
        current.state = newState;
        current.lastChange = now;
        changed = true;
      }
    }

    if (changed) {
      this.save();
    }
    return changed;
  }

  // Obtener todos los estados registrados
  getAllStates() {
    return this.data.states;
  }
}

module.exports = new Database();
