const minimatch = require('minimatch');
const fs = require('fs');
const path = require('path');
const scriptHook = require('html-script-hook');
const polymerBuild = require('polymer-build');
const browserCapabilities = require('browser-capabilities');
const istanbulInstrumenter = require('istanbul-lib-instrument');
const {getPackageName, getCompileTarget} = require('./helper');

const defaultPlugins = [
  'importMeta',
  'asyncGenerators',
  'dynamicImport',
  'objectRestSpread',
  'optionalCatchBinding',
  'flow',
  'jsx'
];

// istanbul
let instrumenter;

// helpers
let cache = {};

function createInstrumenter(plugins) {
  instrumenter = new istanbulInstrumenter.createInstrumenter({
    autoWrap: true,
    coverageVariable: 'WCT.share.__coverage__',
    embedSource: true,
    compact: false,
    preserveComments: false,
    produceSourceMap: false,
    ignoreClassMethods: undefined,
    esModules: true,
    plugins: [...new Set(plugins ? defaultPlugins.concat(plugins) : defaultPlugins)]
  });
}

function replaceCoverage(code) {
  return code.replace('coverage = global[gcv] || (global[gcv] = {});',
    'coverage = global.WCT.share.__coverage__ || (global.WCT = { share: { __coverage__: {} } }).share.__coverage__;');
}

function transform(req, body, packageName, filePath, npm, root, componentUrl,
  moduleResolution, isComponentRequestOverride) {
  const capabilities = browserCapabilities.browserCapabilities(req.get('user-agent'));
  const compileTarget = getCompileTarget(capabilities, 'auto');

  const options = {
    compileTarget,
    transformModules: !capabilities.has('modules'),
  };

  return polymerBuild.jsTransform(body, {
    compile: options.compileTarget,
    transformModulesToAmd: options.transformModules ? 'auto' : false,
    moduleResolution: moduleResolution ? moduleResolution : npm ? 'node' : 'none',
    filePath,
    isComponentRequest: isComponentRequestOverride === undefined ?
      req.baseUrl === componentUrl : isComponentRequestOverride,
    packageName,
    componentDir: npm ? path.join(root, 'node_modules') : path.join(root, 'bower_components'),
    rootDir: process.cwd()
  });
}
/**
 * Try to get source map for given code
 * @param {string} code Code to get source map for
 * @param {string} path Path to code
 * @return {Object}
 */
function getSourceMap(code, path) {
  let map;
  const mapMatch = /\/\/# sourceMappingURL=([^\s]+.js.map)$/.exec(code);
  if (mapMatch !== null && path !== null) {
    const mapPath = path.split('/').slice(0, -1).join('/') + '/' + mapMatch[1];
    if (fs.existsSync(mapPath)) {
      try {
        const rawMap = fs.readFileSync(mapPath, 'utf8');
        map = JSON.parse(rawMap);
      } catch (_) {}
    }
  }
  return map;
}

function instrumentFile(path, req, html) {
  const asset = req.url;
  function instrumentScript(code) {
    return instrumenter.instrumentSync(code, path);
  }
  if (fs.existsSync(path)) {
    if (!cache[asset]) {
      const code = fs.readFileSync(path, 'utf8');
      cache[asset] = html ? scriptHook(code, {scriptCallback: instrumentScript}) :
        instrumenter.instrumentSync(code, path, getSourceMap(code, path));
    }
  } else {
    return '';
  }
  return cache[asset];
}
/**
 * Returns true if the supplied string mini-matches any of the supplied patterns
 * @param {String} str
 * @param {Array} rules
 * @return {Boolean}
 */
function match(str, rules) {
  return rules.some((rule) => minimatch(str, rule));
}
/**
 * Middleware that serves an instrumented asset based on user
 * configuration of coverage
 *
 * @param {Object} root
 * @param {Object} options
 * @param {Object} emitter
 * @return {Function}
 */
function coverageMiddleware(root, options, emitter) {
  options.root = options.root || process.cwd();
  const basename = getPackageName(options);
  const basepath = path.join(emitter.options.clientOptions.root, basename);
  createInstrumenter(options.babelPlugins);

  return function(req, res, next) {
    let blacklist = options.exclude || ['**/test/**'];
    let whitelist = options.include || [];

    if (options.npm) {
      // Without this rule the test won't be initialized when Polymer 3 project.
      blacklist.push('**/node_modules/**');
    }

    if (!options.ignoreBasePath) {
      blacklist = blacklist.map((x) => path.join(basepath, x));
      whitelist = whitelist.map((x) => path.join(basepath, x));
    }

    const re = new RegExp(`^\/[^/]+\/${basename.replace('/', '\/')}`);
    const absolutePath = req.url.replace(re, root);
    if (match(req.url, whitelist) && !match(req.url, blacklist)) {
      if (absolutePath.match(/\.(j|e)s$/)) {
        emitter.emit('log:debug', 'coverage', 'instrument', req.url);
        let code = instrumentFile(absolutePath, req);
        res.type('application/javascript');
        const result = transform(req,
          replaceCoverage(code), basename, absolutePath, options.npm,
          root, emitter.options.clientOptions.root, options.moduleResolution,
          options.isComponentRequestOverride);
        res.send(result);
        return;
      } else if (absolutePath.match(/\.htm(l)?$/)) {
        emitter.emit('log:debug', 'coverage', 'instrument', req.url);
        let html = instrumentFile(absolutePath, req, true);
        res.send(replaceCoverage(html));
        return;
      }
      emitter.emit('log:debug', 'coverage', 'skip whitelisted', req.url);
      next();
      return;
    } else {
      emitter.emit('log:debug', 'coverage', 'skip      ', req.url);
      next();
      return;
    }
  };
}

/**
 * Clears the instrumented code cache
 */
function cacheClear() {
  cache = {};
}

module.exports = {
  middleware: coverageMiddleware,
  cacheClear: cacheClear
};
