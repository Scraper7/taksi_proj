/* eslint-disable no-console */
const { readConfig, resolveProjectPath, readJson } = require('./common');

function main() {
  const config = readConfig();
  const driversPath = resolveProjectPath(config.driversFile || 'data/registered-drivers.json');
  const fileDrivers = readJson(driversPath, []);
  const configDrivers = config.useConfigDrivers === true && Array.isArray(config.drivers) ? config.drivers : [];

  console.log('=== Taxi Driver Simulator Doctor ===');
  console.log(`API base: ${config.apiBase}`);
  console.log(`Poll interval: ${config.pollIntervalMs || 3000} ms`);
  console.log(`Order type: ${config.orderType || 'all'}`);
  console.log(`Offer transport: ${config.offerTransport || 'c_options'}`);
  console.log(`Retry safe on wrong c_options: ${config.retrySafeOnWrongCOptions !== false}`);
  console.log(`Drivers file: ${driversPath}`);
  console.log(`Drivers in file: ${Array.isArray(fileDrivers) ? fileDrivers.length : 0}`);
  console.log(`Drivers in config: ${configDrivers.length}${config.useConfigDrivers === true ? '' : ' (disabled; useConfigDrivers=false)'}`);

  const eta = config.defaultOffer?.etaOptions || [];
  const comments = config.defaultOffer?.commentOptions || [];
  console.log(`ETA options: ${eta.join(', ') || '-'}`);
  console.log(`Comment options: ${comments.join(' | ') || '-'}`);

  if (!global.fetch || !global.FormData) {
    console.log('ERROR: Node.js is too old. Need Node 18+ with fetch/FormData.');
    process.exitCode = 1;
  } else {
    console.log('Node fetch/FormData: OK');
  }

  if (!fileDrivers.length && !configDrivers.length) {
    console.log('ERROR: No drivers. Run npm run register. If you want to use manual config.json drivers[], set useConfigDrivers=true.');
    process.exitCode = 1;
  }

  console.log('Doctor finished.');
}

main();
