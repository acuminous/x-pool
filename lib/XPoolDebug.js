const { AsyncLocalStorage } = require('node:async_hooks');

const topLevelDebug = require('debug')('XPool');

const als = new AsyncLocalStorage();

function debug(...args) {
  getDebug()(...args);
}

function scope(path, ...args) {
  return als.run({ debug: extend(path) }, ...args);
}

function extend(path) {
  const debug = getDebug();
  const namespaces = debug.namespace.split(':');
  return namespaces.find((namespace) => namespace === path)
    ? debug
    : debug.extend(path);
}

function getDebug() {
  return als.getStore()?.debug || topLevelDebug;
}

module.exports = {
  debug,
  scope,
};
