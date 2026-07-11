/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const configPath = path.join(rootDir, 'config.json');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randInt(min, max) {
  const from = Number(min) || 0;
  const to = Number(max) || from;
  return Math.floor(from + Math.random() * (to - from + 1));
}

function pick(list, fallback = null) {
  if (!Array.isArray(list) || !list.length) return fallback;
  return list[randInt(0, list.length - 1)];
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function readConfig() {
  if (!fs.existsSync(configPath)) {
    throw new Error(`config.json not found: ${configPath}`);
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!config.apiBase) throw new Error('config.json: apiBase is required');
  return config;
}

function resolveProjectPath(relativeOrAbsolute) {
  if (!relativeOrAbsolute) return null;
  if (path.isAbsolute(relativeOrAbsolute)) return relativeOrAbsolute;
  return path.join(rootDir, relativeOrAbsolute);
}

function toUrlEncoded(object) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(object || {})) {
    if (value === undefined || value === null || value === '') continue;
    params.append(key, String(value));
  }
  return params;
}

async function parseResponse(response, url) {
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    data = { raw: text };
  }

  if (!response.ok) {
    const err = new Error(`HTTP ${response.status}: ${url}`);
    err.response = data;
    throw err;
  }

  return data;
}

async function apiPostUrlEncoded(apiBase, endpoint, fields) {
  const url = `${apiBase}${endpoint}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: toUrlEncoded(fields),
  });
  return parseResponse(response, url);
}

async function apiPostFormData(apiBase, endpoint, fields) {
  const url = `${apiBase}${endpoint}`;
  const form = new FormData();
  for (const [key, value] of Object.entries(fields || {})) {
    if (value === undefined || value === null || value === '') continue;
    form.append(key, String(value));
  }
  const response = await fetch(url, {
    method: 'POST',
    body: form,
  });
  return parseResponse(response, url);
}

function isBackendError(response) {
  return response?.status === 'error' || String(response?.code || '') === '404';
}

function stringifyError(error) {
  const parts = [error?.message || String(error)];
  if (error?.response) parts.push(JSON.stringify(error.response));
  return parts.join(' | ');
}

function normalizeErrorMessage(errorOrResponse) {
  if (!errorOrResponse) return '';
  return String(
    errorOrResponse?.message ||
    errorOrResponse?.response?.message ||
    errorOrResponse?.error ||
    errorOrResponse?.response?.error ||
    JSON.stringify(errorOrResponse),
  );
}

function hasWrongCOptionsKeys(errorOrResponse) {
  return normalizeErrorMessage(errorOrResponse).toLowerCase().includes('wrong c_options keys');
}

module.exports = {
  rootDir,
  configPath,
  sleep,
  randInt,
  pick,
  readJson,
  writeJson,
  readConfig,
  resolveProjectPath,
  apiPostUrlEncoded,
  apiPostFormData,
  isBackendError,
  stringifyError,
  normalizeErrorMessage,
  hasWrongCOptionsKeys,
};
