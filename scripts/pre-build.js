'use strict';

const fs = require('fs');
const path = require('path');

const versionPath = path.resolve(process.cwd(), 'src', 'version.json');

let versionInfo = {};

try {
  versionInfo = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
} catch (error) {
  console.warn('Cannot read src/version.json, creating a new version object');
}

// Auto-update only build date/time on every rebuild/start.
// Do not overwrite public app name/version from src/version.json.
versionInfo.buildTimestamp = new Date().toString();

fs.writeFileSync(versionPath, `${JSON.stringify(versionInfo, null, 2)}
`);
