const path = require('path');
// Cargar variables de entorno antes de importar otros módulos
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const Monitor = require('./monitor');

// Cargar config.json
const configPath = path.join(__dirname, '../config.json');
let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
  console.error('❌ Error al cargar config.json:', error.message);
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '../frontend')));

let latestState = null;

// Ruta API REST para consultar estado bajo demanda
app.get('/api/status', (req, res) => {
  if (latestState) {
    res.json(latestState);
  } else {
    res.status(503).json({ error: 'Sistema iniciando. Aún no hay datos disponibles.' });
  }
});

// Función para retransmitir datos a todos los clientes WebSocket conectados
function broadcast(data) {
  const message = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Escuchar conexiones WebSocket
wss.on('connection', (ws) => {
  console.log('🔌 Nuevo cliente conectado al WebSocket.');

  // Enviar el estado más reciente de inmediato para evitar pantallas en blanco
  if (latestState) {
    ws.send(JSON.stringify(latestState));
  }

  ws.on('close', () => {
    console.log('🔌 Cliente desconectado.');
  });

  ws.on('error', (err) => {
    console.error('⚠️ Error en WebSocket:', err.message);
  });
});

// Inicializar e iniciar el ciclo de monitoreo
const monitor = new Monitor(config, (state) => {
  latestState = state;
  broadcast(state);
});

monitor.start();

// Manejo de apagado protegido — no se puede apagar si hay clientes web conectados
let forceShutdownTimer = null;
let shutdownPending = false;

function getConnectedClients() {
  let count = 0;
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) count++;
  });
  return count;
}

function attemptShutdown(signal) {
  const connectedClients = getConnectedClients();

  if (connectedClients > 0 && !shutdownPending) {
    // Primer intento: bloquear y avisar
    shutdownPending = true;
    console.log('');
    console.log(`⚠️  ¡APAGADO BLOQUEADO! ${connectedClients} cliente(s) web conectado(s).`);
    console.log(`    Desconéctalos primero, o pulsa Ctrl+C de nuevo en 5s para forzar.`);
    console.log('');

    // Resetear el flag después de 5 segundos si no se vuelve a pulsar
    forceShutdownTimer = setTimeout(() => {
      shutdownPending = false;
      console.log('ℹ️  Ventana de apagado forzado expirada. El servicio sigue activo.');
    }, 5000);
    return;
  }

  // Si no hay clientes, o es el segundo intento (forzar)
  if (forceShutdownTimer) clearTimeout(forceShutdownTimer);

  if (shutdownPending && connectedClients > 0) {
    console.log(`\n🔴 Apagado FORZADO con ${connectedClients} cliente(s) aún conectado(s).`);
  } else {
    console.log('\nApagando servicio (no hay clientes conectados)...');
  }

  monitor.stop();
  server.close(() => {
    console.log('🛑 Servidor detenido.');
    process.exit(0);
  });

  // Forzar salida si el servidor no cierra en 3 segundos
  setTimeout(() => {
    console.log('⏱️  Forzando cierre...');
    process.exit(1);
  }, 3000);
}

process.on('SIGINT', () => attemptShutdown('SIGINT'));
process.on('SIGTERM', () => attemptShutdown('SIGTERM'));

const PORT = config.port || 3000;
server.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`🚀 Servidor de Monitoreo listo en puerto ${PORT}`);
  console.log(`🔗 Accede localmente en: http://localhost:${PORT}`);
  console.log(`==================================================`);
});
