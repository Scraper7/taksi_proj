/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

const os = require('os');
const codeFrame = require('@babel/code-frame').codeFrameColumns;
const chalk = require('chalk');
const fs = require('fs');

function formatter(issue, useColors) {
  const {
    severity,
    file,
    location,
    message,
    code
  } = issue;

  const colors = new chalk.constructor({ enabled: useColors });
  const messageColor = severity === 'warning' ? colors.yellow : colors.red;
  const fileAndNumberColor = colors.bold.cyan;

  const source = file && fs.existsSync(file) && fs.readFileSync(file, 'utf-8');
  const frame = source
    ? codeFrame(
        source,
        location,
        { highlightCode: useColors }
      )
        .split('\n')
        .map(str => '  ' + str)
        .join(os.EOL)
    : '';

  return [
    messageColor.bold(`TypeScript ${severity.toLowerCase()} in `) +
      fileAndNumberColor(
        `${file}(${location.start.line},${location.start.column}`
      ) + messageColor(':'),
    message +
      '  ' +
      messageColor.underline(code),
    '',
    frame,
  ].join(os.EOL);
}

module.exports = formatter;
