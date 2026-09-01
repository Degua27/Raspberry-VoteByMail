# VBM - Monitor de Servidor de Juegos y AMP 🎮

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D%2018.0.0-brightgreen.svg?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Platform Support](https://img.shields.io/badge/platform-Raspberry%20Pi%20%7C%20Linux%20%7C%20Windows-lightgrey.svg?style=flat-square)](https://www.raspberrypi.com/)
[![WebSockets Enabled](https://img.shields.io/badge/websockets-enabled-blue.svg?style=flat-square)](https://developer.mozilla.org/es/docs/Web/API/WebSockets_API)
[![UI Style](https://img.shields.io/badge/style-Papers%20Please%20Documents-yellow.svg?style=flat-square)](#)

Este repositorio contiene un dashboard web con estética **Papers, Please Documents** (papel beige y sellos inclinados, sin CRT) diseñado específicamente para correr de forma continua en tu **Raspberry PI** (u otro servidor local). Permite monitorear en tiempo real el estado de tu Servidor físico de Juegos (vía ping) y de todas tus instancias de juegos administradas por el panel **AMP (CubeCoders)**, incluyendo jugadores conectados, uptime/downtime acumulado de la máquina e instancias, y el rendimiento de CPU/RAM.

---



## 🚀 Características Principales

*   📄 **Estilo de Pasaportes y Sellos:** Diseño pixelado con fondos color papel antiguo gastado beige (`#d5cdb7`) y sellos de goma (`status-badge`) con bordes dobles inclinados para los estados.
*   ⚡ **Telemetría en Tiempo Real:** El cliente web recibe datos continuos vía WebSockets. Los contadores de Uptime/Downtime se actualizan segundo a segundo de forma fluida.
*   💾 **Persistencia de Estados:** Un motor de base de datos ligero almacena los estados de conexión históricos en local (`history.json`). Los tiempos de inactividad se calculan con exactitud incluso tras reiniciar el dashboard.
*   🔌 **Monitoreo Eficiente:** Realiza pings no invasivos y consultas optimizadas a la API de AMP de forma automatizada.
*   🔒 **Conexión API Segura:** Utiliza la API nativa de AMP con renovación de sesión y login en segundo plano para evitar fallos de expiración.

---

## 📁 Estructura del Repositorio

```text
├── backend/
│   ├── database.js     # Motor de base de datos ligero (JSON)
│   ├── monitor.js      # Polling, pings y cliente de API AMP
│   └── server.js       # Servidor web Express y servidor WebSocket
├── frontend/
│   ├── index.html      # Maquetación del dashboard (Ventanilla de control)
│   ├── style.css       # Estilos CSS de la interfaz pixelada de papel beige
│   └── app.js          # Conexión WebSocket y lógica del reloj en el cliente
├── scratch/
│   └── test_amp.js     # Script de diagnóstico para la API de AMP
├── config.json         # Configuración de IPs y puertos (Creado al desplegar)
├── .env                # Credenciales del panel AMP (Creado al desplegar)
└── package.json        # Dependencias y scripts de ejecución
```

---
## ⚡ Guía de Instalación Rápida por Terminal (SSH)

Si estás conectado a la terminal de tu Raspberry PI (o vía SSH), puedes copiar y ejecutar este bloque de comandos para tener todo configurado y corriendo:

```bash
# 1. Asegúrate de tener Git, Node.js y NPM instalados en la Raspberry PI
sudo apt update
sudo apt install -y git nodejs npm

# 2. Clona el repositorio y entra en la carpeta del proyecto
git clone https://github.com/Degua27/Raspberry-VoteByMail.git
cd Raspberry-VoteByMail

# 3. Instala las dependencias del proyecto
npm install

# 4. Copia los archivos de configuración de ejemplo
cp config.example.json config.json
cp .env.example .env

# 5. Configura tu IP, puerto y credenciales de AMP en los archivos
# (Usa 'Ctrl+O' para guardar y 'Ctrl+X' para salir de nano)
nano config.json
nano .env

# 6. Inicia el servidor
npm start
```

---

## 🔧 Guía Detallada de Configuración

<details>
<summary><b>Cómo editar config.json y .env (Clic para expandir)</b></summary>

> [!NOTE]
> Los archivos `config.json` y `.env` están ignorados por Git (`.gitignore`). Esto garantiza que cuando hagas `git pull` para actualizar el dashboard en el futuro, **tus IPs, puertos y contraseñas nunca se sobrescribirán ni generarán conflictos de Git**.

### 1. Editar `config.json`
Ejecuta `nano config.json` en la terminal. Debe quedar estructurado de la siguiente forma con tus datos locales reales:
```json
{
  "port": 3000,
  "pollInterval": 2000,
  "server": {
    "name": "Servidor Ubuntu",
    "ip": "192.168.1.100"  // <-- Pon la IP local de tu servidor de juegos
  },
  "amp": {
    "url": "http://192.168.1.100:8080", // <-- URL de acceso a tu panel AMP
    "username": "admin",                // <-- Tu nombre de usuario en AMP
    "enabled": true
  }
}
```

### 2. Editar `.env`
Ejecuta `nano .env` en la terminal. Reemplaza el valor del password por tu contraseña real:
```env
AMP_PASSWORD=mi_contrasena_de_amp_real
```
</details>

<details>
<summary><b>Cómo realizar un test de diagnóstico de AMP (Clic para expandir)</b></summary>

Puedes realizar un test rápido de conexión contra el panel de AMP ejecutando el script de diagnóstico:

```bash
node scratch/test_amp.js
```

Si todo es correcto, la consola mostrará un listado con tus servidores y jugadores conectados.
</details>

---

## ⚙️ Ejecución en Segundo Plano 24/7 (PM2)

Para asegurarte de que el monitor no se apague al cerrar la terminal SSH y que vuelva a encenderse automáticamente en caso de apagón de la Raspberry PI, configura **PM2**:

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
