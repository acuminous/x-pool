const { AsyncLocalStorage } = require('node:async_hooks');

const topLevelDebug = require('debug')('XPool');

const als = new AsyncLocalStorage();

function debug(...args) {
  getDebug()(...args);
}

function scope(path, ...args) {
  return als.run({ debug: getDebug().extend(path) }, ...args);
}

function getDebug() {
  return als.getStore()?.debug || topLevelDebug;
}

module.exports = {
  debug,
  scope,
};
