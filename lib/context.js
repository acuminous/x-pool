const { AsyncLocalStorage } = require('node:async_hooks');

const als = new AsyncLocalStorage();

let index = 0;

function runInContext(fn) {
  const contextId = als.getStore() || ++index;
  return als.run(contextId, fn);
}

function getContextId() {
  return als.getStore();
}

module.exports = {
  runInContext,
  getContextId,
};
