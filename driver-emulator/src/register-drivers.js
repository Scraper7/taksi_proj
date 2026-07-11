/* eslint-disable no-console */
const {
  readConfig,
  readJson,
  writeJson,
  resolveProjectPath,
  apiPostFormData,
  apiPostUrlEncoded,
  isBackendError,
  normalizeErrorMessage,
  stringifyError,
} = require('./common');

const argvRaw = process.argv.slice(2);
const args = new Set(argvRaw);

function getArgValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const direct = argvRaw.find(item => item.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const index = argvRaw.indexOf(`--${name}`);
  if (index >= 0 && argvRaw[index + 1] && !argvRaw[index + 1].startsWith('--')) return argvRaw[index + 1];
  return fallback;
}

function padIndex(value) {
  return String(value).padStart(3, '0');
}

function makeRunId(reg) {
  if (reg.runId) return String(reg.runId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
  const now = new Date();
  const stamp = [
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  return stamp;
}

function normalizeCarTemplate(value) {
  if (!value || typeof value !== 'object') return null;

  const cmId = value.cm_id ?? value.carModelId ?? value.model_id ?? value.modelId ?? value.car_model_id;
  const ccId = value.cc_id ?? value.carClassId ?? value.class_id ?? value.classId ?? value.car_class_id;
  if (cmId === undefined || cmId === null || cmId === '' || ccId === undefined || ccId === null || ccId === '') {
    return null;
  }

  return {
    cm_id: String(cmId),
    cc_id: String(ccId),
    seats: Number(value.seats || value.carSeats || 4) || 4,
    details: value.details && typeof value.details === 'object' ? value.details : {},
  };
}

function getConfiguredCarTemplates(reg) {
  const templates = [];
  if (Array.isArray(reg.carTemplates)) {
    for (const item of reg.carTemplates) {
      const template = normalizeCarTemplate(item);
      if (template) templates.push(template);
    }
  }

  const direct = normalizeCarTemplate({
    cm_id: reg.carModelId,
    cc_id: reg.carClassId,
    seats: reg.carSeats,
  });
  if (direct) templates.push(direct);

  const seen = new Set();
  return templates.filter(template => {
    const key = `${template.cm_id}|${template.cc_id}|${template.seats}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function makeDriverInput(reg, index, runId, template) {
  const padded = padIndex(index);
  const useUnique = reg.uniquePerRun !== false;
  const suffix = useUnique ? `_${runId}` : '';
  const phoneSuffix = useUnique ? `${runId}${padded}` : padded;
  const carSuffix = useUnique ? `${runId.slice(-5)}${padded}` : padded;

  return {
    name: `${reg.namePrefix || 'Gruzvill Driver'} ${padded}`,
    phone: `${reg.phonePrefix || '+1000'}${phoneSuffix}`,
    email: `${reg.emailPrefix || 'testdriver'}${suffix}_${padded}@${reg.emailDomain || 'ibronevik.ru'}`,
    password: reg.password || 'Test123456',
    refCode: reg.refCode || undefined,
    carModelId: String(template?.cm_id || reg.carModelId || '1'),
    carSeats: Number(template?.seats || reg.carSeats || 4),
    carNumber: `${reg.carNumberPrefix || 'T'}${carSuffix}`.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12),
    carClassId: String(template?.cc_id || reg.carClassId || '1'),
    carDetails: template?.details || {},
    acceptProbability: Number(reg.acceptProbability ?? 1),
    reactionDelayMs: reg.reactionDelayMs || [1000, 6000],
    priceDelta: reg.priceDelta || [0, 50],
  };
}

function errorText(errorOrResponse) {
  return String(normalizeErrorMessage(errorOrResponse) || stringifyError(errorOrResponse)).toLowerCase();
}

function isBusyUserData(error) {
  const text = errorText(error);
  return text.includes('busy user data') || text.includes('duplicate') || text.includes('already') || text.includes('существ');
}

function isForeignKeyOrInsertError(errorOrResponse) {
  const text = errorText(errorOrResponse);
  return text.includes('db insert failed') || text.includes('foreign') || text.includes('fk') || text.includes('constraint');
}

function pickUsersFromConfig(config) {
  const result = [];
  const filePath = resolveProjectPath(config.driversFile || 'data/registered-drivers.json');
  const fileDrivers = readJson(filePath, []);
  if (Array.isArray(fileDrivers)) result.push(...fileDrivers);
  if (Array.isArray(config.drivers)) result.push(...config.drivers);

  const seen = new Set();
  return result.filter(driver => {
    const key = `${driver.login}|${driver.type || 'e-mail'}`;
    if (!driver.login || !driver.password || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function loginDriver(apiBase, driver) {
  const auth = await apiPostUrlEncoded(apiBase, '/auth', {
    login: driver.login,
    password: driver.password,
    type: driver.type || 'e-mail',
    au: 'f',
  });
  if (auth?.message === 'wrong login' || auth?.message === 'wrong password' || !auth?.auth_hash) {
    throw new Error(`login failed: ${auth?.message || JSON.stringify(auth)}`);
  }

  const tokenResponse = await apiPostUrlEncoded(apiBase, '/token', { auth_hash: auth.auth_hash });
  const token = tokenResponse?.data?.token;
  const uHash = tokenResponse?.data?.u_hash;
  if (!token || !uHash) throw new Error(`token failed: ${JSON.stringify(tokenResponse)}`);

  return {
    token,
    u_hash: uHash,
    user: auth.auth_user || tokenResponse.auth_user || tokenResponse?.data?.user || null,
  };
}

function firstCarFromResponse(response) {
  const cars = response?.data?.car ?? response?.car ?? response?.data?.cars;
  if (Array.isArray(cars)) return cars[0] || null;
  if (cars && typeof cars === 'object') return Object.values(cars)[0] || null;
  return null;
}

async function loadCarForLoggedDriver(apiBase, session) {
  const userId = session.user?.u_id;
  if (!userId) return null;
  const response = await apiPostUrlEncoded(apiBase, `/user/${userId}/car`, {
    token: session.token,
    u_hash: session.u_hash,
    array_type: 'list',
  });
  return firstCarFromResponse(response);
}

async function activateRegisteredDriver(apiBase, session) {
  if (!session?.token || !session?.u_hash) return;

  try {
    const response = await apiPostUrlEncoded(apiBase, '/user', {
      token: session.token,
      u_hash: session.u_hash,
      data: JSON.stringify({ u_active: 1 }),
    });

    if (isBackendError(response)) {
      console.log(`DRIVER ACTIVATE SKIPPED: ${normalizeErrorMessage(response)}`);
    } else {
      console.log('DRIVER ACTIVATED/ONLINE');
    }
  } catch (error) {
    console.log(`DRIVER ACTIVATE SKIPPED: ${stringifyError(error)}`);
  }
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

async function loadAuthorizedUser(apiBase, session) {
  const response = await apiPostUrlEncoded(apiBase, '/user/authorized', {
    token: session.token,
    u_hash: session.u_hash,
    array_type: 'list',
  });
  const users = response?.data?.user ?? response?.user;
  if (Array.isArray(users)) return users[0] || null;
  if (users && typeof users === 'object') return Object.values(users)[0] || null;
  return response?.data?.auth_user || response?.auth_user || session.user || null;
}

async function tryApproveRegisteredDriver(apiBase, session, reg) {
  if (reg.autoApproveCreatedDrivers === false) return;

  const payloads = [
    { u_check_state: 2, u_active: 1 },
    { check_state: 2, u_active: 1 },
    { u_check: 2, u_active: 1 },
  ];

  for (const data of payloads) {
    try {
      const response = await apiPostUrlEncoded(apiBase, '/user', {
        token: session.token,
        u_hash: session.u_hash,
        data: JSON.stringify(data),
      });
      if (!isBackendError(response) || normalizeErrorMessage(response) === 'user or modified data not found') {
        console.log(`DRIVER CHECK APPROVE TRY OK: ${JSON.stringify(data)}`);
      } else {
        console.log(`DRIVER CHECK APPROVE TRY SKIPPED: ${normalizeErrorMessage(response)}`);
      }
    } catch (error) {
      console.log(`DRIVER CHECK APPROVE TRY FAILED: ${stringifyError(error)}`);
    }
  }

  try {
    session.user = await loadAuthorizedUser(apiBase, session) || session.user;
    console.log(`DRIVER CHECK STATE AFTER APPROVE: ${getUserCheckState(session.user) ?? 'unknown'}`);
  } catch (error) {
    console.log(`DRIVER CHECK STATE RELOAD FAILED: ${stringifyError(error)}`);
  }
}

async function tryApproveCar(apiBase, session, car, reg) {
  if (reg.autoApproveCreatedDrivers === false || !car?.c_id) return car;

  const payloads = [
    { c_check_state: 2 },
    { check_state: 2 },
    { c_check: 2 },
    { state: 2 },
  ];

  for (const data of payloads) {
    try {
      const response = await apiPostUrlEncoded(apiBase, `/car/${car.c_id}`, {
        token: session.token,
        u_hash: session.u_hash,
        data: JSON.stringify(data),
      });
      if (!isBackendError(response) || normalizeErrorMessage(response) === 'user or modified data not found') {
        console.log(`CAR CHECK APPROVE TRY OK: c_id=${car.c_id}; ${JSON.stringify(data)}`);
      } else {
        console.log(`CAR CHECK APPROVE TRY SKIPPED: ${normalizeErrorMessage(response)}`);
      }
    } catch (error) {
      console.log(`CAR CHECK APPROVE TRY FAILED: ${stringifyError(error)}`);
    }
  }

  const reloaded = await loadCarForLoggedDriver(apiBase, session).catch(() => null);
  const nextCar = reloaded || car;
  console.log(`CAR CHECK STATE AFTER APPROVE: ${getCarCheckState(nextCar) ?? 'unknown'}`);
  return nextCar;
}

async function learnCarTemplates(config) {
  const reg = config.registration || {};
  const templates = getConfiguredCarTemplates(reg);
  if (reg.copyCarTemplateFromExistingDrivers === false) return templates;

  const existingDrivers = pickUsersFromConfig(config);
  for (const driver of existingDrivers) {
    try {
      const session = await loginDriver(config.apiBase, driver);
      const car = await loadCarForLoggedDriver(config.apiBase, session);
      const template = normalizeCarTemplate(car);
      if (template) {
        const key = `${template.cm_id}|${template.cc_id}|${template.seats}`;
        if (!templates.some(item => `${item.cm_id}|${item.cc_id}|${item.seats}` === key)) {
          templates.unshift(template);
          console.log(`CAR TEMPLATE FROM ${driver.login}: cm_id=${template.cm_id}, cc_id=${template.cc_id}, seats=${template.seats}`);
        }
      }
    } catch (error) {
      console.log(`CAR TEMPLATE SKIPPED ${driver.login}: ${stringifyError(error)}`);
    }
  }

  return templates.length ? templates : [{ cm_id: '1', cc_id: '1', seats: Number(reg.carSeats || 4), details: {} }];
}

async function registerUser(apiBase, input) {
  const fields = {
    u_name: input.name,
    u_phone: input.phone,
    u_email: input.email,
    u_role: '2',
    st: '1',
    data: JSON.stringify({
      password: input.password,
      // Backend may ignore these, but if test mode allows self-approval the new driver becomes usable immediately.
      u_check_state: 2,
      u_active: 1,
    }),
    ref_code: input.refCode,
  };

  // Do not send u_city here. Backend confirmed city is extra for this registration flow.
  const registerResponse = await apiPostFormData(apiBase, '/register', fields);
  console.log('REGISTER RESPONSE:', JSON.stringify(registerResponse));

  if (registerResponse.status === 'error') {
    throw new Error(registerResponse.message || 'Driver registration failed');
  }

  const driverData = registerResponse.data || registerResponse.user || registerResponse;
  if (!driverData?.token || !driverData?.u_hash) {
    throw new Error('Driver registered, but token/u_hash not returned');
  }

  return driverData;
}

function makeCarPayload(input, plate) {
  return {
    cm_id: input.carModelId,
    seats: input.carSeats,
    registration_plate: plate || input.carNumber,
    photo: '',
    details: input.carDetails || {},
    cc_id: input.carClassId,
  };
}

function createdCarFromResponse(response) {
  return response?.data?.created_car || response?.data?.car || response?.data || response?.created_car || null;
}

async function createCarForDriver(apiBase, driverData, input, reg) {
  const userId = driverData?.user?.u_id || driverData?.auth_user?.u_id || driverData?.u_id;
  const plateAttempts = Math.max(1, Number(reg.carPlateAttempts || 8));
  const endpointModes = userId ? ['user', 'authorized'] : ['authorized'];
  let lastError = null;

  for (let attempt = 0; attempt < plateAttempts; attempt += 1) {
    const plate = attempt === 0 ? input.carNumber : `${input.carNumber}${attempt}`.slice(0, 12);
    const data = makeCarPayload(input, plate);

    for (const endpointMode of endpointModes) {
      const endpoint = endpointMode === 'user' ? `/user/${userId}/car` : '/car';
      const response = await apiPostFormData(apiBase, endpoint, {
        token: driverData.token,
        u_hash: driverData.u_hash,
        data: JSON.stringify(data),
      });
      console.log(`CAR RESPONSE ${endpoint} ${plate}:`, JSON.stringify(response));

      if (!isBackendError(response) && !(response.code && String(response.code) !== '200')) {
        return {
          car: createdCarFromResponse(response),
          plate,
        };
      }

      lastError = response;
      const text = errorText(response);
      if (text.includes('number') || text.includes('plate') || text.includes('номер') || text.includes('duplicate')) {
        break;
      }
      if (isForeignKeyOrInsertError(response)) {
        // No point retrying another endpoint with the same invalid FK; caller will try next template.
        throw new Error(normalizeErrorMessage(response) || 'Car creation failed: invalid FK/template');
      }
    }
  }

  throw new Error(normalizeErrorMessage(lastError) || 'Car creation failed');
}

async function ensureExistingDriver(apiBase, input, reg) {
  const session = await loginDriver(apiBase, {
    login: input.email,
    password: input.password,
    type: 'e-mail',
  });
  await activateRegisteredDriver(apiBase, session);
  await tryApproveRegisteredDriver(apiBase, session, reg);
  let car = await loadCarForLoggedDriver(apiBase, session);
  let plate = car?.registration_plate || input.carNumber;

  if (!car && reg.createCarForExistingGeneratedUsers !== false) {
    const created = await createCarForDriver(apiBase, session, input, reg);
    car = await tryApproveCar(apiBase, session, created.car, reg);
    plate = created.plate;
  }

  return {
    driverData: session,
    car,
    plate,
  };
}

async function registerTestDriver(apiBase, input, reg) {
  console.log(`REGISTER DRIVER: ${input.email}`);

  let driverData;
  try {
    driverData = await registerUser(apiBase, input);
  } catch (error) {
    if (isBusyUserData(error) && reg.reuseExistingGeneratedUsers !== false) {
      console.log(`USER EXISTS, TRY LOGIN: ${input.email}`);
      const existing = await ensureExistingDriver(apiBase, input, reg);
      return {
        name: input.name,
        login: input.email,
        phone: input.phone,
        password: input.password,
        type: 'e-mail',
        acceptProbability: input.acceptProbability,
        reactionDelayMs: input.reactionDelayMs,
        priceDelta: input.priceDelta,
        carNumber: existing.plate,
        driver: existing.driverData,
        car: existing.car,
        reused: true,
      };
    }
    throw error;
  }

  await activateRegisteredDriver(apiBase, driverData);
  await tryApproveRegisteredDriver(apiBase, driverData, reg);

  console.log(`CREATE CAR FOR: ${input.email}; cm_id=${input.carModelId}; cc_id=${input.carClassId}; seats=${input.carSeats}`);
  const created = await createCarForDriver(apiBase, driverData, input, reg);
  created.car = await tryApproveCar(apiBase, driverData, created.car, reg);

  return {
    name: input.name,
    login: input.email,
    phone: input.phone,
    password: input.password,
    type: 'e-mail',
    acceptProbability: input.acceptProbability,
    reactionDelayMs: input.reactionDelayMs,
    priceDelta: input.priceDelta,
    carNumber: created.plate,
    driver: driverData,
    car: created.car,
  };
}


async function verifyDriverIsReady(apiBase, login, password) {
  const session = await loginDriver(apiBase, { login, password, type: 'e-mail' });
  const user = await loadAuthorizedUser(apiBase, session).catch(() => session.user);
  const car = await loadCarForLoggedDriver(apiBase, { ...session, user });
  const userState = getUserCheckState(user);
  const carState = getCarCheckState(car);
  return {
    ready: Boolean(car) && isApprovedCheckState(userState) && (carState === null || isApprovedCheckState(carState)),
    userState,
    carState,
    car,
    user,
  };
}


function normalizeDriverRecordForSave(driver) {
  if (!driver || !driver.login || !driver.password || driver.error || driver.dry) return null;
  return {
    name: driver.name || driver.login,
    login: driver.login,
    password: driver.password,
    type: driver.type || 'e-mail',
    acceptProbability: driver.acceptProbability ?? 1,
    reactionDelayMs: driver.reactionDelayMs || [1200, 5500],
    priceDelta: driver.priceDelta || [0, 50],
    phone: driver.phone,
    carNumber: driver.carNumber,
    location: driver.location,
  };
}

function mergeDriverLists(...lists) {
  const result = [];
  const seen = new Set();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const driver = normalizeDriverRecordForSave(raw);
      if (!driver) continue;
      const key = `${driver.login}|${driver.type || 'e-mail'}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(driver);
    }
  }
  return result;
}

async function main() {
  const config = readConfig();
  const reg = config.registration || {};
  const count = Number(getArgValue('count', reg.count || 5));
  const startIndex = Number(reg.startIndex || 1);
  const maxAttempts = Number(reg.maxAttempts || count * 6);
  const outPath = resolveProjectPath(config.driversFile || 'data/registered-drivers.json');
  const runId = makeRunId(reg);
  const templates = await learnCarTemplates(config);
  const results = [];

  console.log('Taxi driver registration started');
  console.log(`API: ${config.apiBase}`);
  console.log(`Count: ${count}`);
  console.log(`Run ID: ${runId}`);
  console.log(`Output: ${outPath}`);
  console.log(`Car templates: ${templates.map(item => `cm_id=${item.cm_id}/cc_id=${item.cc_id}/seats=${item.seats}`).join('; ')}`);
  console.log('Registration note: u_city and car color are intentionally not sent.');

  let currentIndex = startIndex;
  let attempts = 0;
  while (results.filter(item => !item.error).length < count && attempts < maxAttempts) {
    const template = templates[attempts % templates.length];
    const input = makeDriverInput(reg, currentIndex, runId, template);
    attempts += 1;
    currentIndex += 1;

    try {
      if (args.has('--dry')) {
        console.log('[DRY] would register:', JSON.stringify(input));
        results.push({
          name: input.name,
          login: input.email,
          phone: input.phone,
          password: input.password,
          type: 'e-mail',
          acceptProbability: input.acceptProbability,
          reactionDelayMs: input.reactionDelayMs,
          priceDelta: input.priceDelta,
          carNumber: input.carNumber,
          dry: true,
        });
        continue;
      }

      const result = await registerTestDriver(config.apiBase, input, reg);
      const verified = await verifyDriverIsReady(config.apiBase, result.login, result.password);
      if (!verified.ready) {
        const message = `created but not approved/ready yet (user_check=${verified.userState ?? 'unknown'}, car_check=${verified.carState ?? 'unknown'}, car=${verified.car ? 'yes' : 'no'})`;
        console.error(`NOT READY: ${result.login}: ${message}`);
        results.push({
          ...result,
          error: message,
        });
        continue;
      }
      results.push(result);
      console.log(`SUCCESS READY: ${result.login}`);
    } catch (error) {
      const message = stringifyError(error);
      console.error(`FAILED DRIVER ${padIndex(currentIndex - 1)}: ${message}`);
      results.push({
        name: input.name,
        login: input.email,
        phone: input.phone,
        password: input.password,
        type: 'e-mail',
        error: message,
      });

      if (!isBusyUserData(error) && reg.stopOnFirstHardError === true) {
        console.error('Stop because stopOnFirstHardError=true and error is not duplicate login/phone.');
        break;
      }
    }
  }

  const newReadyDrivers = results
    .filter(item => !item.error && !item.dry)
    .map((item, index) => ({
      name: item.name,
      login: item.login,
      password: item.password,
      type: item.type || 'e-mail',
      acceptProbability: item.acceptProbability ?? 1,
      reactionDelayMs: item.reactionDelayMs || [1200, 5500],
      priceDelta: item.priceDelta || [0, 50],
      phone: item.phone,
      carNumber: item.carNumber,
      location: (Array.isArray(config.driverLocations) ? config.driverLocations[index] : null) || config.driverLocation,
    }));

  const appendExisting = args.has('--append') || reg.appendExistingDrivers !== false;
  const existingReadyDrivers = appendExisting ? readJson(outPath, []) : [];
  const readyDrivers = appendExisting ? mergeDriverLists(existingReadyDrivers, newReadyDrivers) : mergeDriverLists(newReadyDrivers);

  writeJson(outPath, readyDrivers);
  writeJson(resolveProjectPath('data/registration-last-result.json'), {
    runId,
    attempts,
    requested: count,
    ready: newReadyDrivers.length,
    savedTotal: readyDrivers.length,
    appendExisting,
    templates,
    results,
  });

  console.log(`DONE. New ready drivers: ${newReadyDrivers.length}/${count}; saved total: ${readyDrivers.length}; attempts: ${attempts}/${maxAttempts}`);
  console.log(`Saved ready drivers to: ${outPath}`);
  if (!newReadyDrivers.length) {
    console.log('No new drivers were registered. Check data/registration-last-result.json and backend response messages.');
  }
}

main().catch(error => {
  console.error(stringifyError(error));
  process.exit(1);
});
