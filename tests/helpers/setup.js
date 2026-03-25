// Pre-mock vscode and logger before any source modules are loaded.
// Must be the first require() in every test file.

const Module = require('module');
const path = require('path');

// 1. Mock vscode — since @types/vscode only provides types, there's no
//    actual module to require. We monkey-patch Module._resolveFilename to
//    intercept only the bare 'vscode' specifier.

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function patchedResolveFilename(request, parent, isMain, options) {
  if (request === 'vscode') {
    return 'vscode';
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

// Inject mock into cache
const vscodeMock = require(path.join(__dirname, 'mock-vscode.js'));
Module._cache['vscode'] = Module._cache['vscode'] || { id: 'vscode', filename: 'vscode', loaded: true, exports: vscodeMock };

// 2. Mock logger
const mockLogger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
  show() {},
  setLevel() {},
};

// Load logger.js (now that vscode is mocked) and replace logger with no-op
const loggerAbsPath = path.join(__dirname, '..', '..', 'out', 'logger.js');
const loggerModule = require(loggerAbsPath);
loggerModule.logger = mockLogger;
loggerModule.initLogger = () => { loggerModule.logger = mockLogger; };
