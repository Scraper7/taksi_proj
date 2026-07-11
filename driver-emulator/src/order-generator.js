/* eslint-disable no-console */
const {
  readConfig,
  apiPostUrlEncoded,
  isBackendError,
  stringifyError,
  normalizeErrorMessage,
  pick,
  randInt,
} = require('./common');

const args = process.argv.slice(2);

function getArgValue(name, fallback = null) {
  const direct = args.find(item => item.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) return args[index + 1];
  return fallback;
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function toNumber(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(String(value).replace(',', '.'));
  return Number.isFinite(number) ? number : fallback;
}

function formatStartDatetime(offsetMinutes = 2) {
  const date = new Date(Date.now() + Number(offsetMinutes || 0) * 60000);
  const pad = value => String(value).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const timezoneOffset = -date.getTimezoneOffset();
  const sign = timezoneOffset >= 0 ? '+' : '-';
  const absOffset = Math.abs(timezoneOffset);
  const offsetHours = pad(Math.floor(absOffset / 60));
  const offsetMinutesPart = pad(absOffset % 60);
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}${sign}${offsetHours}:${offsetMinutesPart}`;
}

function safeString(value, fallback = '') {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value);
}

async function loginSession(apiBase, account, label = 'client') {
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

function getGeneratorConfig(config) {
  const generator = config.orderGenerator || {};
  return {
    enabled: generator.enabled !== false,
    defaultMode: generator.defaultMode || 'offer',
    modeSequence: Array.isArray(generator.modeSequence) && generator.modeSequence.length ? generator.modeSequence : ['order', 'voting', 'offer'],
    clients: Array.isArray(generator.clients) ? generator.clients : [],
    useManagerAsClient: generator.useManagerAsClient !== false,
    count: Number(generator.count || 1) || 1,
    startDelayMinutes: Number(generator.startDelayMinutes || 2) || 2,
    customerPrice: generator.customerPrice || [280, 420],
    contactPhone: generator.contactPhone || '+70000000000',
    passengersCount: generator.passengersCount || 1,
    carClass: generator.carClass,
    locationClass: generator.locationClass,
    cityLocationClass: generator.cityLocationClass,
    intercityLocationClass: generator.intercityLocationClass,
    paymentWay: generator.paymentWay || 1,
    maxWaiting: generator.maxWaiting || 7200,
    retryWithoutClass: generator.retryWithoutClass !== false,
    retryWithClass: generator.retryWithClass || 1,
    confirmAfterCreate: generator.confirmAfterCreate === true,
    points: Array.isArray(generator.points) ? generator.points : [],
    comments: Array.isArray(generator.comments) ? generator.comments : [],
  };
}

function getClients(config, generator) {
  const clients = [...generator.clients].filter(item => item?.login && item?.password);
  const manager = config.managerApproval;
  if (!clients.length && generator.useManagerAsClient && manager?.login && manager?.password) {
    clients.push({
      name: 'Gruzvill Client',
      login: manager.login,
      password: manager.password,
      type: manager.type || 'e-mail',
    });
  }
  return clients;
}

function defaultPoints() {
  return [
    {
      from: {
        address: 'улица Ерёменко, 4-й мкр, 6-й мкр, Левенцовский район',
        shortAddress: 'улица Ерёменко',
        latitude: 47.230861,
        longitude: 39.589223,
      },
      to: {
        address: 'проспект Солженицына, 3-й мкр, 6-й мкр, Левенцовский район',
        shortAddress: 'проспект Солженицына',
        latitude: 47.236102,
        longitude: 39.604732,
      },
    },
    {
      from: {
        address: 'улица Доватора, Северо-Западный район',
        shortAddress: 'улица Доватора',
        latitude: 47.224674,
        longitude: 39.606437,
      },
      to: {
        address: 'MaxMarket, 108 с1, улица Ерёменко',
        shortAddress: 'MaxMarket',
        latitude: 47.231479,
        longitude: 39.586964,
      },
    },
    {
      from: {
        address: 'Левенцовский район, Ростов-на-Дону',
        shortAddress: 'Левенцовский район',
        latitude: 47.22937,
        longitude: 39.58591,
      },
      to: {
        address: 'Северо-Западный район, Ростов-на-Дону',
        shortAddress: 'Северо-Западный район',
        latitude: 47.24414,
        longitude: 39.60981,
      },
    },
  ];
}

function jitterPoint(point, meters = 240) {
  const lat = Number(point?.latitude);
  const lon = Number(point?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return point;
  const angle = Math.random() * Math.PI * 2;
  const radius = randInt(40, meters);
  const latOffset = Math.cos(angle) * radius / 111320;
  const lonOffset = Math.sin(angle) * radius / (111320 * Math.cos(lat * Math.PI / 180));
  return {
    ...point,
    latitude: Number((lat + latOffset).toFixed(6)),
    longitude: Number((lon + lonOffset).toFixed(6)),
  };
}

function getPrice(range) {
  if (Array.isArray(range)) return randInt(Number(range[0] || 250), Number(range[1] || range[0] || 350));
  const fixed = Number(range);
  return Number.isFinite(fixed) && fixed > 0 ? fixed : randInt(280, 420);
}

function getModeForOrder(generator, modeArg = null, index = 0) {
  if (modeArg) return String(modeArg).toLowerCase();
  const sequence = Array.isArray(generator.modeSequence) && generator.modeSequence.length ? generator.modeSequence : [];
  return String(sequence[index % sequence.length] || generator.defaultMode || 'offer').toLowerCase();
}

function buildOrderPayload(generator, modeArg = null, index = 0) {
  const mode = getModeForOrder(generator, modeArg, index);
  const points = generator.points.length ? generator.points : defaultPoints();
  const selected = pick(points, points[0]);
  const from = jitterPoint(selected.from);
  const to = jitterPoint(selected.to);
  const price = getPrice(generator.customerPrice);
  const comment = pick(generator.comments, 'Тестовый заказ для проверки водителей');

  const payload = {
    b_start_address: safeString(from.address, 'Адрес подачи'),
    b_start_latitude: safeString(from.latitude),
    b_start_longitude: safeString(from.longitude),
    b_destination_address: safeString(to.address, 'Адрес назначения'),
    b_destination_latitude: safeString(to.latitude),
    b_destination_longitude: safeString(to.longitude),
    b_contact: generator.contactPhone,
    b_start_datetime: formatStartDatetime(generator.startDelayMinutes),
    b_passengers_count: generator.passengersCount,
    b_payment_way: generator.paymentWay,
    b_max_waiting: generator.maxWaiting,
    b_options: {
      fromShortAddress: from.shortAddress || from.address,
      toShortAddress: to.shortAddress || to.address,
      customer_price: price,
    },
  };

  if (comment) payload.b_custom_comment = comment;
  const locationClass = (mode === 'offer' || mode === 'intercity' || mode === 'manual') ?
    (generator.intercityLocationClass ?? generator.locationClass) :
    (generator.cityLocationClass ?? generator.locationClass);

  if (generator.carClass !== null && generator.carClass !== undefined && generator.carClass !== '') payload.b_car_class = generator.carClass;
  if (locationClass !== null && locationClass !== undefined && locationClass !== '') payload.b_location_class = locationClass;

  if (mode === 'offer' || mode === 'intercity' || mode === 'manual') {
    payload.b_cars_count = 0;
  }

  if (mode === 'voting') {
    payload.b_voting = 1;
    payload.b_services = [5];
  }

  return { payload, meta: { mode, price, from, to } };
}

async function postDrive(apiBase, session, payload) {
  return apiPostUrlEncoded(apiBase, '/drive', {
    token: session.token,
    u_hash: session.u_hash,
    data: JSON.stringify(payload),
  });
}

async function confirmOrder(apiBase, session, orderId) {
  if (!orderId) return null;
  return apiPostUrlEncoded(apiBase, `/drive/get/${orderId}`, {
    token: session.token,
    u_hash: session.u_hash,
    action: 'set_confirm_state',
  });
}

function extractOrderId(response) {
  return response?.data?.b_id || response?.b_id || response?.data?.booking_id || response?.booking_id || response?.id || null;
}

async function createOrder(config, generator, client, index, mode) {
  const label = client.name || client.login || `client ${index + 1}`;
  console.log(`[order-generator] login client: ${label}`);
  const session = await loginSession(config.apiBase, client, label);
  const { payload, meta } = buildOrderPayload(generator, mode, index);

  const attempts = [payload];
  if (generator.retryWithoutClass && payload.b_car_class !== undefined) {
    const withoutClass = { ...payload };
    delete withoutClass.b_car_class;
    attempts.push(withoutClass);
  }
  if (generator.retryWithClass !== null && generator.retryWithClass !== undefined && payload.b_car_class === undefined) {
    attempts.push({ ...payload, b_car_class: generator.retryWithClass });
  }

  let lastError = null;
  for (const attempt of attempts) {
    try {
      const response = await postDrive(config.apiBase, session, attempt);
      if (isBackendError(response)) {
        lastError = new Error(normalizeErrorMessage(response));
        console.log(`[order-generator] backend rejected order: ${normalizeErrorMessage(response)}`);
        continue;
      }

      const orderId = extractOrderId(response);
      if (generator.confirmAfterCreate && orderId) {
        try { await confirmOrder(config.apiBase, session, orderId); } catch (error) { console.log(`[order-generator] confirm skipped: ${stringifyError(error)}`); }
      }

      console.log(`[order-generator] created order ${orderId || '(id unknown)'}; mode=${meta.mode}; price=${meta.price}; from=${meta.from.shortAddress || meta.from.address}; to=${meta.to.shortAddress || meta.to.address}`);
      return { ok: true, orderId, response };
    } catch (error) {
      lastError = error;
      console.log(`[order-generator] create failed: ${stringifyError(error)}`);
    }
  }

  throw lastError || new Error('order create failed');
}

async function main() {
  const config = readConfig();
  const generator = getGeneratorConfig(config);
  if (!generator.enabled) {
    console.log('[order-generator] disabled in config.orderGenerator.enabled=false');
    return;
  }

  const clients = getClients(config, generator);
  if (!clients.length) {
    throw new Error('No test clients configured. Add config.orderGenerator.clients[] or enable useManagerAsClient.');
  }

  const count = Math.max(1, Math.min(20, Number(getArgValue('--count', generator.count)) || generator.count || 1));
  const mode = getArgValue('--mode', generator.defaultMode);
  console.log(`[order-generator] API: ${config.apiBase}`);
  console.log(`[order-generator] mode=${mode}; count=${count}; clients=${clients.length}`);

  for (let i = 0; i < count; i += 1) {
    const client = clients[i % clients.length];
    await createOrder(config, generator, client, i, mode);
  }
}

main().catch(error => {
  console.error(`[order-generator] failed: ${stringifyError(error)}`);
  process.exit(1);
});
