const path = require('path');
const fs = require('fs');

/* FROM web-component-tester/runner/config.js */

/**
 * config helper: A basic function to synchronously read JSON,
 * log any errors, and return null if no file or invalid JSON
 * was found.
 *
 * @param {String} filename
 * @param {String} dir
 * @return {Object}
 */
function readJsonSync(filename, dir) {
  const configPath = path.resolve(dir || '', filename);
  let config;
  try {
    config = fs.readFileSync(configPath, 'utf-8');
  } catch (e) {
    return null;
  }
  try {
    return JSON.parse(config);
  } catch (e) {
    console.error(`Could not parse ${configPath} as JSON`);
    console.error(e);
  }
  return null;
}
/**
 * Determines the package name by reading from the following sources:
 *
 * 1. `options.packageName`
 * 2. bower.json or package.json, depending on options.npm
 *
 * @param {Object} options
 * @return {String}
 */
function getPackageName(options) {
  if (options.packageName) {
    return options.packageName;
  }
  const manifestName = (options.npm ? 'package.json' : 'bower.json');
  const manifest = readJsonSync(manifestName, options.root);
  if (manifest !== null) {
    return manifest.name;
  }
  const basename = path.basename(options.root);
  console.warn(`no ${manifestName} found, defaulting to packageName=${basename}`);
  return basename;
}
exports.getPackageName = getPackageName;

/* FROM polyserve/lib/get-compile-target.js */

function getCompileTarget(capabilities, compile) {
  let compileTarget;
  if (compile === 'always') {
    compileTarget = 'es5';
  } else if (compile === 'auto') {
    const jsLevels = ['es2018', 'es2017', 'es2016', 'es2015'];
    compileTarget = jsLevels.find((c) => capabilities.has(c));
    if (compileTarget === undefined) {
        compileTarget = 'es5';
    }
  }
  return compileTarget;
}
exports.getCompileTarget = getCompileTarget;
