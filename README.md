# VBM - Monitor de Servidor de Juegos y AMP 🎮

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D%2018.0.0-brightgreen.svg?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Platform Support](https://img.shields.io/badge/platform-Raspberry%20Pi%20%7C%20Linux%20%7C%20Windows-lightgrey.svg?style=flat-square)](https://www.raspberrypi.com/)
[![WebSockets Enabled](https://img.shields.io/badge/websockets-enabled-blue.svg?style=flat-square)](https://developer.mozilla.org/es/docs/Web/API/WebSockets_API)
[![UI Style](https://img.shields.io/badge/style-Retro%20Cyberpunk%20Menu-orange.svg?style=flat-square)](#)

Este repositorio contiene un dashboard web con estética **retro cyberpunk pixelada** diseñado específicamente para correr de forma continua en tu **Raspberry PI** (u otro servidor local). Permite monitorear en tiempo real el estado de tu Servidor físico de Juegos (vía ping) y de todas tus instancias de juegos administradas por el panel **AMP (CubeCoders)**, incluyendo jugadores conectados, uptime/downtime acumulado de la máquina e instancias, y el rendimiento de CPU/RAM.

---

## 🚀 Características Principales

*   📺 **Estética Retro Cyberpunk:** Diseño limpio, angular y pixelado inspirado en pantallas digitales de terminales clásicas.
*   ⚡ **Telemetría en Tiempo Real:** El cliente web recibe datos continuos vía WebSockets. Los contadores de Uptime/Downtime se actualizan segundo a segundo de forma fluida.
*   💾 **Persistencia de Estados:** Un motor de base de datos ligero almacena los estados de conexión históricos en local (`history.json`). Los tiempos de inactividad se calculan con exactitud incluso tras reiniciar el dashboard.
*   🔌 **Monitoreo Eficiente:** Realiza pings no invasivos y consultas optimizadas a la API de AMP de forma automatizada.
*   🔒 **Conexión API Segura:** Utiliza la API nativa de AMP con renovación de sesión y login en segundo plano para evitar fallos de expiración.

---

## 📁 Estructura del Repositorio

```text
├── backend/
│   ├── database.js     # Motor de base de datos ligero (JSON)
│   ├── monitor.js      # Ciclo de polling, pings y cliente de API AMP
│   └── server.js       # Servidor web Express y servidor WebSocket
├── frontend/
│   ├── index.html      # Maquetación del dashboard (Ventanilla de control)
│   ├── style.css       # Estilos CSS de la interfaz pixelada
│   └── app.js          # Conexión WebSocket y lógica del reloj en el cliente
├── scratch/
│   └── test_amp.js     # Script de diagnóstico para la API de AMP
├── config.json         # Configuración de IPs y puertos (Creado al desplegar)
├── .env                # Credenciales del panel AMP (Creado al desplegar)
└── package.json        # Dependencias y scripts de ejecución
```

---

## 📋 Requisitos Previos

Antes de proceder con el despliegue, asegúrate de tener instalado en la Raspberry PI:
*   [Node.js](https://nodejs.org/) (Versión 18 o superior). Verifica con `node -v`.
*   **NPM** (Instalado junto a Node.js). Verifica con `npm -v`.

---

## 🔧 Guía de Despliegue y Configuración

<details>
<summary><b>Paso 1: Clonar e Instalar Dependencias (Clic para expandir)</b></summary>

1. Descarga el código o clona el repositorio en tu Raspberry PI:
   ```bash
   git clone <URL_DEL_REPOSITORIO>
   cd Proyecto_raspberryPI
   ```
2. Instala todos los paquetes requeridos por el backend:
   ```bash
   npm install
   ```
</details>

<details>
<summary><b>Paso 2: Configurar Servidores y Credenciales (Clic para expandir)</b></summary>

Debes configurar la IP de tu servidor y tus contraseñas en los archivos locales:

1. **Configurar el archivo `config.json`:**
   * Crea una copia de `config.example.json` llamada `config.json`.
   * Edita `config.json` y cambia los valores con tus IPs reales:
     ```json
     {
       "port": 3000,
       "pollInterval": 10000,
       "server": {
         "name": "Servidor Ubuntu",
         "ip": "192.168.1.100"  // <-- IP local de tu servidor físico
       },
       "amp": {
         "url": "http://192.168.1.100:8080", // <-- URL de acceso a tu AMP
         "username": "admin",                // <-- Tu usuario de AMP
         "enabled": true
       }
     }
     ```

2. **Configurar el archivo `.env`:**
   * Crea una copia de `.env.example` llamada `.env`.
   * Abre `.env` e ingresa tu contraseña de AMP real:
     ```env
     AMP_PASSWORD=mi_contrasena_de_amp
     ```
</details>

<details>
<summary><b>Paso 3: Validar Conexiones (Clic para expandir)</b></summary>

Puedes realizar un test rápido de conexión contra el panel de AMP ejecutando el script de diagnóstico:

```bash
node scratch/test_amp.js
```

Si todo es correcto, la consola mostrará un listado con tus servidores y jugadores conectados.
</details>

<details>
<summary><b>Paso 4: Arrancar el Dashboard (Clic para expandir)</b></summary>

Para encender el servidor y la interfaz web en la red local:

```bash
npm start
```

El panel estará disponible en el puerto `3000`. Accede desde tu navegador favorito:
`http://[IP_DE_TU_RASPBERRY_PI]:3000`
</details>

---

## ⚙️ Ejecución en Segundo Plano 24/7 (PM2)

Para asegurarte de que el monitor no se apague al cerrar la terminal y que vuelva a encenderse automáticamente en caso de apagón de la Raspberry PI, configura **PM2**:

```bash
# 1. Instalar PM2 de forma global en el sistema
sudo npm install -g pm2

# 2. Iniciar el servicio del monitor
pm2 start backend/server.js --name "vbm-monitor"

# 3. Configurar el inicio automático al encender la Raspberry
pm2 startup
# (Ejecuta la línea de código generada por la consola para terminar la configuración)

# 4. Guardar la configuración actual
pm2 save
```

Para verificar que esté corriendo de fondo, puedes ejecutar `pm2 status` o revisar los logs de consola con `pm2 logs vbm-monitor`.
