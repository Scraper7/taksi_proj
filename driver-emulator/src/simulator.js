/* eslint-disable no-console */
const { spawn } = require('child_process');
const {
  rootDir,
  sleep,
  randInt,
  pick,
  readJson,
  readConfig,
  resolveProjectPath,
  apiPostUrlEncoded,
  isBackendError,
  stringifyError,
  hasWrongCOptionsKeys,
  normalizeErrorMessage,
} = require('./common');

const ACTIONS = {
  SET_PERFORMER: 'set_performer',
  SET_ARRIVE_STATE: 'set_arrive_state',
  SET_START_STATE: 'set_start_state',
  SET_COMPLETE_STATE: 'set_complete_state',
  SET_CANCEL_STATE: 'set_cancel_state',
};

const DRIVER_STATES = {
  CONSIDERING: 1,
  CANCELED: 2,
  PERFORMER: 3,
  ARRIVED: 4,
  STARTED: 5,
  FINISHED: 6,
};

const PAYMENT_WAYS = {
  CASH: 1,
};

const args = new Set(process.argv.slice(2));

// Shared between all bot accounts in this Node process.
// If one bot has already recognized an order as a passenger-choice flow,
// every other bot must treat the same order as candidate-only too.
const KNOWN_MANUAL_CHOICE_ORDER_IDS = new Set();
const IGNORED_STARTUP_ORDER_IDS = new Set();
const PASSENGER_CHOICES_FILE = 'data/passenger-choices.json';
const KNOWN_ACCEPTED_CAR_CLASS_IDS = new Set();


function normalizeTestUserIds(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.reduce((result, item) => {
    String(item ?? '')
      .split(/[,\s;|]+/g)
      .map(part => part.trim())
      .filter(Boolean)
      .forEach(part => result.push(part));
    return result;
  }, []);
}

function getConfiguredTestUserIds(config) {
  return normalizeTestUserIds([
    config?.test_user_id,
    config?.testUserId,
    config?.test_user_ids,
    config?.testUserIds,
  ]);
}

function buildDriveNowEndpoint(config, includeClassFilters = true) {
  const filters = [
    includeClassFilters ? 'b_car_classes' : '',
    includeClassFilters ? 'b_location_classes' : '',
    getConfiguredTestUserIds(config).length ? 'test_user_id' : '',
  ].filter(Boolean);
  return `/drive/now${filters.length ? `?${filters.map(filter => `filter=${encodeURIComponent(filter)}`).join('&')}` : ''}`;
}

function readLocalPassengerChoices() {
  try {
    const data = readJson(resolveProjectPath(PASSENGER_CHOICES_FILE), {});
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

function getLocalPassengerChoice(orderId) {
  if (!orderId) return null;
  const choices = readLocalPassengerChoices();
  const raw = choices[String(orderId)];
  if (!raw) return null;
  if (typeof raw === 'object') return String(raw.userId || raw.u_id || raw.driverId || raw.value || '').trim() || null;
  return String(raw).trim() || null;
}

function isLocalPassengerChoiceForDriver(order, carId, userId) {
  const choice = getLocalPassengerChoice(getOrderId(order));
  if (!choice) return false;
  return String(choice) === String(userId) || String(choice) === String(carId);
}

function getOrderId(order) {
  return String(order?.b_id ?? order?.id ?? order?.booking_id ?? '');
}

function normalizeOrders(response) {
  const booking = response?.data?.booking ?? response?.booking ?? response?.data?.orders ?? response?.orders ?? [];
  if (Array.isArray(booking)) return booking;
  if (booking && typeof booking === 'object') return Object.values(booking);
  return [];
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object') {
    const nested = value.value ?? value.raw ?? value.number ?? value.lat ?? value.latitude ?? value.lng ?? value.longitude;
    if (nested !== undefined && nested !== value) return toNumber(nested);
    return null;
  }

  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const normalized = String(value)
    .trim()
    .replace(/ /g, ' ')
    .replace(',', '.');

  if (!normalized) return null;

  const direct = Number(normalized);
  if (Number.isFinite(direct)) return direct;

  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function isTrueLike(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined || value === '') return false;
  if (typeof value === 'number') return value === 1;
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
}


function getUserCheckState(user) {
  const value = user?.u_check_state ?? user?.check_state ?? user?.u_check ?? user?.check;
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : String(value).trim().toLowerCase();
}

function getCarCheckState(car) {
  const value = car?.c_check_state ?? car?.check_state ?? car?.c_check ?? car?.check ?? car?.state ?? car?.status ?? car?.details?.check_state ?? car?.details?.c_check_state;
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : String(value).trim().toLowerCase();
}

function isApprovedCheckState(value) {
  if (value === null || value === undefined || value === '') return false;
  if (typeof value === 'number') return value === 2;
  return ['2', 'active', 'approved', 'accepted', 'verified', 'success'].includes(String(value).trim().toLowerCase());
}

function isWrongUserCheckState(errorOrResponse) {
  return normalizeErrorMessage(errorOrResponse).toLowerCase().includes('wrong user check state');
}


function isWrongDriverCarClass(errorOrResponse) {
  const text = [
    normalizeErrorMessage(errorOrResponse),
    errorOrResponse?.data,
    errorOrResponse?.detail,
    errorOrResponse?.description,
    errorOrResponse?.response?.data,
    errorOrResponse?.response?.detail,
    errorOrResponse?.response?.description,
    (() => {
      try { return JSON.stringify(errorOrResponse); } catch { return ''; }
    })(),
  ].filter(Boolean).join(' ').toLowerCase();

  return text.includes('driver car has wrong class') ||
    text.includes('wrong driver car class') ||
    text.includes('wrong car class') ||
    (text.includes('car class') && text.includes('wrong'));
}

function normalizeClassToken(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  const raw = String(value).trim();
  if (!raw || raw === '0' || raw.toLowerCase() === 'null' || raw.toLowerCase() === 'undefined') return null;
  const match = raw.match(/[a-zA-Z0-9_-]+/);
  return match ? match[0] : null;
}

function addClassTokensFromValue(result, value) {
  const parsed = parseMaybeJson(value);
  if (parsed === null || parsed === undefined || parsed === '') return;

  if (Array.isArray(parsed)) {
    for (const item of parsed) addClassTokensFromValue(result, item);
    return;
  }

  if (typeof parsed === 'object') {
    const direct = parsed.id ?? parsed.cc_id ?? parsed.class_id ?? parsed.car_class_id ?? parsed.b_car_class ?? parsed.value;
    if (direct !== undefined && direct !== parsed) addClassTokensFromValue(result, direct);

    // Some backends return maps like {"1": true, "2": true}.
    for (const [key, val] of Object.entries(parsed)) {
      if (['id', 'cc_id', 'class_id', 'car_class_id', 'b_car_class', 'value'].includes(key)) continue;
      if (val === true || val === 1 || val === '1' || (typeof val === 'object' && val !== null)) {
        const token = normalizeClassToken(key);
        if (token) result.add(token);
      }
    }
    return;
  }

  const raw = String(parsed).trim();
  if (!raw) return;
  const parts = raw.split(/[;,\s|]+/).filter(Boolean);
  if (parts.length > 1) {
    for (const item of parts) {
      const token = normalizeClassToken(item);
      if (token) result.add(token);
    }
    return;
  }

  const token = normalizeClassToken(raw);
  if (token) result.add(token);
}

function getOrderRequiredCarClassIds(order) {
  const result = new Set();
  const options = normalizeOrderOptions(order);
  const fields = [
    order?.b_car_class,
    order?.b_car_classes,
    order?.b_car_class_id,
    order?.car_class,
    order?.carClass,
    order?.car_class_id,
    order?.cc_id,
    options?.b_car_class,
    options?.b_car_classes,
    options?.b_car_class_id,
    options?.car_class,
    options?.carClass,
    options?.car_class_id,
    options?.cc_id,
  ];
  for (const field of fields) addClassTokensFromValue(result, field);
  return Array.from(result).filter(Boolean);
}

function getCurrentCarClassId(car) {
  const result = new Set();
  const fields = [
    car?.cc_id,
    car?.c_class_id,
    car?.car_class_id,
    car?.c_car_class_id,
    car?.class_id,
    car?.class,
    car?.car_class,
    car?.carClass,
    car?.c_class,
    car?.c_options?.cc_id,
    car?.c_options?.car_class_id,
    car?.details?.cc_id,
    car?.details?.c_class_id,
    car?.details?.car_class_id,
  ];
  for (const field of fields) addClassTokensFromValue(result, field);
  return Array.from(result).filter(Boolean)[0] || null;
}

function getEditableCarPayload(car, targetClassId) {
  const payload = {
    cc_id: String(targetClassId),
  };

  const copyKeys = ['cm_id', 'seats', 'registration_plate', 'color', 'photo', 'details'];
  for (const key of copyKeys) {
    if (car?.[key] !== undefined && car?.[key] !== null && car?.[key] !== '') payload[key] = car[key];
  }

  return payload;
}


let managerSessionPromise = null;

async function loginSession(apiBase, account, label = 'account') {
  if (!account?.login || !account?.password) throw new Error(`${label}: login/password is empty`);
  const auth = await apiPostUrlEncoded(apiBase, '/auth', {
    login: account.login,
    password: account.password,
    type: account.type || 'e-mail',
    au: 'f',
  });
  if (auth?.message === 'wrong login' || auth?.message === 'wrong password' || !auth?.auth_hash) {
    throw new Error(`${label}: auth failed: ${auth?.message || JSON.stringify(auth)}`);
  }

  const tokenResponse = await apiPostUrlEncoded(apiBase, '/token', {
    auth_hash: auth.auth_hash,
  });
  const token = tokenResponse?.data?.token;
  const uHash = tokenResponse?.data?.u_hash;
  if (!token || !uHash) throw new Error(`${label}: token failed: ${JSON.stringify(tokenResponse)}`);

  return {
    token,
    u_hash: uHash,
    user: auth.auth_user || tokenResponse.auth_user || tokenResponse?.data?.user || null,
  };
}

async function getManagerSession(config) {
  const manager = config.managerApproval;
  if (!manager?.enabled) return null;
  if (!managerSessionPromise) {
    managerSessionPromise = loginSession(config.apiBase, manager, 'manager')
      .catch(error => {
        console.log(`[${new Date().toLocaleTimeString()}] [Manager approval] disabled: ${stringifyError(error)}`);
        return null;
      });
  }
  return managerSessionPromise;
}

async function tryManagerApproveDriver(config, user, car, log) {
  const manager = config.managerApproval;
  if (!manager?.enabled || !user?.u_id) return false;

  const session = await getManagerSession(config);
  if (!session?.token || !session?.u_hash) return false;

  let touched = false;
  const targetUserId = user.u_id;
  const prefix = `[manager] user=${targetUserId}${car?.c_id ? ` car=${car.c_id}` : ''}`;

  if (manager.approveUsers !== false) {
    const userPayloads = [
      { u_check_state: 2, u_active: 1 },
      { check_state: 2, u_active: 1 },
      { u_check: 2, u_active: 1 },
    ];
    for (const data of userPayloads) {
      try {
        const response = await apiPostUrlEncoded(config.apiBase, '/user', {
          token: session.token,
          u_hash: session.u_hash,
          u_id: targetUserId,
          data: JSON.stringify(data),
        });
        if (!isBackendError(response) || normalizeErrorMessage(response) === 'user or modified data not found') {
          touched = true;
          log(`${prefix}: approve user try ok ${JSON.stringify(data)}`);
        } else {
          log(`${prefix}: approve user skipped: ${normalizeErrorMessage(response)}`);
        }
      } catch (error) {
        log(`${prefix}: approve user failed: ${stringifyError(error)}`);
      }
    }
  }

  if (manager.approveCars !== false && car?.c_id) {
    const carPayloads = [
      { c_check_state: 2 },
      { check_state: 2 },
      { c_check: 2 },
      { state: 2 },
    ];
    for (const data of carPayloads) {
      try {
        const response = await apiPostUrlEncoded(config.apiBase, `/car/${car.c_id}`, {
          token: session.token,
          u_hash: session.u_hash,
          data: JSON.stringify(data),
        });
        if (!isBackendError(response) || normalizeErrorMessage(response) === 'user or modified data not found') {
          touched = true;
          log(`${prefix}: approve car try ok ${JSON.stringify(data)}`);
        } else {
          log(`${prefix}: approve car skipped: ${normalizeErrorMessage(response)}`);
        }
      } catch (error) {
        log(`${prefix}: approve car failed: ${stringifyError(error)}`);
      }
    }
  }

  return touched;
}

function isEmptyValue(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function parseTimestamp(value) {
  const parsed = parseMaybeJson(value);
  if (parsed === null || parsed === undefined || parsed === '') return null;

  if (parsed instanceof Date) {
    const time = parsed.getTime();
    return Number.isFinite(time) ? time : null;
  }

  if (typeof parsed === 'object') {
    const nested = parsed.date ?? parsed.datetime ?? parsed.value ?? parsed.raw ?? parsed._d ?? parsed.time ?? parsed.timestamp;
    if (nested !== undefined && nested !== parsed) return parseTimestamp(nested);
    return null;
  }

  if (typeof parsed === 'number') {
    const millis = parsed < 10000000000 ? parsed * 1000 : parsed;
    return Number.isFinite(millis) ? millis : null;
  }

  const raw = String(parsed).trim();
  if (!raw) return null;

  const numeric = Number(raw);
  if (Number.isFinite(numeric) && /^\d+(?:\.\d+)?$/.test(raw)) {
    const millis = numeric < 10000000000 ? numeric * 1000 : numeric;
    return Number.isFinite(millis) ? millis : null;
  }

  const normalized = raw.includes(' ') && !raw.includes('T') ? raw.replace(' ', 'T') : raw;
  const time = Date.parse(normalized);
  return Number.isFinite(time) ? time : null;
}

function getOrderTimestamp(order) {
  const fields = [
    'b_created', 'b_create_datetime', 'b_created_at', 'created_at', 'created',
    'b_start_datetime', 'start_datetime', 'datetime', 'time', 'date',
    'b_approved', 'b_confirmation_datetime',
  ];

  for (const field of fields) {
    const value = getObjectValue(order, field);
    const timestamp = parseTimestamp(value);
    if (timestamp) return timestamp;
  }

  return null;
}


function parseMaybeJson(value) {
  if (!value || typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed || !['{', '['].includes(trimmed[0])) return value;
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    return value;
  }
}

function normalizePointFromValues(latitude, longitude) {
  const lat = toNumber(latitude);
  const lon = toNumber(longitude);
  if (lat === null || lon === null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { latitude: Number(lat.toFixed(6)), longitude: Number(lon.toFixed(6)) };
}

function normalizePoint(value) {
  const parsed = parseMaybeJson(value);
  if (!parsed) return null;

  if (Array.isArray(parsed) && parsed.length >= 2) {
    return normalizePointFromValues(parsed[0], parsed[1]) || normalizePointFromValues(parsed[1], parsed[0]);
  }

  if (typeof parsed === 'string') {
    const match = parsed.match(/(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)/);
    if (match) {
      return normalizePointFromValues(match[1], match[2]) || normalizePointFromValues(match[2], match[1]);
    }
    return null;
  }

  if (typeof parsed !== 'object') return null;

  return normalizePointFromValues(
    parsed.latitude ?? parsed.lat ?? parsed.y ?? parsed[0],
    parsed.longitude ?? parsed.lng ?? parsed.lon ?? parsed.long ?? parsed.x ?? parsed[1],
  );
}

function getObjectValue(object, path) {
  return path.split('.').reduce((value, key) => {
    const parsed = parseMaybeJson(value);
    return parsed && typeof parsed === 'object' ? parsed[key] : undefined;
  }, object);
}

function collectOrderContainers(order, maxDepth = 4) {
  const containers = [];
  const seen = new Set();

  function walk(value, depth) {
    const parsed = parseMaybeJson(value);
    if (!parsed || typeof parsed !== 'object') return;
    if (seen.has(parsed)) return;
    seen.add(parsed);
    containers.push(parsed);
    if (depth >= maxDepth) return;
    for (const child of Object.values(parsed)) {
      const next = parseMaybeJson(child);
      if (next && typeof next === 'object') walk(next, depth + 1);
    }
  }

  walk(order, 0);
  return containers;
}

function findPointInContainer(container, latKeys, lonKeys) {
  for (const latKey of latKeys) {
    const latitude = getObjectValue(container, latKey);
    if (latitude === undefined) continue;
    for (const lonKey of lonKeys) {
      const longitude = getObjectValue(container, lonKey);
      const point = normalizePointFromValues(latitude, longitude);
      if (point) return point;
    }
  }
  return null;
}

function toRadians(value) {
  return value * Math.PI / 180;
}

function toDegrees(value) {
  return value * 180 / Math.PI;
}

function distanceMeters(from, to) {
  if (!from || !to) return Number.POSITIVE_INFINITY;
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);
  const a = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371000 * c;
}

function movePointToward(from, to, maxMeters) {
  const distance = distanceMeters(from, to);
  if (!Number.isFinite(distance) || distance <= maxMeters) return { ...to };

  const lat1 = toRadians(from.latitude);
  const lon1 = toRadians(from.longitude);
  const lat2 = toRadians(to.latitude);
  const lon2 = toRadians(to.longitude);
  const bearing = Math.atan2(
    Math.sin(lon2 - lon1) * Math.cos(lat2),
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1),
  );
  const angularDistance = maxMeters / 6371000;
  const nextLat = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
    Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const nextLon = lon1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(nextLat),
  );

  return {
    latitude: Number(toDegrees(nextLat).toFixed(6)),
    longitude: Number(toDegrees(nextLon).toFixed(6)),
  };
}


const EMULATOR_ROUTE_DENSIFY_STEP_METERS = 8;

function pointCacheKey(point) {
  if (!point) return '';
  return [Number(point.latitude).toFixed(6), Number(point.longitude).toFixed(6)].join(',');
}

function routeDistanceMeters(points) {
  if (!Array.isArray(points) || points.length < 2) return 0;
  return points.reduce((sum, point, index) => index === 0 ? 0 : sum + distanceMeters(points[index - 1], point), 0);
}

function interpolateRoutePoint(from, to, progress) {
  const t = Math.max(0, Math.min(1, progress));
  return {
    latitude: Number((from.latitude + (to.latitude - from.latitude) * t).toFixed(6)),
    longitude: Number((from.longitude + (to.longitude - from.longitude) * t).toFixed(6)),
  };
}

function densifyRoutePoints(points, maxStepMeters = EMULATOR_ROUTE_DENSIFY_STEP_METERS) {
  const safe = Array.isArray(points) ? points.filter(Boolean) : [];
  if (safe.length < 2) return safe;

  const result = [safe[0]];
  for (let i = 1; i < safe.length; i += 1) {
    const from = result[result.length - 1];
    const to = safe[i];
    const distance = distanceMeters(from, to);
    if (!Number.isFinite(distance) || distance < 0.25) continue;

    const steps = Math.max(1, Math.ceil(distance / maxStepMeters));
    for (let step = 1; step <= steps; step += 1) {
      result.push(interpolateRoutePoint(from, to, step / steps));
    }
  }

  return result;
}

function ensureRouteEndpoints(points, from, to) {
  const route = Array.isArray(points) ? points.filter(Boolean) : [];
  if (!route.length) return densifyRoutePoints([from, to]);
  if (distanceMeters(route[0], from) > 12) route.unshift(from);
  if (distanceMeters(route[route.length - 1], to) > 12) route.push(to);
  return densifyRoutePoints(route);
}

function buildSoftFallbackRoute(from, to) {
  const directDistance = Math.max(1, distanceMeters(from, to));
  const steps = Math.max(20, Math.min(120, Math.round(directDistance / 70)));
  const latDelta = to.latitude - from.latitude;
  const lonDelta = to.longitude - from.longitude;
  const side = Math.sin((from.latitude + from.longitude + to.latitude + to.longitude) * 1000) >= 0 ? 1 : -1;
  const offset = Math.min(0.006, Math.max(0.001, directDistance / 111320 * 0.16)) * side;
  const points = [];

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const curve = Math.sin(Math.PI * t) * offset;
    points.push({
      latitude: Number((from.latitude + latDelta * t + curve * 0.45).toFixed(6)),
      longitude: Number((from.longitude + lonDelta * t - curve).toFixed(6)),
    });
  }

  return ensureRouteEndpoints(points, from, to);
}

function normalizeOsrmPoint(item) {
  if (!Array.isArray(item) || item.length < 2) return null;
  return normalizePointFromValues(item[1], item[0]);
}

async function fetchOsrmRoutePoints(from, to) {
  if (typeof fetch !== 'function') return null;

  const url = [
    'https://router.project-osrm.org/route/v1/driving/',
    `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`,
    '?overview=full&geometries=geojson',
  ].join('');

  const response = await fetch(url);
  if (!response.ok) return null;

  const data = await response.json();
  const coordinates = data?.routes?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

  const points = coordinates.map(normalizeOsrmPoint).filter(Boolean);
  return points.length > 1 ? ensureRouteEndpoints(points, from, to) : null;
}

async function makeEmulatorRoutePoints(from, to) {
  try {
    const osrm = await fetchOsrmRoutePoints(from, to);
    if (osrm?.length) return osrm;
  } catch (_) {
    // External road routing is optional. Fallback still gives stable, dense movement.
  }

  return buildSoftFallbackRoute(from, to);
}

function findNearestRouteIndex(route, current, preferredIndex = 1) {
  if (!Array.isArray(route) || route.length < 2) return 1;

  const safePreferred = Math.max(1, Math.min(Number(preferredIndex) || 1, route.length - 1));
  const start = Math.max(1, safePreferred - 4);
  const end = Math.min(route.length - 1, safePreferred + 90);
  let bestIndex = safePreferred;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = start; index <= end; index += 1) {
    const distance = distanceMeters(current, route[index]);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestDistance > 80 ? safePreferred : Math.max(bestIndex, safePreferred);
}

function getDistanceToRouteMeters(route, point) {
  if (!Array.isArray(route) || route.length < 2 || !point) return Number.POSITIVE_INFINITY;
  return route.reduce((best, routePoint) => Math.min(best, distanceMeters(point, routePoint)), Number.POSITIVE_INFINITY);
}

function moveAlongRoute(current, route, maxMeters, startIndex = 1) {
  const safeRoute = Array.isArray(route) && route.length > 1 ? route : [current];
  let point = current;
  let index = findNearestRouteIndex(safeRoute, current, startIndex);
  let remaining = Math.max(0.5, maxMeters);

  while (index < safeRoute.length && remaining > 0) {
    const target = safeRoute[index];
    const distance = distanceMeters(point, target);
    if (!Number.isFinite(distance)) break;

    if (distance <= remaining) {
      point = target;
      remaining -= distance;
      index += 1;
      continue;
    }

    point = movePointToward(point, target, remaining);
    remaining = 0;
  }

  const lastPoint = safeRoute[safeRoute.length - 1] || point;
  const done = index >= safeRoute.length || distanceMeters(point, lastPoint) <= 2;
  return { point, index: Math.max(1, Math.min(index, Math.max(1, safeRoute.length - 1))), done };
}

function randomPointAround(center, minMeters = 120, maxMeters = 620) {
  if (!center) return null;
  const min = Math.max(0, Number(minMeters) || 0);
  const max = Math.max(min + 1, Number(maxMeters) || min + 1);
  const radius = min + Math.random() * (max - min);
  const angle = Math.random() * Math.PI * 2;
  const latitude = Number((center.latitude + (Math.cos(angle) * radius) / 111320).toFixed(6));
  const longitude = Number((center.longitude + (Math.sin(angle) * radius) / (111320 * Math.cos(center.latitude * Math.PI / 180))).toFixed(6));
  return { latitude, longitude };
}

function getStageMinVisibleTravelMs(movement, stage) {
  if (stage === 'pickup') return Math.max(18000, Number(movement.minPickupVisibleTravelMs ?? movement.minPickupTravelMs ?? 18000));
  if (stage === 'trip') return Math.max(0, Number(movement.minTripVisibleTravelMs ?? 0));
  return 0;
}

function keepBeforeTarget(from, target, holdMeters) {
  if (!from || !target) return target;
  const distance = distanceMeters(from, target);
  if (!Number.isFinite(distance) || distance < 0.5) return target;
  if (distance <= holdMeters) return from;
  return movePointToward(target, from, holdMeters);
}

function getOrderSpawnCenter(config, driver, order) {
  return getPointFromOrder(order, 'start') ||
    normalizePoint(driver.pickupLocation) ||
    normalizePoint(config.fallbackPickupLocation) ||
    normalizePoint(config.driverLocation) ||
    null;
}

function getPointFromOrder(order, kind) {
  const isDestination = kind === 'destination';
  const latKeys = isDestination ? [
    'b_destination_latitude', 'b_destination_lat', 'b_dest_latitude', 'b_dest_lat', 'destination_latitude', 'to_latitude', 'latitude_to', 'to_lat',
    'finish_latitude', 'end_latitude', 'dropoff_latitude', 'target_latitude', 'd_latitude', 'dest_latitude', 'dest_lat',
    'out_latitude', 't_destination_latitude', 'destination.lat', 'to.lat', 'dropoff.lat',
    'point_to.lat', 'route.to.lat', 'route.destination.lat', 'points.to.lat',
  ] : [
    'b_start_latitude', 'b_start_lat', 'b_from_latitude', 'b_from_lat', 'start_latitude', 'from_latitude', 'latitude_from', 'from_lat',
    'pickup_latitude', 'source_latitude', 'origin_latitude', 's_latitude', 'b_s_latitude', 'b_latitude', 'b_lat',
    'out_s_latitude', 't_start_latitude', 'start.lat', 'from.lat', 'pickup.lat',
    'point_from.lat', 'route.from.lat', 'route.start.lat', 'points.from.lat',
  ];
  const lonKeys = isDestination ? [
    'b_destination_longitude', 'b_destination_lng', 'b_destination_lon', 'b_dest_longitude', 'b_dest_lng', 'b_dest_lon', 'destination_longitude', 'to_longitude', 'longitude_to', 'to_lng', 'to_lon',
    'finish_longitude', 'end_longitude', 'dropoff_longitude', 'target_longitude', 'd_longitude', 'dest_longitude', 'dest_lng', 'dest_lon',
    'out_longitude', 't_destination_longitude', 'destination.lng', 'destination.lon', 'to.lng', 'to.lon',
    'dropoff.lng', 'dropoff.lon', 'point_to.lng', 'point_to.lon', 'route.to.lng', 'route.to.lon',
    'route.destination.lng', 'route.destination.lon', 'points.to.lng', 'points.to.lon',
  ] : [
    'b_start_longitude', 'b_start_lng', 'b_start_lon', 'b_from_longitude', 'b_from_lng', 'b_from_lon', 'start_longitude', 'from_longitude', 'longitude_from', 'from_lng', 'from_lon',
    'pickup_longitude', 'source_longitude', 'origin_longitude', 's_longitude', 'b_s_longitude', 'b_longitude', 'b_lng', 'b_lon',
    'out_s_longitude', 't_start_longitude', 'start.lng', 'start.lon', 'from.lng', 'from.lon',
    'pickup.lng', 'pickup.lon', 'point_from.lng', 'point_from.lon', 'route.from.lng', 'route.from.lon',
    'route.start.lng', 'route.start.lon', 'points.from.lng', 'points.from.lon',
  ];
  const nestedKeys = isDestination ? [
    'destination', 'b_destination', 'to', 'finish', 'end', 'dropoff', 'target',
    'destination_point', 'to_point', 'point_to', 'route.to', 'route.destination', 'points.to',
  ] : [
    'start', 'b_start', 'from', 'pickup', 'source', 'origin',
    'start_point', 'from_point', 'pickup_point', 'point_from', 'route.from', 'route.start', 'points.from',
  ];

  for (const container of collectOrderContainers(order)) {
    const direct = findPointInContainer(container, latKeys, lonKeys);
    if (direct) return direct;

    for (const nestedKey of nestedKeys) {
      const nested = getObjectValue(container, nestedKey);
      const point = normalizePoint(nested);
      if (point) return point;
    }

    if (Array.isArray(container.points)) {
      const index = isDestination ? container.points.length - 1 : 0;
      const point = normalizePoint(container.points[index]);
      if (point) return point;
    }
    if (Array.isArray(container.route_points)) {
      const index = isDestination ? container.route_points.length - 1 : 0;
      const point = normalizePoint(container.route_points[index]);
      if (point) return point;
    }
  }

  return null;
}

function getCoordinateDebug(order) {
  const parsed = parseMaybeJson(order) || {};
  const keys = Object.keys(parsed).slice(0, 40).join(',');
  const values = [
    'b_start_latitude', 'b_start_longitude', 'b_start_lat', 'b_start_lng',
    'b_destination_latitude', 'b_destination_longitude', 'b_destination_lat', 'b_destination_lng',
    'b_dest_latitude', 'b_dest_longitude', 'b_dest_lat', 'b_dest_lng',
    'start_latitude', 'start_longitude', 'from_latitude', 'from_longitude',
    'pickup_latitude', 'pickup_longitude', 'destination_latitude', 'destination_longitude',
    'to_latitude', 'to_longitude', 'b_start_address', 'b_destination_address',
  ]
    .filter(key => parsed[key] !== undefined && parsed[key] !== null && parsed[key] !== '')
    .map(key => `${key}=${JSON.stringify(parsed[key])}`)
    .slice(0, 18)
    .join('; ');

  return `keys=${keys}${values ? `; values=${values}` : ''}`;
}

function getConfiguredFallbackPoint(config, driver, kind) {
  const isDestination = kind === 'destination';
  const source = isDestination ?
    (driver.destinationLocation || config.demoDestinationLocation || config.fallbackDestinationLocation || config.destinationLocation) :
    (driver.pickupLocation || config.demoPickupLocation || config.fallbackPickupLocation || config.pickupLocation);
  const point = normalizePoint(source);
  if (point) return point;

  // Last-resort training route around the current test area. Used only when backend does not return
  // pickup/destination coordinates at all, so the training emulator still demonstrates movement.
  if (config.allowDemoCoordinateFallback === false) return null;
  return isDestination ?
    { latitude: 47.2239, longitude: 39.6366 } :
    { latitude: 47.2216, longitude: 39.6343 };
}

function findDriverRecord(order, carId, userId) {
  const drivers = Array.isArray(order?.drivers) ? order.drivers : [];
  return drivers.find(item => String(item?.c_id || item?.car_id || '') === String(carId)) ||
    drivers.find(item => String(item?.u_id || item?.user_id || '') === String(userId)) ||
    null;
}

function getDriverState(order, carId, userId) {
  const driver = findDriverRecord(order, carId, userId);
  if (!driver) return null;
  const state = getRawDriverState(driver, order);
  return state || null;
}

function getDriverCode(order) {
  return order?.b_driver_code ?? order?.driver_code ?? order?.code ?? order?.data?.b_driver_code;
}

function getStageLabel(stage) {
  if (stage === 'pickup') return 'еду к клиенту';
  if (stage === 'waiting_start') return 'запускаю поездку';
  if (stage === 'trip') return 'везу клиента';
  return stage;
}

function normalizeOrderOptions(order) {
  const options = parseMaybeJson(order?.b_options);
  return options && typeof options === 'object' ? options : {};
}

function getDesiredPrice(order, fallback = 100) {
  const options = normalizeOrderOptions(order);
  const raw =
    options.customer_price ??
    options.customerPrice ??
    options.desired_price ??
    options.desiredPrice ??
    options.performers_price ??
    order?.b_customer_price ??
    order?.b_price ??
    order?.price;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function hasDestinationMarker(order) {
  if (!order) return false;
  const options = normalizeOrderOptions(order);
  return Boolean(
    order?.b_destination_address ||
    order?.b_destination_latitude ||
    order?.b_destination_longitude ||
    order?.destination_address ||
    order?.to_address ||
    options.toShortAddress ||
    options.toAddress ||
    options.destination ||
    getPointFromOrder(order, 'destination')
  );
}

function rememberManualChoiceOrder(order) {
  const orderId = getOrderId(order);
  if (orderId) KNOWN_MANUAL_CHOICE_ORDER_IDS.add(String(orderId));
}

function isRememberedManualChoiceOrder(order) {
  const orderId = getOrderId(order);
  return Boolean(orderId && KNOWN_MANUAL_CHOICE_ORDER_IDS.has(String(orderId)));
}

function stringifyOrderSearchText(order) {
  const options = normalizeOrderOptions(order);
  return [
    // Keep full order text as a last safety net: some backends put "Предложение" /
    // intercity markers in non-standard fields. Without this, the emulator may think an
    // offer is an ordinary order and send performer=1.
    JSON.stringify(order),
    JSON.stringify(options),
    options.order_mode,
    options.offer_mode,
    options.driver_offer_mode,
    options.mode,
    order?.order_mode,
    order?.b_order_mode,
    order?.b_mode,
    order?.mode,
    order?.b_location_kind,
    order?.b_location_class_kind,
    order?.b_comment,
    order?.b_custom_comment,
    order?.b_type,
  ].filter(Boolean).join(' ').toLowerCase();
}

function hasOfferCandidateResponse(order) {
  return (Array.isArray(order?.drivers) ? order.drivers : []).some(driver => {
    const options = parseMaybeJson(driver?.c_options) || {};
    return getRawDriverState(driver, order) === DRIVER_STATES.CONSIDERING && (
      options.performers_price !== undefined ||
      options.driver_offer_price !== undefined ||
      options.driver_offer_eta !== undefined ||
      options.driver_offer_comment !== undefined ||
      driver?.c_pickup_time !== undefined ||
      driver?.c_comment !== undefined
    );
  });
}

function isOfferOrder(order) {
  const options = normalizeOrderOptions(order);
  const raw = stringifyOrderSearchText(order);
  if (raw.includes('offer') || raw.includes('intercity') || raw.includes('предлож')) return true;
  if (options.order_mode === 'OFFER' || options.offer_mode === 'OFFER' || options.driver_offer_mode === 'OFFER') return true;
  if (options.offer_mode === true || options.driver_offer_mode === true || options.driver_offer === true) return true;
  if (String(order?.b_cars_count) === '0') return true;
  if (Number(order?.b_only_offer) === 1 || order?.b_only_offer === true) return true;
  if (hasOfferCandidateResponse(order)) return true;
  return false;
}

function isVotingOrder(order) {
  const options = normalizeOrderOptions(order);
  const services = JSON.stringify(order?.b_services ?? '').toLowerCase();
  const raw = stringifyOrderSearchText(order);

  // Important: backend often returns flags as strings. Boolean('0') === true, so do not use it here.
  // Otherwise a normal order with b_voting='0' may be treated as voting and get stuck on boarding code logic.
  return isTrueLike(order?.b_voting) ||
    isTrueLike(options?.b_voting) ||
    isTrueLike(options?.voting) ||
    services.includes('voting') ||
    raw.includes('voting') ||
    raw.includes('голос');
}


function isChoiceOrder(order) {
  return isRememberedManualChoiceOrder(order) || isOfferOrder(order) || isVotingOrder(order);
}

function shouldWaitForPassengerChoice(config, order) {
  // Emergency flag: candidate-only for every visible order. Keep it off by default,
  // otherwise ordinary orders cannot be taken as direct performer orders.
  if (config.forceCandidateOnly === true) {
    rememberManualChoiceOrder(order);
    return true;
  }

  const choiceOrder = isChoiceOrder(order);

  // Safety mode for the training emulator. Some /drive/now responses are short and may
  // miss b_cars_count/b_options even when the passenger created an offer/intercity order.
  // In manual training mode, any routed order with a destination must be candidate-only,
  // so the bot cannot turn the first response into a moving performer before the passenger clicks.
  if (!choiceOrder && config.manualChoiceOnly === true && config.manualChoiceCandidateOnlyForDestinationOrders !== false && hasDestinationMarker(order)) {
    rememberManualChoiceOrder(order);
    return true;
  }

  if (!choiceOrder) return false;

  // Offer/voting are manual-choice flows. The emulator may create candidate cards,
  // but the passenger must select the driver explicitly before the bot starts moving.
  // This is intentionally independent from the account currently opened in the browser:
  // bots only create visible candidate responses from config.json/test driver accounts.
  if (config.manualChoiceOnly === true) {
    rememberManualChoiceOrder(order);
    return true;
  }

  // Keep old auto-accept only behind explicit training flags.
  const wait = config.autoAcceptCandidates !== true && config.trainingAutoAcceptCandidates !== true;
  if (wait) rememberManualChoiceOrder(order);
  return wait;
}

function getRawDriverState(driver, order = null) {
  return toNumber(
    driver?.c_state ??
    driver?.state ??
    driver?.booking_driver_state ??
    driver?.driver_state ??
    order?.c_state ??
    order?.driver_state ??
    order?.b_driver_state,
  );
}

function isCandidateState(state) {
  return Number(state) === DRIVER_STATES.CONSIDERING;
}

function isAssignedDriverState(state) {
  return [
    DRIVER_STATES.PERFORMER,
    DRIVER_STATES.ARRIVED,
    DRIVER_STATES.STARTED,
  ].includes(Number(state));
}

function isWaitingChoiceDriverState(state) {
  return !isAssignedDriverState(state) && !isClosedDriverState(state) && Number(state) !== DRIVER_STATES.FINISHED;
}

function hasWaitingChoiceCompetitors(order, carId, userId) {
  if (!isChoiceOrder(order)) return false;
  const drivers = Array.isArray(order?.drivers) ? order.drivers : [];
  return drivers.some(driver => {
    const sameCar = carId && String(driver?.c_id) === String(carId);
    const sameUser = userId && String(driver?.u_id) === String(userId);
    if (sameCar || sameUser) return false;
    return isWaitingChoiceDriverState(getRawDriverState(driver, order));
  });
}

function getChoiceDriverSummary(order, carId, userId) {
  const drivers = Array.isArray(order?.drivers) ? order.drivers : [];
  const own = drivers.find(driver => {
    const sameCar = carId && String(driver?.c_id) === String(carId);
    const sameUser = userId && String(driver?.u_id) === String(userId);
    return sameCar || sameUser;
  }) || null;
  const competitors = drivers.filter(driver => driver !== own);
  const waitingCompetitors = competitors.filter(driver => isWaitingChoiceDriverState(getRawDriverState(driver, order)));
  const closedCompetitors = competitors.filter(driver => isClosedDriverState(getRawDriverState(driver, order)));
  const assignedCompetitors = competitors.filter(driver => isAssignedDriverState(getRawDriverState(driver, order)));
  return {
    drivers,
    own,
    competitors,
    waitingCompetitors,
    closedCompetitors,
    assignedCompetitors,
  };
}

function isPassengerChoiceSettled(config, order, carId, userId) {
  if (!isChoiceOrder(order)) return true;
  if (config.choiceRequiresPassengerSelection === false) return true;

  // The passenger app notifies the local emulator panel after a real click on "Выбрать".
  // This lets the selected bot start even if the backend keeps other candidates visible.
  const localChoice = getLocalPassengerChoice(getOrderId(order));
  if (localChoice) return String(localChoice) === String(userId) || String(localChoice) === String(carId);

  const summary = getChoiceDriverSummary(order, carId, userId);
  const minCandidates = Math.max(1, Number(config.choiceMinCandidatesBeforeMovement || 2));

  // Real passenger selection in this backend flow closes/rejects the other candidates.
  // Backend may temporarily mark the first responder as performer before the passenger clicks.
  // Do not drive in that temporary state; otherwise it looks like the bot selected itself.
  if (summary.waitingCompetitors.length > 0 || summary.assignedCompetitors.length > 0) {
    return false;
  }

  if (summary.drivers.length >= minCandidates && summary.closedCompetitors.length >= Math.min(1, minCandidates - 1)) {
    return true;
  }

  return false;
}

function getChoiceNotSettledReason(config, order, carId, userId) {
  const summary = getChoiceDriverSummary(order, carId, userId);
  const minCandidates = Math.max(1, Number(config.choiceMinCandidatesBeforeMovement || 2));
  return `drivers=${summary.drivers.length}, min=${minCandidates}, waiting=${summary.waitingCompetitors.length}, closed=${summary.closedCompetitors.length}, assignedCompetitors=${summary.assignedCompetitors.length}`;
}

function isClosedDriverState(state) {
  return [
    DRIVER_STATES.CANCELED,
    DRIVER_STATES.FINISHED,
  ].includes(Number(state));
}

function isAlreadyHandledByDriver(order, carId, userId) {
  const driver = findDriverRecord(order, carId, userId);
  if (!driver) return false;
  const state = getRawDriverState(driver, order);

  // Candidate (1) is exactly what passenger cards/chips use.
  // Assigned states (3/4/5) mean the client has already chosen this driver.
  // Empty/0 state is not a visible response, so the emulator may send a real candidate response.
  return isCandidateState(state) || isAssignedDriverState(state) || Number(state) === DRIVER_STATES.FINISHED;
}

function shouldHandleOrder(config, order) {
  const type = String(config.orderType || 'all').toLowerCase();
  if (type === 'offer') return isOfferOrder(order);
  if (type === 'voting') return isVotingOrder(order);
  if (type === 'choice') return isChoiceOrder(order);
  if (type === 'all') return true;
  return isOfferOrder(order) || isVotingOrder(order);
}

function getOfferForDriver(config, driver, order) {
  const basePrice = getDesiredPrice(order, config.defaultOffer?.minPrice || 100);
  const deltaRange = driver.priceDelta || [0, 0];
  const minPrice = Number(config.defaultOffer?.minPrice || 1);
  const maxPrice = Number(config.defaultOffer?.maxPrice || Number.MAX_SAFE_INTEGER);
  const rawPrice = basePrice + randInt(deltaRange[0], deltaRange[1]);
  const boundedPrice = Math.max(minPrice, Math.min(maxPrice, rawPrice));
  const eta = pick(driver.etaOptions, null) || pick(config.defaultOffer?.etaOptions, 'Буду через 10 минут');
  const comment = pick(driver.commentOptions, null) || pick(config.defaultOffer?.commentOptions, 'Еду напрямую');
  return { price: boundedPrice, eta, comment };
}

function buildOfferData(driver, offer, mode) {
  const transportMode = String(mode || 'safe').toLowerCase();
  const cOptions = {
    performers_price: offer.price,
  };

  // gruzvill backend may reject extra c_options keys. In safe mode we send only price,
  // so candidate card appears and the passenger can choose manually.
  if (transportMode === 'c_options' || transportMode === 'both') {
    cOptions.driver_offer_eta = offer.eta;
    cOptions.driver_offer_comment = offer.comment;
  }

  const data = {
    c_id: driver.car.c_id,
    c_payment_way: PAYMENT_WAYS.CASH,
    c_options: cOptions,
  };

  if (transportMode === 'separate' || transportMode === 'both') {
    data.c_pickup_time = offer.eta;
    data.c_arrival_time = offer.eta;
    data.c_comment = offer.comment;
    data.driver_offer_eta = offer.eta;
    data.driver_offer_comment = offer.comment;
  }

  return data;
}

function buildSafeOfferData(driver, offer) {
  return {
    c_id: driver.car.c_id,
    c_payment_way: PAYMENT_WAYS.CASH,
    c_options: {
      performers_price: offer.price,
    },
  };
}

function getDriversFromConfig(config) {
  const drivers = [];
  const filePath = resolveProjectPath(config.driversFile || 'data/registered-drivers.json');
  const fileDrivers = readJson(filePath, []);
  if (Array.isArray(fileDrivers) && fileDrivers.length) {
    drivers.push(...fileDrivers);
  }

  // Demo/manual drivers from config are disabled by default so stale test logins do not break checks.
  // Set "useConfigDrivers": true in config.json only when you intentionally filled drivers[] by hand.
  if (config.useConfigDrivers === true && Array.isArray(config.drivers)) {
    drivers.push(...config.drivers);
  }

  const seen = new Set();
  return drivers.filter(driver => {
    const key = `${driver.login}|${driver.type || 'e-mail'}`;
    if (!driver.login || !driver.password || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


function getAutoRegisterTarget(config) {
  const raw = config.minReadyDrivers ?? config.trainingDriverCount ?? config.registration?.count ?? 0;
  const target = Number(raw);
  return Number.isFinite(target) && target > 0 ? Math.floor(target) : 0;
}

function canAutoRegisterDrivers(config) {
  if (args.has('--dry') || args.has('--no-register')) return false;
  if (config.autoRegisterTestDrivers === false) return false;
  if (config.registration?.enabled === false) return false;
  return true;
}

function runRegisterDrivers(count, reason = 'auto') {
  const safeCount = Math.max(0, Math.floor(Number(count) || 0));
  if (!safeCount) return Promise.resolve({ ok: true, skipped: true });

  return new Promise(resolve => {
    console.log(`[${new Date().toLocaleTimeString()}] [auto-register] need ${safeCount} more ready driver(s), reason=${reason}`);
    const child = spawn(process.execPath, ['src/register-drivers.js', '--count', String(safeCount), '--append'], {
      cwd: rootDir,
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', chunk => {
      const text = chunk.toString('utf8').trimEnd();
      if (text) console.log(text);
    });
    child.stderr.on('data', chunk => {
      const text = chunk.toString('utf8').trimEnd();
      if (text) console.error(text);
    });
    child.on('error', error => {
      console.error(`[auto-register] failed to start registration: ${stringifyError(error)}`);
      resolve({ ok: false, code: 1, error });
    });
    child.on('exit', code => {
      const ok = code === 0;
      console.log(`[${new Date().toLocaleTimeString()}] [auto-register] finished with code=${code}`);
      resolve({ ok, code });
    });
  });
}

async function prepareDriversList(config, reason = 'before init') {
  const target = getAutoRegisterTarget(config);
  let drivers = getDriversFromConfig(config);

  if (!canAutoRegisterDrivers(config) || !target) return drivers;

  if (drivers.length < target) {
    await runRegisterDrivers(target - drivers.length, `${reason}: not enough configured drivers`);
    drivers = getDriversFromConfig(readConfig());
  }

  return drivers;
}

async function initBots(config, drivers) {
  const bots = drivers.map((driver, index) => new DriverBot(config, driver, index));
  for (const bot of bots) {
    try {
      await bot.init();
    } catch (error) {
      bot.disabled = true;
      bot.log(`init failed: ${stringifyError(error)}`);
      if (args.has('--check')) process.exitCode = 1;
    }
  }
  const readyBots = bots.filter(bot => !bot.disabled);
  console.log(`Ready approved drivers: ${readyBots.length}/${bots.length}`);
  if (!readyBots.length) console.log('No approved driver accounts are ready. Created accounts may need backend approval; see registration-last-result.json.');
  return readyBots;
}

class DriverBot {
  constructor(config, driver, index = 0) {
    this.config = config;
    this.driver = driver;
    this.index = index;
    this.name = driver.name || driver.login;
    this.tokens = null;
    this.user = null;
    this.car = null;
    this.handled = new Set();
    this.waitingChoiceLogged = new Set();
    this.choiceAssignedBlocked = new Set();
    this.choiceResponseSentAt = new Map();
    this.running = false;
    this.currentLocation = null;
    this.activeTripState = new Map();
    this.orderSpawnLocations = new Map();
    this.routeCache = new Map();
    this.lastMovingLocationSentAt = 0;
    this.cleanupAlreadyDone = false;
    this.disabled = false;
  }

  log(message) {
    console.log(`[${new Date().toLocaleTimeString()}] [${this.name}] ${message}`);
  }

  async login() {
    const session = await loginSession(this.config.apiBase, this.driver, this.name);
    this.tokens = { token: session.token, u_hash: session.u_hash };
    this.user = session.user || null;
    this.log(`login ok, user=${this.user?.u_id || 'unknown'}`);
  }

  authFields(extra = {}) {
    return {
      token: this.tokens.token,
      u_hash: this.tokens.u_hash,
      ...extra,
    };
  }

  getConfiguredDriverLocation() {
    const location = this.driver.location ||
      (Array.isArray(this.config.driverLocations) ? this.config.driverLocations[this.index] : null) ||
      this.config.driverLocation || {};

    let latitude = Number(location.latitude);
    let longitude = Number(location.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    // If several drivers still received the same base coordinate, spread them in a small circle
    // around the base point so they are visible as different cars on the map.
    if (!this.driver.location && !Array.isArray(this.config.driverLocations) && this.index > 0) {
      const spreadMeters = Number(this.config.driverLocationSpreadMeters || 250);
      const angle = (Math.PI * 2 * this.index) / Math.max(2, Number(this.config.drivers?.length || 2));
      const radius = spreadMeters * (1 + (this.index % 3) * 0.35);
      const latOffset = (Math.cos(angle) * radius) / 111320;
      const lonOffset = (Math.sin(angle) * radius) / (111320 * Math.cos(latitude * Math.PI / 180));
      latitude += latOffset;
      longitude += lonOffset;
    }

    return {
      latitude: Number(latitude.toFixed(6)),
      longitude: Number(longitude.toFixed(6)),
    };
  }

  getDriverLocation() {
    return this.currentLocation || this.getConfiguredDriverLocation();
  }

  async activateDrivenCar() {
    if (this.config.activateCar === false || !this.car?.c_id) return;

    const response = await apiPostUrlEncoded(this.config.apiBase, `/car/${this.car.c_id}/drive`, this.authFields({}));
    if (isBackendError(response) && normalizeErrorMessage(response) !== 'car is already driven by this user') {
      this.log(`car drive activate failed: ${normalizeErrorMessage(response)}`);
      return;
    }

    this.log(`car drive active, c_id=${this.car.c_id}`);
  }

  async syncLocationClasses() {
    const classes = this.driver.bookingLocationClasses || this.config.bookingLocationClasses;
    if (!Array.isArray(classes) || !classes.length) return;

    const response = await apiPostUrlEncoded(this.config.apiBase, '/user', this.authFields({
      data: JSON.stringify({ 'b_location_classes=': classes }),
    }));

    if (isBackendError(response) && normalizeErrorMessage(response) !== 'user or modified data not found') {
      this.log(`location classes sync failed: ${normalizeErrorMessage(response)}`);
      return;
    }

    this.log(`location classes synced: ${classes.join(',')}`);
  }

  async setOnline() {
    if (this.config.activateOnline === false) return;

    const response = await apiPostUrlEncoded(this.config.apiBase, '/user', this.authFields({
      data: JSON.stringify({ u_active: 1 }),
    }));

    if (isBackendError(response) && normalizeErrorMessage(response) !== 'user or modified data not found') {
      this.log(`online activate failed: ${normalizeErrorMessage(response)}`);
      return;
    }

    this.log('online active');
  }

  async sendLocation(locationOverride = null, { moving = false } = {}) {
    if (this.config.sendDriverLocation === false) return;
    const location = locationOverride || this.getDriverLocation();
    if (!location) {
      this.log('location skipped: config.driverLocation is empty');
      return;
    }

    this.currentLocation = location;
    const response = await apiPostUrlEncoded(this.config.apiBase, '/location', this.authFields(location));
    if (isBackendError(response)) {
      this.log(`location send failed: ${normalizeErrorMessage(response)}`);
      return;
    }

    this.lastLocationSentAt = Date.now();
    if (moving) this.lastMovingLocationSentAt = Date.now();
    this.log(`${moving ? 'moving location' : 'location'} sent: ${location.latitude},${location.longitude}`);
  }

  async loadCar() {
    const userId = this.user?.u_id;
    if (!userId) throw new Error('cannot load car: user id is empty');

    const response = await apiPostUrlEncoded(this.config.apiBase, `/user/${userId}/car`, this.authFields({
      array_type: 'list',
    }));

    const cars = response?.data?.car;
    this.car = Array.isArray(cars) ? cars[0] : (cars && Object.values(cars)[0]);
    if (!this.car) throw new Error('car not found for this driver');
    this.log(`car ok, c_id=${this.car.c_id}, class=${getCurrentCarClassId(this.car) || 'unknown'}`);
  }

  async loadAuthorizedUser() {
    const response = await apiPostUrlEncoded(this.config.apiBase, '/user/authorized', this.authFields({
      array_type: 'list',
    }));
    const users = response?.data?.user ?? response?.user;
    if (Array.isArray(users)) this.user = users[0] || this.user;
    else if (users && typeof users === 'object') this.user = Object.values(users)[0] || this.user;
  }

  verifyReadyOrDisable() {
    const userState = getUserCheckState(this.user);
    const carState = getCarCheckState(this.car);
    const profileReady = isApprovedCheckState(userState);
    const carReady = carState === null || isApprovedCheckState(carState);

    if (!profileReady || !carReady) {
      if (this.config.skipUnapprovedDrivers !== false) {
        this.disabled = true;
        this.log(`disabled: driver is not approved yet (user_check=${userState ?? 'unknown'}, car_check=${carState ?? 'unknown'}). It will not send offers, to avoid wrong user check state.`);
        return false;
      }

      this.log(`warning: approval state is not confirmed (user_check=${userState ?? 'unknown'}, car_check=${carState ?? 'unknown'}). Trying anyway because skipUnapprovedDrivers=false.`);
      return true;
    }

    this.log(`ready: approved driver (user_check=${userState}, car_check=${carState ?? 'not-required'})`);
    return true;
  }

  async rememberStartupOrders() {
    if (this.config.ignoreExistingOrdersOnStart !== true) return;
    let orders = [];
    try {
      orders = [
        ...await this.getActiveOrders().catch(() => []),
        ...await this.getReadyOrders().catch(() => []),
      ];
    } catch {
      orders = [];
    }
    for (const order of orders) {
      const orderId = getOrderId(order);
      if (orderId) IGNORED_STARTUP_ORDER_IDS.add(orderId);
    }
    if (orders.length) this.log(`startup existing orders ignored: ${orders.map(getOrderId).filter(Boolean).join(', ')}`);
  }

  async init() {
    await this.login();
    await this.loadAuthorizedUser().catch(() => null);
    await this.loadCar();

    // gruzvill: before disabling a real configured account, try to approve it via the
    // provided manager/account credentials. If backend permissions allow it, all listed
    // accounts become visible as candidate drivers without manual test setup.
    await tryManagerApproveDriver(this.config, this.user, this.car, message => this.log(message));
    await this.loadAuthorizedUser().catch(() => null);
    await this.loadCar().catch(() => null);

    if (!this.verifyReadyOrDisable()) return;
    await this.activateDrivenCar();
    await this.syncLocationClasses();
    await this.setOnline();
    await this.sendLocation();
    await this.cleanupOldActiveOrders('startup');
    await this.rememberStartupOrders();
  }

  shouldCleanupActiveOrder(order, reason) {
    if (this.config.cleanupOldActiveOrders === false) return false;
    if (!findDriverRecord(order, this.car?.c_id, this.user?.u_id)) return false;

    const state = getDriverState(order, this.car?.c_id, this.user?.u_id);
    if (isClosedDriverState(state)) return false;

    if (reason === 'startup' && this.config.cancelExistingActiveOrdersOnStart === true) {
      return true;
    }

    const timestamp = getOrderTimestamp(order);
    if (!timestamp) {
      return reason === 'startup' && this.config.cancelActiveOrdersWithUnknownAgeOnStart === true;
    }

    const maxAgeMs = Number(this.config.staleActiveOrderMaxAgeMinutes || 30) * 60 * 1000;
    return Date.now() - timestamp >= maxAgeMs;
  }

  async cleanupOldActiveOrders(reason = 'manual') {
    if (this.cleanupAlreadyDone && reason === 'startup') return;
    if (reason === 'startup') this.cleanupAlreadyDone = true;
    if (this.config.cleanupOldActiveOrders === false) return;

    let orders = [];
    try {
      orders = await this.getActiveOrders();
    } catch (error) {
      this.log(`old active cleanup skipped: ${stringifyError(error)}`);
      return;
    }

    const activeForDriver = orders.filter(order => this.shouldCleanupActiveOrder(order, reason));
    if (!activeForDriver.length) return;

    for (const order of activeForDriver) {
      const orderId = getOrderId(order);
      if (!orderId) continue;
      const response = await this.setOrderAction(orderId, ACTIONS.SET_CANCEL_STATE);
      if (isBackendError(response)) {
        this.log(`order ${orderId}: old active cleanup cancel failed: ${normalizeErrorMessage(response)}`);
      } else {
        this.log(`order ${orderId}: old active order canceled before training run`);
        this.activeTripState.delete(orderId);
        this.waitingChoiceLogged.delete(orderId);
        this.handled.delete(orderId);
      }
    }
  }

  async getReadyOrders() {
    const mainResponse = await apiPostUrlEncoded(
      this.config.apiBase,
      buildDriveNowEndpoint(this.config, true),
      this.authFields({ array_type: 'list' }),
    );
    const mainOrders = normalizeOrders(mainResponse);
    if (mainOrders.length || this.config.strictFilteredOrders === true) return mainOrders;

    const fallbackResponse = await apiPostUrlEncoded(
      this.config.apiBase,
      buildDriveNowEndpoint(this.config, false),
      this.authFields({ array_type: 'list' }),
    );
    const fallbackOrders = normalizeOrders(fallbackResponse);
    if (fallbackOrders.length) {
      this.log(`filtered orders=0, fallback /drive/now returned ${fallbackOrders.length}`);
    }
    return fallbackOrders;
  }


  normalizeOrderDetail(response, orderId) {
    const booking = response?.data?.booking ?? response?.booking;
    if (Array.isArray(booking)) return booking.find(item => String(getOrderId(item)) === String(orderId)) || booking[0] || null;
    if (booking && typeof booking === 'object') return booking[orderId] || Object.values(booking)[0] || null;
    if (response?.data && typeof response.data === 'object' && (response.data.b_id || response.data.id)) return response.data;
    return null;
  }

  async getOrderDetail(orderId) {
    if (!orderId) return null;
    const response = await apiPostUrlEncoded(
      this.config.apiBase,
      `/drive/get/${orderId}?fields=00000000u1`,
      this.authFields({ array_type: 'list' }),
    );
    if (isBackendError(response)) return null;
    return this.normalizeOrderDetail(response, orderId);
  }

  async hydrateActiveOrder(order) {
    const orderId = getOrderId(order);
    if (!orderId) return order;
    if (getPointFromOrder(order, 'start') && getPointFromOrder(order, 'destination')) return order;

    try {
      const detail = await this.getOrderDetail(orderId);
      if (!detail) return order;
      const merged = { ...order, ...detail };
      if (getPointFromOrder(merged, 'start') || getPointFromOrder(merged, 'destination')) {
        this.log(`order ${orderId}: coordinates loaded from detail`);
      }
      return merged;
    } catch (error) {
      this.log(`order ${orderId}: detail load failed: ${stringifyError(error)}`);
      return order;
    }
  }

  async hydrateOrderForDecision(order) {
    if (this.config.hydrateReadyOrdersForDecision === false) return order;
    const orderId = getOrderId(order);
    if (!orderId) return order;

    try {
      const detail = await this.getOrderDetail(orderId);
      if (!detail) return order;
      const merged = { ...order, ...detail };
      if (isChoiceOrder(merged) || hasDestinationMarker(merged)) {
        this.log(`order ${orderId}: decision data loaded from detail; choice=${isChoiceOrder(merged)}, destination=${hasDestinationMarker(merged)}`);
      }
      return merged;
    } catch (error) {
      this.log(`order ${orderId}: decision detail load skipped: ${stringifyError(error)}`);
      return order;
    }
  }

  async getActiveOrders() {
    const response = await apiPostUrlEncoded(
      this.config.apiBase,
      '/drive?fields=00000000u1',
      this.authFields({ array_type: 'list' }),
    );
    const orders = normalizeOrders(response);
    if (this.config.hydrateActiveOrders === false || !orders.length) return orders;
    return Promise.all(orders.map(order => this.hydrateActiveOrder(order)));
  }

  async setOrderAction(orderId, action, extra = {}) {
    return apiPostUrlEncoded(this.config.apiBase, `/drive/get/${orderId}`, this.authFields({
      action,
      ...extra,
    }));
  }

  getMovementConfig() {
    return {
      enabled: true,
      moveIntervalMs: 800,
      speedToPickupKmh: 180,
      speedInTripKmh: 110,
      minStepMeters: 80,
      arriveDistanceMeters: 24,
      followRoadRoute: true,
      autoArrive: true,
      autoStartTrip: false,
      autoStartRequiresCode: false,
      pressArriveAfterPickupMs: 3000,
      startAfterArriveMs: 5000,
      autoFinishTrip: true,
      finishAfterDestinationMs: 4000,
      finishDistanceMeters: 30,
      ...(this.config.tripSimulation || {}),
    };
  }

  async getMovementRoute(orderId, stage, from, target) {
    if (!orderId || !from || !target) return null;

    const routeKey = `${orderId}:${stage}:${pointCacheKey(target)}`;
    const previous = this.routeCache.get(routeKey);

    if (previous?.points?.length > 1 && getDistanceToRouteMeters(previous.points, from) < 120) {
      return previous.points;
    }

    const points = await makeEmulatorRoutePoints(from, target);
    if (points?.length > 1) {
      this.routeCache.set(routeKey, { points, createdAt: Date.now() });
      this.log(`order ${orderId}: route for ${getStageLabel(stage)} prepared, ${Math.round(routeDistanceMeters(points))} m`);
      return points;
    }

    return null;
  }

  async moveToward(order, target, stage, speedKmh, arriveDistanceMeters) {
    const movement = this.getMovementConfig();
    const orderId = getOrderId(order);
    const previous = this.activeTripState.get(orderId) || {};
    const now = Date.now();
    const stageStartedAt = previous[`${stage}StartedAt`] || now;
    const minVisibleTravelMs = getStageMinVisibleTravelMs(movement, stage);
    const canFinishStage = minVisibleTravelMs <= 0 || now - stageStartedAt >= minVisibleTravelMs;

    if (previous.stage !== stage) {
      this.log(`order ${orderId}: ${getStageLabel(stage)}`);
    }

    let from = this.getDriverLocation();
    if (!from || !target) return { reached: false, distance: Number.POSITIVE_INFINITY };

    // If the backend/browser already placed the car almost on the pickup point,
    // do not press "arrived" immediately. Start from the stored spawn point and
    // show a quick visible approach to the client instead of a teleport.
    if (stage === 'pickup' && !previous[`${stage}StartedAt`] && distanceMeters(from, target) < Number(movement.minPickupStartDistanceMeters ?? 450)) {
      const visibleStart = this.getVisiblePickupStartLocation(order, target);
      if (visibleStart && distanceMeters(visibleStart, target) > distanceMeters(from, target)) {
        from = visibleStart;
        this.currentLocation = visibleStart;
        await this.sendLocation(visibleStart, { moving: true });
        this.log(`order ${orderId}: visible pickup approach started from ${visibleStart.latitude},${visibleStart.longitude}`);
      }
    }

    const distance = distanceMeters(from, target);
    const stepMeters = Math.max(
      Number(movement.minStepMeters || 12),
      (Number(speedKmh) || 25) * 1000 / 3600 * Number(movement.moveIntervalMs || 800) / 1000,
    );
    const effectiveArriveDistance = canFinishStage ? arriveDistanceMeters : Math.min(3, arriveDistanceMeters);
    const holdMeters = Math.max(Number(movement.holdBeforePickupMeters ?? 65), arriveDistanceMeters + 20);

    let nextLocation = canFinishStage && distance <= arriveDistanceMeters ? target : null;
    let nextRouteIndex = Number(previous[`${stage}RouteIndex`]) || 1;

    if (!nextLocation && movement.followRoadRoute !== false) {
      const route = await this.getMovementRoute(orderId, stage, from, target);
      if (route?.length > 1) {
        const moved = moveAlongRoute(from, route, stepMeters, nextRouteIndex);
        const movedDistance = distanceMeters(moved.point, target);
        if ((moved.done || movedDistance <= arriveDistanceMeters) && !canFinishStage) {
          nextLocation = keepBeforeTarget(from, target, holdMeters);
        } else {
          nextLocation = moved.done || movedDistance <= effectiveArriveDistance ? target : moved.point;
        }
        nextRouteIndex = moved.index;
      }
    }

    if (!nextLocation) {
      const directNext = movePointToward(from, target, stepMeters);
      nextLocation = !canFinishStage && distanceMeters(directNext, target) <= arriveDistanceMeters ?
        keepBeforeTarget(from, target, holdMeters) :
        directNext;
    }

    this.currentLocation = nextLocation;

    const minSendInterval = Number(movement.moveIntervalMs || 2500);
    if (!this.lastMovingLocationSentAt || Date.now() - this.lastMovingLocationSentAt >= minSendInterval) {
      await this.sendLocation(nextLocation, { moving: true });
    }

    const nextDistance = distanceMeters(nextLocation, target);
    const freshState = this.activeTripState.get(orderId) || previous;
    this.activeTripState.set(orderId, {
      ...freshState,
      stage,
      [`${stage}StartedAt`]: stageStartedAt,
      [`${stage}RouteIndex`]: nextRouteIndex,
      lastDistance: nextDistance,
      updatedAt: Date.now(),
    });

    this.log(`order ${orderId}: ${getStageLabel(stage)}, осталось ≈ ${Math.max(0, Math.round(nextDistance))} м`);
    return { reached: canFinishStage && nextDistance <= arriveDistanceMeters, distance: nextDistance };
  }



  getStartCodeCandidates() {
    const configured = this.config.votingStartCodeCandidates;
    if (Array.isArray(configured) && configured.length) {
      return configured
        .map(value => String(value).trim())
        .filter(Boolean);
    }
    return ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  }

  buildStartTripPayloads(order) {
    const payloads = [];
    const code = getDriverCode(order);
    const voting = isVotingOrder(order);

    if (voting) {
      if (!isEmptyValue(code)) payloads.push({ b_driver_code: code });
      for (const candidate of this.getStartCodeCandidates()) {
        payloads.push({ b_driver_code: candidate });
      }
      if (this.config.votingStartTryWithoutCode === true) payloads.push({});
    } else {
      // Offer and ordinary orders do not require boarding-code validation in this training flow.
      // Press start without code first; if backend still exposes a code, keep it as fallback only.
      payloads.push({});
      if (!isEmptyValue(code) && this.config.nonVotingStartTryCodeFallback !== false) {
        payloads.push({ b_driver_code: code });
      }
    }

    const seen = new Set();
    return payloads.filter(payload => {
      const key = JSON.stringify(payload);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async tryStartTrip(order, reason = 'auto') {
    const movement = this.getMovementConfig();
    const orderId = getOrderId(order);
    if (!orderId || movement.autoStartTrip !== true) return false;

    const now = Date.now();
    const previous = this.activeTripState.get(orderId) || {};
    const retryMs = Number(movement.startRetryMs || 2500);
    if (previous.lastStartAttemptAt && now - previous.lastStartAttemptAt < retryMs) return false;

    this.activeTripState.set(orderId, {
      ...previous,
      stage: 'waiting_start',
      arrivedAt: previous.arrivedAt || now,
      lastStartAttemptAt: now,
    });

    const startPayloads = this.buildStartTripPayloads(order);
    let started = false;
    let lastStartError = null;

    for (const payload of startPayloads) {
      const response = await this.setOrderAction(orderId, ACTIONS.SET_START_STATE, payload);
      if (isBackendError(response)) {
        lastStartError = response;
        continue;
      }
      started = true;
      break;
    }

    if (!started) {
      this.log(`order ${orderId}: start failed (${reason}): ${normalizeErrorMessage(lastStartError)}`);
      return false;
    }

    this.log(`order ${orderId}: trip started (${isVotingOrder(order) ? 'voting code 1-9 / real code' : 'without code'})`);
    this.activeTripState.set(orderId, {
      ...this.activeTripState.get(orderId),
      stage: 'trip_start_requested',
      startedAt: Date.now(),
    });
    return true;
  }

  async simulateActiveOrder(order) {
    const movement = this.getMovementConfig();
    if (movement.enabled === false) return false;

    const orderId = getOrderId(order);
    if (!orderId) return false;

    const driverRecord = findDriverRecord(order, this.car?.c_id, this.user?.u_id);
    const driverState = getDriverState(order, this.car?.c_id, this.user?.u_id);

    if (!driverRecord) {
      return false;
    }

    if (isClosedDriverState(driverState)) {
      this.activeTripState.delete(orderId);
      this.waitingChoiceLogged.delete(orderId);
      this.choiceAssignedBlocked.delete(orderId);
      this.choiceResponseSentAt.delete(orderId);
      return false;
    }

    if (isChoiceOrder(order)) {
      rememberManualChoiceOrder(order);
    }

    if (!isAssignedDriverState(driverState)) {
      // Choice orders must stay as visible candidates until the passenger clicks one of them.
      // Do not move and do not press "arrived" before backend marks this driver as performer.
      if (!this.waitingChoiceLogged.has(orderId)) {
        this.waitingChoiceLogged.add(orderId);
        this.log(`order ${orderId}: candidate is waiting for passenger choice; no auto-accept; state=${driverState ?? 'empty'}`);
      }
      return false;
    }

    if (isChoiceOrder(order)) {
      const minWaitAfterResponseMs = Number(this.config.manualChoiceMinWaitAfterResponseMs ?? 10000);
      const responseSentAt = this.choiceResponseSentAt.get(orderId) || 0;
      if (responseSentAt && Date.now() - responseSentAt < minWaitAfterResponseMs) {
        if (!this.choiceAssignedBlocked.has(orderId)) {
          this.choiceAssignedBlocked.add(orderId);
          this.log(`order ${orderId}: assigned state is paused for candidate collection window`);
        }
        return false;
      }

      if (!isPassengerChoiceSettled(this.config, order, this.car?.c_id, this.user?.u_id)) {
        // This is the main anti-autoselect guard. A chosen driver starts only after the
        // passenger's click is reflected by closed/rejected competitor candidates.
        // Temporary backend auto-performer state is ignored.
        if (!this.choiceAssignedBlocked.has(orderId)) {
          this.choiceAssignedBlocked.add(orderId);
          this.log(`order ${orderId}: assigned state ignored until real passenger choice; ${getChoiceNotSettledReason(this.config, order, this.car?.c_id, this.user?.u_id)}`);
        }
        return false;
      }
    }

    if (hasWaitingChoiceCompetitors(order, this.car?.c_id, this.user?.u_id)) {
      // Some backend/config combinations temporarily mark the first responder as performer
      // even though other candidates are still visible to the passenger. In that state the
      // emulator must not start moving, otherwise it looks like the client was auto-selected.
      if (!this.choiceAssignedBlocked.has(orderId)) {
        this.choiceAssignedBlocked.add(orderId);
        this.log(`order ${orderId}: assigned state is ignored until passenger choice closes other candidates`);
      }
      return false;
    }

    if (this.waitingChoiceLogged.has(orderId) || this.choiceAssignedBlocked.has(orderId)) {
      this.log(`order ${orderId}: passenger selected this driver; starting movement`);
    }
    this.waitingChoiceLogged.delete(orderId);
    this.choiceAssignedBlocked.delete(orderId);

    const pickup = getPointFromOrder(order, 'start');
    const destination = getPointFromOrder(order, 'destination');

    if (driverState < DRIVER_STATES.ARRIVED) {
      const pickupTarget = pickup || getConfiguredFallbackPoint(this.config, this.driver, 'start');
      if (!pickupTarget) {
        this.log(`order ${orderId}: pickup coordinates not found after detail load; ${getCoordinateDebug(order)}`);
        return true;
      }
      if (!pickup) {
        this.log(`order ${orderId}: backend did not return pickup coordinates, using training fallback ${pickupTarget.latitude},${pickupTarget.longitude}; ${getCoordinateDebug(order)}`);
      }
      const result = await this.moveToward(order, pickupTarget, 'pickup', movement.speedToPickupKmh, movement.arriveDistanceMeters);
      if (result.reached && movement.autoArrive !== false) {
        const state = this.activeTripState.get(orderId) || {};
        const reachedAt = state.pickupReachedAt || Date.now();
        this.activeTripState.set(orderId, { ...state, pickupReachedAt: reachedAt });

        const arriveDelayMs = Number(movement.pressArriveAfterPickupMs || 0);
        if (Date.now() - reachedAt < arriveDelayMs) {
          if (!state.pickupWaitLogged) {
            this.activeTripState.set(orderId, { ...this.activeTripState.get(orderId), pickupWaitLogged: true });
            this.log(`order ${orderId}: reached client, waiting ${arriveDelayMs}ms before pressing arrived`);
          }
          return true;
        }

        const response = await this.setOrderAction(orderId, ACTIONS.SET_ARRIVE_STATE);
        if (isBackendError(response)) {
          this.log(`order ${orderId}: arrive failed: ${normalizeErrorMessage(response)}`);
        } else {
          this.log(`order ${orderId}: arrived to client`);
          const previousState = this.activeTripState.get(orderId) || {};
          this.activeTripState.set(orderId, {
            ...previousState,
            stage: 'waiting_start',
            arrivedAt: previousState.arrivedAt || Date.now(),
          });
        }
      }
      return true;
    }

    if (driverState === DRIVER_STATES.ARRIVED) {
      const state = this.activeTripState.get(orderId) || {};
      if (state.stage !== 'waiting_start' && state.stage !== 'trip_start_requested') {
        this.activeTripState.set(orderId, { ...state, stage: 'waiting_start', arrivedAt: state.arrivedAt || Date.now() });
        this.log(`order ${orderId}: arrived; trying to start trip`);
      }

      const arrivedAt = this.activeTripState.get(orderId)?.arrivedAt || Date.now();
      const waitedLongEnough = Date.now() - arrivedAt >= Math.max(7000, Number(movement.startAfterArriveMs || 0));
      if (!waitedLongEnough) return true;

      await this.tryStartTrip(order, 'arrived state');
      return true;
    }

    if (driverState === DRIVER_STATES.STARTED) {
      const destinationTarget = destination || getConfiguredFallbackPoint(this.config, this.driver, 'destination');
      if (!destinationTarget) {
        this.log(`order ${orderId}: destination coordinates not found after detail load; ${getCoordinateDebug(order)}`);
        return true;
      }
      if (!destination) {
        this.log(`order ${orderId}: backend did not return destination coordinates, using training fallback ${destinationTarget.latitude},${destinationTarget.longitude}; ${getCoordinateDebug(order)}`);
      }
      const result = await this.moveToward(order, destinationTarget, 'trip', movement.speedInTripKmh, movement.finishDistanceMeters);
      if (result.reached) {
        if (movement.autoFinishTrip === true) {
          const state = this.activeTripState.get(orderId) || {};
          const reachedAt = state.destinationReachedAt || Date.now();
          this.activeTripState.set(orderId, { ...state, destinationReachedAt: reachedAt });

          const finishDelayMs = Number(movement.finishAfterDestinationMs || 0);
          if (Date.now() - reachedAt < finishDelayMs) {
            if (!state.finishWaitLogged) {
              this.activeTripState.set(orderId, { ...this.activeTripState.get(orderId), finishWaitLogged: true });
              this.log(`order ${orderId}: reached destination, waiting ${finishDelayMs}ms before finish`);
            }
            return true;
          }

          const response = await this.setOrderAction(orderId, ACTIONS.SET_COMPLETE_STATE);
          if (isBackendError(response)) {
            this.log(`order ${orderId}: finish failed: ${normalizeErrorMessage(response)}`);
          } else {
            this.log(`order ${orderId}: trip finished`);
            this.activeTripState.delete(orderId);
          }
        } else {
          this.log(`order ${orderId}: reached destination, waiting manual finish`);
        }
      }
      return true;
    }

    return false;
  }

  getSpawnLocationForOrder(order) {
    const orderId = getOrderId(order);
    if (orderId && this.orderSpawnLocations.has(orderId)) return this.orderSpawnLocations.get(orderId);

    const center = getOrderSpawnCenter(this.config, this.driver, order);
    if (!center) return null;

    const base = randomPointAround(
      center,
      this.config.spawnNearOrderMinMeters ?? 120,
      this.config.spawnNearOrderMaxMeters ?? 620,
    );
    if (orderId && base) this.orderSpawnLocations.set(orderId, base);
    return base;
  }

  getVisiblePickupStartLocation(order, pickupTarget) {
    const orderId = getOrderId(order);
    if (!orderId || !pickupTarget) return null;

    const existing = this.orderSpawnLocations.get(orderId);
    if (existing && distanceMeters(existing, pickupTarget) > Number(this.config.visiblePickupStartMinMeters ?? 700)) return existing;

    const start = randomPointAround(
      pickupTarget,
      this.config.visiblePickupStartMinMeters ?? 900,
      this.config.visiblePickupStartMaxMeters ?? 1500,
    );
    if (start) this.orderSpawnLocations.set(orderId, start);
    return start;
  }

  async spawnNearOrder(order) {
    if (this.config.spawnDriversNearOrder !== true) return;
    const orderId = getOrderId(order);
    const location = this.getSpawnLocationForOrder(order);
    if (!location) return;
    this.currentLocation = location;
    await this.sendLocation(location);
    this.log(`order ${orderId}: spawned near pickup at ${location.latitude},${location.longitude}`);
  }

  getBestCarClassForOrder(order) {
    const required = getOrderRequiredCarClassIds(order);
    if (required.length) return required[0];
    if (this.config.gruzvillFallbackCarClassId) return String(this.config.gruzvillFallbackCarClassId);
    const known = Array.from(KNOWN_ACCEPTED_CAR_CLASS_IDS).filter(Boolean);
    return known[0] || null;
  }

  learnAcceptedCarClass() {
    const currentClassId = getCurrentCarClassId(this.car);
    if (currentClassId) KNOWN_ACCEPTED_CAR_CLASS_IDS.add(String(currentClassId));
  }

  async updateCarClassForOrder(order, reason = 'before response') {
    if (this.config.autoMatchCarClassWithOrder === false || !this.car?.c_id) return false;
    const targetClassId = this.getBestCarClassForOrder(order);
    if (!targetClassId) {
      this.log(`order ${getOrderId(order)}: car class repair skipped: target class is unknown`);
      return false;
    }

    const currentClassId = getCurrentCarClassId(this.car);
    if (currentClassId && String(currentClassId) === String(targetClassId)) {
      KNOWN_ACCEPTED_CAR_CLASS_IDS.add(String(targetClassId));
      return true;
    }

    const updateSessions = [];
    try {
      const managerSession = await getManagerSession(this.config);
      if (managerSession?.token && managerSession?.u_hash) updateSessions.push({ label: 'manager', session: managerSession });
    } catch (error) {
      this.log(`order ${getOrderId(order)}: manager session for car class repair failed: ${stringifyError(error)}`);
    }
    if (this.tokens?.token && this.tokens?.u_hash) updateSessions.push({ label: 'driver', session: this.tokens });

    const editablePayload = getEditableCarPayload(this.car, targetClassId);
    const payloads = [
      // The real frontend edits car class as cc_id inside data JSON.
      // Keep current car fields too, because some backend builds reject too-short partial car edits.
      { data: JSON.stringify(editablePayload) },
      { data: JSON.stringify({ cc_id: String(targetClassId) }) },
      { data: JSON.stringify({ c_class_id: String(targetClassId) }) },
      { data: JSON.stringify({ car_class_id: String(targetClassId) }) },
      { data: JSON.stringify({ cc_id: String(targetClassId), c_class_id: String(targetClassId), car_class_id: String(targetClassId) }) },
      { cc_id: String(targetClassId) },
      { c_class_id: String(targetClassId) },
      { car_class_id: String(targetClassId) },
    ];

    for (const item of updateSessions) {
      for (const payload of payloads) {
        try {
          const response = await apiPostUrlEncoded(this.config.apiBase, `/car/${this.car.c_id}`, {
            token: item.session.token,
            u_hash: item.session.u_hash,
            ...payload,
          });
          if (isBackendError(response)) {
            this.log(`order ${getOrderId(order)}: ${item.label} car class repair skipped: ${normalizeErrorMessage(response)}`);
            continue;
          }
          this.log(`order ${getOrderId(order)}: car class changed ${currentClassId || 'unknown'} -> ${targetClassId} (${reason}, ${item.label})`);
          KNOWN_ACCEPTED_CAR_CLASS_IDS.add(String(targetClassId));
          await this.loadCar().catch(() => null);
          await this.activateDrivenCar().catch(error => this.log(`car re-activate after class repair skipped: ${stringifyError(error)}`));
          return true;
        } catch (error) {
          this.log(`order ${getOrderId(order)}: ${item.label} car class repair failed: ${stringifyError(error)}`);
        }
      }
    }

    return false;
  }

  async sendOrderResponse(order, offer, safe = false) {
    const orderId = getOrderId(order);
    const mode = safe ? 'safe' : String(this.config.offerTransport || 'c_options');
    const data = safe ? buildSafeOfferData(this, offer) : buildOfferData(this, offer, mode);

    // Offer/voting are training choice flows: the emulator only sends a candidate card.
    // It never chooses itself for the passenger. Movement starts only after the passenger selects a driver.
    const waitForPassengerChoice = shouldWaitForPassengerChoice(this.config, order);
    if (waitForPassengerChoice) rememberManualChoiceOrder(order);
    const performerFlag = waitForPassengerChoice ? '0' : '1';
    this.log(`order ${orderId}: send ${waitForPassengerChoice ? 'candidate only, passenger must choose manually' : 'direct performer response'}`);

    return apiPostUrlEncoded(this.config.apiBase, `/drive/get/${orderId}`, this.authFields({
      action: ACTIONS.SET_PERFORMER,
      performer: performerFlag,
      c_pickup_time: offer.eta,
      c_arrival_time: offer.eta,
      c_comment: offer.comment,
      data: JSON.stringify(data),
    }));
  }

  async reactToOrder(order) {
    if (this.disabled) return;
    const orderId = getOrderId(order);
    if (!orderId || this.handled.has(orderId)) return;
    if (this.config.ignoreExistingOrdersOnStart === true && IGNORED_STARTUP_ORDER_IDS.has(orderId)) return;

    const decisionOrder = await this.hydrateOrderForDecision(order);
    if (!shouldHandleOrder(this.config, decisionOrder)) return;

    if (shouldWaitForPassengerChoice(this.config, decisionOrder)) {
      rememberManualChoiceOrder(decisionOrder);
    }

    if (this.car?.c_id && isAlreadyHandledByDriver(decisionOrder, this.car.c_id, this.user?.u_id)) {
      this.handled.add(orderId);
      this.log(`already sent candidate/response for order ${orderId}; waiting for client choice`);
      return;
    }

    if (Math.random() > Number(this.driver.acceptProbability ?? 1)) {
      this.handled.add(orderId);
      this.log(`skip order ${orderId} by probability`);
      return;
    }

    this.handled.add(orderId);
    const [minDelay, maxDelay] = this.driver.reactionDelayMs || [0, 0];
    const baseDelay = randInt(minDelay, maxDelay);
    const choiceFlow = shouldWaitForPassengerChoice(this.config, decisionOrder);
    const collectionDelay = choiceFlow ? Number(this.config.candidateCollectionDelayMs || 0) : 0;
    // For offer/voting training we intentionally do not answer instantly: all configured
    // test drivers need a short window to see the same new order and send their own candidate cards.
    // This is not auto-selection; the passenger still chooses only by pressing the card button.
    const delay = choiceFlow ? Math.max(baseDelay, collectionDelay) : baseDelay;
    const offer = getOfferForDriver(this.config, this.driver, decisionOrder);

    if (this.config.autoMatchCarClassWithOrder !== false) {
      await this.updateCarClassForOrder(decisionOrder, 'before sending response').catch(error => {
        this.log(`order ${orderId}: car class pre-repair skipped: ${stringifyError(error)}`);
      });
    }

    if (choiceFlow && this.config.spawnNearOrderBeforeResponse !== false) {
      await this.spawnNearOrder(decisionOrder).catch(error => this.log(`order ${orderId}: spawn near order skipped: ${stringifyError(error)}`));
    }

    this.log(`found order ${orderId}; wait ${delay}ms; price=${offer.price}; eta=${offer.eta}; comment=${offer.comment}`);
    await sleep(delay);

    if (this.config.dryRun || args.has('--dry')) {
      this.log(`dry run: would send response to order ${orderId}`);
      return;
    }

    try {
      const response = await this.sendOrderResponse(decisionOrder, offer, false);
      if (isBackendError(response)) {
        if (isWrongDriverCarClass(response) && this.config.retryWrongCarClassAfterRepair !== false) {
          this.log(`order ${orderId}: backend rejected car class. trying to repair car class and retry`);
          const repaired = await this.updateCarClassForOrder(decisionOrder, 'after backend wrong class');
          if (repaired) {
            const fixedResponse = await this.sendOrderResponse(decisionOrder, offer, false);
            if (!isBackendError(fixedResponse)) {
              if (shouldWaitForPassengerChoice(this.config, decisionOrder)) this.choiceResponseSentAt.set(orderId, Date.now());
              this.learnAcceptedCarClass();
              this.log(`sent response to order ${orderId} after car class repair`);
              return;
            }
            if (hasWrongCOptionsKeys(fixedResponse) && this.config.retrySafeOnWrongCOptions) {
              const fixedSafeResponse = await this.sendOrderResponse(decisionOrder, offer, true);
              if (!isBackendError(fixedSafeResponse)) {
                if (shouldWaitForPassengerChoice(this.config, decisionOrder)) this.choiceResponseSentAt.set(orderId, Date.now());
                this.learnAcceptedCarClass();
                this.log(`sent SAFE price-only response to order ${orderId} after car class repair`);
                return;
              }
              this.log(`safe send after car class repair failed for order ${orderId}: ${normalizeErrorMessage(fixedSafeResponse)}`);
            } else {
              this.log(`send after car class repair failed for order ${orderId}: ${normalizeErrorMessage(fixedResponse)}`);
            }
          }
          this.handled.delete(orderId);
          return;
        }
        if (hasWrongCOptionsKeys(response) && this.config.retrySafeOnWrongCOptions) {
          this.log(`backend rejected c_options (${normalizeErrorMessage(response)}). retry safe price-only response`);
          const safeResponse = await this.sendOrderResponse(decisionOrder, offer, true);
          if (isBackendError(safeResponse)) {
            this.log(`safe send failed for order ${orderId}: ${normalizeErrorMessage(safeResponse)}`);
            if (isWrongUserCheckState(safeResponse)) {
              this.disabled = true;
              this.log('disabled: backend says wrong user check state; this account is not approved for driver orders. Other ready drivers continue working.');
            } else {
              this.handled.delete(orderId);
            }
            return;
          }
          if (shouldWaitForPassengerChoice(this.config, decisionOrder)) this.choiceResponseSentAt.set(orderId, Date.now());
          this.learnAcceptedCarClass();
          this.log(`sent SAFE price-only response to order ${orderId}`);
          return;
        }
        this.log(`send failed for order ${orderId}: ${normalizeErrorMessage(response)}`);
        if (isWrongUserCheckState(response)) {
          this.disabled = true;
          this.log('disabled: backend says wrong user check state; this account is not approved for driver orders. Other ready drivers continue working.');
        } else {
          this.handled.delete(orderId);
        }
        return;
      }
      if (shouldWaitForPassengerChoice(this.config, decisionOrder)) this.choiceResponseSentAt.set(orderId, Date.now());
      this.log(`sent response to order ${orderId}`);
    } catch (error) {
      if (isWrongDriverCarClass(error) && this.config.retryWrongCarClassAfterRepair !== false) {
        this.log(`order ${orderId}: request rejected car class. trying to repair car class and retry: ${stringifyError(error)}`);
        const repaired = await this.updateCarClassForOrder(decisionOrder, 'after request wrong class');
        if (repaired) {
          const fixedResponse = await this.sendOrderResponse(decisionOrder, offer, true);
          if (!isBackendError(fixedResponse)) {
            if (shouldWaitForPassengerChoice(this.config, decisionOrder)) this.choiceResponseSentAt.set(orderId, Date.now());
            this.learnAcceptedCarClass();
            this.log(`sent SAFE price-only response to order ${orderId} after car class repair`);
            return;
          }
          this.log(`safe send after car class repair failed for order ${orderId}: ${normalizeErrorMessage(fixedResponse)}`);
        }
        this.handled.delete(orderId);
        return;
      }
      if (hasWrongCOptionsKeys(error) && this.config.retrySafeOnWrongCOptions) {
        this.log(`request error with c_options. retry safe price-only response: ${stringifyError(error)}`);
        const safeResponse = await this.sendOrderResponse(decisionOrder, offer, true);
        if (isBackendError(safeResponse)) {
          this.log(`safe send failed for order ${orderId}: ${normalizeErrorMessage(safeResponse)}`);
          this.handled.delete(orderId);
          return;
        }
        if (shouldWaitForPassengerChoice(this.config, decisionOrder)) this.choiceResponseSentAt.set(orderId, Date.now());
        this.learnAcceptedCarClass();
        this.log(`sent SAFE price-only response to order ${orderId}`);
        return;
      }
      throw error;
    }
  }

  async tick() {
    if (this.disabled) return;

    const activeOrders = await this.getActiveOrders().catch(error => {
      this.log(`active orders load failed: ${stringifyError(error)}`);
      return [];
    });

    const activeForDriver = activeOrders.filter(order => findDriverRecord(order, this.car?.c_id, this.user?.u_id));
    const assignedForDriver = activeForDriver.filter(order => isAssignedDriverState(getDriverState(order, this.car?.c_id, this.user?.u_id)));
    const waitingForClientChoice = activeForDriver.filter(order => {
      const state = getDriverState(order, this.car?.c_id, this.user?.u_id);
      return !isAssignedDriverState(state) && !isClosedDriverState(state);
    });

    if (activeForDriver.length) {
      this.log(`active responses=${activeForDriver.length}, assigned=${assignedForDriver.length}, waiting_choice=${waitingForClientChoice.length}`);
    }

    // If backend gives the order only in /drive, still send the first candidate/response from there.
    const notRespondedActiveOrders = activeOrders.filter(order =>
      shouldHandleOrder(this.config, order) &&
      !isAlreadyHandledByDriver(order, this.car?.c_id, this.user?.u_id)
    );
    if (notRespondedActiveOrders.length) {
      await Promise.allSettled(notRespondedActiveOrders.map(order => this.reactToOrder(order)));
    }

    for (const order of assignedForDriver) {
      const handledActive = await this.simulateActiveOrder(order);
      if (handledActive) return;
    }

    for (const order of waitingForClientChoice) {
      await this.simulateActiveOrder(order);
    }

    if (this.config.sendDriverLocation !== false) {
      const interval = Number(this.config.locationIntervalMs || 20000);
      if (!this.lastLocationSentAt || Date.now() - this.lastLocationSentAt >= interval) {
        await this.sendLocation();
      }
    }

    const orders = await this.getReadyOrders();
    if (this.config.logRawOrders) {
      this.log(`raw orders: ${JSON.stringify(orders.slice(0, 3), null, 2)}`);
    }
    const suitable = orders.filter(order => shouldHandleOrder(this.config, order));
    this.log(`orders=${orders.length}, suitable=${suitable.length}`);
    await Promise.allSettled(suitable.map(order => this.reactToOrder(order)));
  }

  async loop({ once = false } = {}) {
    this.running = true;
    while (this.running) {
      try {
        await this.tick();
      } catch (error) {
        this.log(`error: ${stringifyError(error)}`);
      }
      if (once) break;
      await sleep(Number(this.config.pollIntervalMs || 3000));
    }
  }
}

async function main() {
  let config = readConfig();
  let drivers = await prepareDriversList(config, 'startup');

  if (!drivers.length) {
    throw new Error(`No drivers found. Automatic registration could not prepare drivers. Check backend answers in driver-emulator/data/registration-last-result.json. Root: ${rootDir}`);
  }

  console.log('Taxi driver simulator started');
  console.log(`API: ${config.apiBase}`);
  console.log(`Drivers configured: ${drivers.length}`);
  console.log(`Target ready drivers: ${getAutoRegisterTarget(config) || 'not set'}`);
  console.log(`Auto register: ${canAutoRegisterDrivers(config) ? 'on' : 'off'}`);
  console.log(`Order type: ${config.orderType || 'all'}`);
  console.log(`Offer transport: ${config.offerTransport || 'c_options'}`);

  let bots = drivers.map((driver, index) => new DriverBot(config, driver, index));
  console.log('Driver locations:');
  bots.forEach(bot => {
    const location = bot.getDriverLocation();
    console.log(`- ${bot.name}: ${location ? `${location.latitude},${location.longitude}` : 'not set'}`);
  });

  bots = await initBots(config, drivers);
  let readyBots = bots.filter(bot => bot.tokens && bot.car);

  const targetReady = getAutoRegisterTarget(config);
  if (canAutoRegisterDrivers(config) && targetReady && readyBots.length < targetReady) {
    const need = targetReady - readyBots.length;
    console.log(`Ready bots after first init: ${readyBots.length}/${bots.length}. Auto-creating ${need} missing test driver(s)...`);
    const registerResult = await runRegisterDrivers(need, 'ready bots below target');

    if (registerResult.ok) {
      config = readConfig();
      drivers = getDriversFromConfig(config);
      console.log(`Reloaded drivers after auto-registration: ${drivers.length}`);
      bots = await initBots(config, drivers);
      readyBots = bots.filter(bot => bot.tokens && bot.car);
    } else {
      console.log('Auto-registration did not finish successfully. Continuing with drivers that are already ready.');
    }
  }

  if (args.has('--check')) {
    console.log(`Check finished. Ready bots: ${readyBots.length}/${bots.length}`);
    if (targetReady && readyBots.length < targetReady) {
      console.log(`Not enough ready bots for full training list: ${readyBots.length}/${targetReady}. See data/registration-last-result.json if auto-registration failed.`);
    }
    return;
  }

  if (!readyBots.length) {
    throw new Error('No ready bots. Automatic registration failed or backend did not create cars. Check driver-emulator/data/registration-last-result.json.');
  }

  const once = args.has('--once');
  await Promise.all(readyBots.map(bot => bot.loop({ once })));
}

process.on('SIGINT', () => {
  console.log('\nStopped');
  process.exit(0);
});

main().catch(error => {
  console.error(stringifyError(error));
  process.exit(1);
});
