const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Cargar config.json
const configPath = path.join(__dirname, '../config.json');
let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
  console.error('❌ Error al leer config.json:', error.message);
  process.exit(1);
}

const ampUrl = config.amp.url.replace(/\/$/, ''); // Quitar barra inclinada al final si existe
const username = config.amp.username;
const password = process.env.AMP_PASSWORD;

console.log('🔍 Iniciando diagnóstico de conexión a AMP...');
console.log(`📍 URL de AMP: ${ampUrl}`);
console.log(`👤 Usuario: ${username}`);
console.log(`🔑 Contraseña: ${password ? '••••••••' : '❌ NO CONFIGURADA EN .env'}`);

if (!password) {
  console.error('❌ Error: Asegúrate de configurar AMP_PASSWORD en tu archivo .env');
  process.exit(1);
}

async function testAMP() {
  try {
    // 1. Probar Login
    console.log('\n--- 1. Intentando iniciar sesión ---');
    const loginUrl = `${ampUrl}/API/Core/Login`;
    const loginBody = {
      username: username,
      password: password,
      token: "",
      rememberMe: true
    };

    console.log(`Enviando POST a ${loginUrl}...`);
    const loginResponse = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(loginBody),
    });

    if (!loginResponse.ok) {
      throw new Error(`HTTP error! Status: ${loginResponse.status}`);
    }

    const loginData = await loginResponse.json();
    console.log('Respuesta de Login recibida:', JSON.stringify(loginData, null, 2));

    // Obtener Session ID de la respuesta
    const sessionId = loginData.SessionID || loginData.sessionID || loginData.sessionId ||
      (loginData.result && (loginData.result.SessionID || loginData.result.sessionID || loginData.result.sessionId)) ||
      (loginData.Result && (loginData.Result.SessionID || loginData.Result.sessionID || loginData.Result.sessionId));

    if (!sessionId) {
      console.error('❌ Error: No se encontró el SessionID en la respuesta. ¿Las credenciales son correctas?');
      return;
    }

    console.log(`✅ Login Exitoso! SessionID: ${sessionId}`);

    // 2. Probar Obtener Instancias / Estado
    console.log('\n--- 2. Probando endpoints de AMP ---');

    const endpointsToTry = [
      { name: 'ADSModule/GetInstances (Módulo ADS v2.8+)', url: `${ampUrl}/API/ADSModule/GetInstances` },
      { name: 'ADS/GetInstances (Controlador ADS)', url: `${ampUrl}/API/ADS/GetInstances` },
      { name: 'Core/GetInstances (Instancias Core)', url: `${ampUrl}/API/Core/GetInstances` },
      { name: 'Core/GetStatus (Estado de Instancia Individual)', url: `${ampUrl}/API/Core/GetStatus` },
      { name: 'Core/GetDashboardData (Datos de Dashboard)', url: `${ampUrl}/API/Core/GetDashboardData` }
    ];

    let instancesData = null;
    let successfulEndpoint = '';

    for (const ep of endpointsToTry) {
      try {
        console.log(`\nProbando endpoint: ${ep.name}...`);
        const response = await fetch(ep.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            SESSIONID: sessionId
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data && !data.error && !data.Title) {
            instancesData = data;
            successfulEndpoint = ep.name;
            console.log(`✅ Éxito con el endpoint: ${ep.name}`);
            console.log('Respuesta:', JSON.stringify(data, null, 2));
            break;
          } else {
            console.log(`⚠️ El endpoint ${ep.name} devolvió un error:`, JSON.stringify(data));
          }
        } else {
          console.log(`⚠️ El endpoint ${ep.name} falló con código HTTP: ${response.status}`);
        }
      } catch (err) {
        console.log(`⚠️ Error al conectar al endpoint ${ep.name}:`, err.message);
      }
    }

    if (!instancesData) {
      console.error('\n❌ No se pudo obtener información con ninguno de los endpoints.');
      console.log('💡 TIP: Si tienes varias instancias, asegúrate de que la URL en config.json apunta al puerto del controlador ADS (ej. 8080) y no al puerto de una instancia de juego específica.');
      return;
    }

    console.log(`\n--- 3. Resultado final con ${successfulEndpoint} ---`);
    const raw = instancesData.Result !== undefined ? instancesData.Result :
      (instancesData.result !== undefined ? instancesData.result : instancesData);

    const list = Array.isArray(raw) ? raw : (typeof raw === 'object' ? Object.values(raw) : []);
    let instances = [];

    for (const item of list) {
      if (!item || typeof item !== 'object') continue;

      const subInstances = item.Instances || item.instances || item.AvailableInstances || item.availableInstances;

      if (subInstances && typeof subInstances === 'object') {
        const subList = Array.isArray(subInstances) ? subInstances : Object.values(subInstances);
        for (const inst of subList) {
          if (inst && typeof inst === 'object') {
            instances.push(inst);
          }
        }
      } else if (item.InstanceName || item.InstanceId || item.InstanceID || item.name || item.ApplicationName || item.module || item.Module) {
        instances.push(item);
      } else if (item.State !== undefined || item.Metrics !== undefined || item.Running !== undefined) {
        instances.push(item);
      }
    }

    if (instances.length === 0 && Array.isArray(raw)) {
      instances = raw;
    }

    console.log(`\n📋 Resumen de Instancias Encontradas (${instances.length}):`);
    instances.forEach((inst, index) => {
      console.log(`\n[${index + 1}] Nombre: ${inst.InstanceName || inst.name || 'Desconocido'}`);
      console.log(`    Friendly Name: ${inst.FriendlyName || 'N/A'}`);
      console.log(`    App: ${inst.ApplicationName || inst.module || 'N/A'}`);
      console.log(`    Estado: ${inst.Running ? '🟢 EN EJECUCIÓN' : '🔴 DETENIDO'}`);
      console.log(`    Jugadores: ${inst.ActiveUsers !== undefined ? inst.ActiveUsers : '?'}/${inst.MaxUsers !== undefined ? inst.MaxUsers : '?'}`);
      if (inst.Uptime) {
        console.log(`    Uptime: ${Math.floor(inst.Uptime / 3600)}h ${Math.floor((inst.Uptime % 3600) / 60)}m`);
      }
    });

  } catch (error) {
    console.error('❌ Error crítico durante el diagnóstico:', error.message);
  }
}

testAMP();
