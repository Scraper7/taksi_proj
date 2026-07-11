/* eslint-disable no-console */
const http = require('http');
const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');
const { rootDir, stringifyError } = require('./common');

const PORT = Number(process.env.EMULATOR_PANEL_PORT || 3099);
const HOST = process.env.EMULATOR_PANEL_HOST || '127.0.0.1';
const MAX_LOG_LINES = 600;
const AUTO_START = false;

let simulatorProcess = null;
let startedAt = null;
let lastExit = null;
let logs = [];

const choicesFile = path.join(rootDir, 'data', 'passenger-choices.json');

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString('utf8');
      if (body.length > 1024 * 64) {
        req.destroy();
        reject(new Error('request body is too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function readChoices() {
  try {
    const raw = fs.readFileSync(choicesFile, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function savePassengerChoice(orderId, userId) {
  if (!orderId || !userId) return { ok: false, message: 'orderId and userId are required' };
  fs.mkdirSync(path.dirname(choicesFile), { recursive: true });
  const choices = readChoices();
  choices[String(orderId)] = { userId: String(userId), at: new Date().toISOString() };
  fs.writeFileSync(choicesFile, JSON.stringify(choices, null, 2), 'utf8');
  addLog(`Passenger selected driver: order=${orderId}, user=${userId}`);
  return { ok: true };
}

function addLog(line) {
  const text = String(line || '').replace(/\r/g, '').trimEnd();
  if (!text) return;
  text.split('\n').forEach(item => {
    logs.push(`[${new Date().toLocaleTimeString()}] ${item}`);
  });
  if (logs.length > MAX_LOG_LINES) {
    logs = logs.slice(logs.length - MAX_LOG_LINES);
  }
}

function isRunning() {
  return Boolean(simulatorProcess && simulatorProcess.exitCode === null && !simulatorProcess.killed);
}

function startSimulator() {
  if (isRunning()) {
    return { ok: true, alreadyRunning: true, pid: simulatorProcess.pid };
  }

  lastExit = null;
  startedAt = new Date().toISOString();
  addLog('Starting simulator...');

  simulatorProcess = spawn(process.execPath, ['src/simulator.js'], {
    cwd: rootDir,
    env: { ...process.env, FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  addLog(`Simulator started, pid=${simulatorProcess.pid}`);

  simulatorProcess.stdout.on('data', chunk => addLog(chunk.toString('utf8')));
  simulatorProcess.stderr.on('data', chunk => addLog(chunk.toString('utf8')));
  simulatorProcess.on('error', error => addLog(`Simulator process error: ${stringifyError(error)}`));
  simulatorProcess.on('exit', (code, signal) => {
    lastExit = { code, signal, at: new Date().toISOString() };
    addLog(`Simulator stopped, code=${code}, signal=${signal || '-'}`);
    simulatorProcess = null;
  });

  return { ok: true, started: true, pid: simulatorProcess.pid };
}

function stopSimulator() {
  if (!isRunning()) {
    return { ok: true, alreadyStopped: true };
  }

  const pid = simulatorProcess.pid;
  addLog(`Stopping simulator, pid=${pid}...`);
  simulatorProcess.kill('SIGINT');

  setTimeout(() => {
    if (simulatorProcess && simulatorProcess.pid === pid && isRunning()) {
      addLog(`Force killing simulator, pid=${pid}...`);
      simulatorProcess.kill('SIGTERM');
    }
  }, 2500);

  return { ok: true, stopped: true, pid };
}

function runCommand(args) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, args, {
      cwd: rootDir,
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    const append = chunk => {
      const text = chunk.toString('utf8');
      output += text;
      addLog(text);
    };

    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.on('error', error => {
      const text = stringifyError(error);
      output += text;
      addLog(text);
      resolve({ ok: false, code: 1, output });
    });
    child.on('exit', code => {
      resolve({ ok: code === 0, code, output });
    });
  });
}

function addExternalLog(message) {
  addLog(message);
  return status();
}

function status() {
  return {
    ok: true,
    running: isRunning(),
    pid: isRunning() ? simulatorProcess.pid : null,
    startedAt,
    lastExit,
    logs,
  };
}

function sendJson(res, data, code = 200) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data, null, 2));
}

function sendHtml(res) {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(`<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Эмулятор водителей</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    font-family: Arial, sans-serif;
    background: #f3f4f6;
    color: #202532;
  }
  .wrap {
    max-width: 430px;
    margin: 0 auto;
    padding: 10px 8px;
  }
  .card {
    position: relative;
    overflow: hidden;
    background: #ffffff;
    border: 0;
    border-radius: 16px;
    box-shadow: 0 12px 34px rgba(15,23,42,.14);
    padding: 11px 8px 12px;
  }
  .card:before {
    content: '';
    display: block;
    width: 84px;
    height: 3px;
    margin: -3px auto 7px;
    border-radius: 999px;
    background: #e7e7e7;
  }
  .head {
    display: grid;
    grid-template-columns: minmax(0,1fr) auto;
    align-items: center;
    gap: 9px;
    min-height: 44px;
    margin: 0 0 7px;
    padding: 7px 10px;
    border-radius: 14px;
    background: #ffffff;
  }
  .title-wrap {
    min-width: 0;
    position: relative;
    padding-left: 36px;
  }
  .title-wrap:before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    width: 28px;
    height: 28px;
    border-radius: 11px;
    transform: translateY(-50%);
    background: #ff2400;
  }
  .title-wrap:after {
    content: '🚕';
    position: absolute;
    left: 0;
    top: 50%;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    transform: translateY(-50%);
    font-size: 14px;
  }
  h1 {
    margin: 0;
    overflow: hidden;
    font-size: 15px;
    line-height: 1.15;
    font-weight: 800;
    color: #202532;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .hint {
    margin: 3px 0 0;
    overflow: hidden;
    color: #8b92a0;
    font-size: 11px;
    line-height: 1.2;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .status {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 22px;
    padding: 0;
    border-radius: 0;
    font-weight: 800;
    font-size: 11px;
    line-height: 1;
    white-space: nowrap;
    background: transparent;
    color: #ff2400;
  }
  .status.running { background: transparent; color: #16a34a; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .buttons {
    display: grid;
    grid-template-columns: repeat(2,minmax(0,1fr));
    gap: 7px;
    margin: 0 0 10px;
    padding: 0;
    border-radius: 0;
    background: transparent;
  }
  button {
    min-height: 36px;
    border: 0;
    border-radius: 10px;
    padding: 0 12px;
    font-size: 12px;
    line-height: 1;
    font-weight: 800;
    cursor: pointer;
    color: #fff;
    background: #ff2400;
    box-shadow: none;
    transition: opacity .16s ease, background-color .16s ease, color .16s ease, border-color .16s ease;
  }
  button:hover:not(:disabled), button:focus:not(:disabled) { background: #e92200; outline: none; }
  button.secondary { background: #ffffff; color: #ff2400; border: 1px solid rgba(255,36,0,.18); }
  button.muted { grid-column: 1 / -1; color: #8b92a0; border-color: rgba(139,146,160,.24); }
  button.gray { background: #f1f2f4; color: #8b92a0; }
  button:disabled { opacity: .45; cursor: default; }
  .logs-title { margin: 5px 4px 6px; color: #8b92a0; font-size: 11px; line-height: 1; font-weight: 700; }
  pre {
    margin: 0;
    min-height: 160px;
    max-height: 52vh;
    overflow: auto;
    padding: 10px;
    background: #f5f5f5;
    color: #5d6470;
    border: 0;
    border-radius: 12px;
    font-size: 10.5px;
    line-height: 1.42;
    white-space: pre-wrap;
    box-shadow: none;
  }
  .small { color: #8b92a0; font-size: 10.5px; line-height: 1.35; margin: 8px 4px 0; }
  @media (max-width: 520px) {
    .wrap { max-width: none; min-height: 100vh; display: flex; align-items: flex-end; padding: 0; }
    .card { width: 100%; border-radius: 16px 16px 0 0; padding: 11px 8px max(14px, env(safe-area-inset-bottom, 0) + 10px); box-shadow: 0 -18px 46px rgba(15,23,42,.18); }
    pre { min-height: 128px; max-height: 32vh; }
  }
</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="head">
        <div class="title-wrap">
          <h1>Эмулятор водителей</h1>
          <p class="hint">Запуск водителей для заказа</p>
        </div>
        <div id="status" class="status"><span class="dot"></span><span>Проверка...</span></div>
      </div>
      <div class="buttons">
        <button id="start">Запустить</button>
        <button id="stop" class="gray">Остановить</button>
        <button id="check" class="secondary muted">Проверить</button>
      </div>
      <div class="logs-title">Журнал работы</div>
      <pre id="logs"></pre>
      <div class="small">Используются только подтверждённые аккаунты gruzvill.</div>
    </div>
  </div>
<script>
const $ = id => document.getElementById(id);
async function api(path, options) {
  const response = await fetch(path, options || {});
  return response.json();
}
function render(data) {
  const status = $('status');
  status.className = 'status' + (data.running ? ' running' : '');
  status.querySelector('span:last-child').textContent = data.running ? 'Запущен' : 'Остановлен';
  $('logs').textContent = (data.logs || []).join('\n');
  $('logs').scrollTop = $('logs').scrollHeight;
  $('start').disabled = Boolean(data.running);
  $('stop').disabled = !data.running;
}
async function refresh() {
  try { render(await api('/status')); } catch (e) { $('logs').textContent = 'Панель недоступна: ' + e.message; }
}
async function post(path) { await api(path, { method: 'POST' }); await refresh(); }
$('start').onclick = () => post('/start');
$('stop').onclick = () => post('/stop');
$('check').onclick = () => post('/check');
setInterval(refresh, 1500);
refresh();
</script>
</body>
</html>`);
}

const server = http.createServer(async(req, res) => {
  try {
    if (req.method === 'OPTIONS') return sendJson(res, { ok: true });
    const url = new URL(req.url, `http://${HOST}:${PORT}`);

    if (req.method === 'GET' && url.pathname === '/') return sendHtml(res);
    if (req.method === 'GET' && url.pathname === '/status') return sendJson(res, status());
    if (req.method === 'POST' && url.pathname === '/start') return sendJson(res, startSimulator());
    if (req.method === 'POST' && url.pathname === '/stop') return sendJson(res, stopSimulator());
    if (req.method === 'POST' && url.pathname === '/choice') {
      const raw = await readRequestBody(req);
      const body = raw ? JSON.parse(raw) : {};
      return sendJson(res, savePassengerChoice(body.orderId || body.b_id, body.userId || body.u_id || body.driverId));
    }
    if (req.method === 'POST' && url.pathname === '/check') return sendJson(res, await runCommand(['src/simulator.js', '--check']));
    if (req.method === 'POST' && url.pathname === '/log') {
      const raw = await readRequestBody(req);
      const body = raw ? JSON.parse(raw) : {};
      return sendJson(res, addExternalLog(body.message || body.text || ''));
    }
    return sendJson(res, { ok: false, message: 'Not found' }, 404);
  } catch (error) {
    return sendJson(res, { ok: false, message: stringifyError(error) }, 500);
  }
});

process.on('SIGINT', () => {
  stopSimulator();
  process.exit(0);
});

server.listen(PORT, HOST, () => {
  console.log(`Driver simulator control panel: http://${HOST}:${PORT}`);
  console.log('Open this URL or use the left menu item in the taxi app.');

  if (AUTO_START) {
    // Autostart is intentionally disabled for gruzvill build.
  }
});
