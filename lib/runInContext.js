const { AsyncLocalStorage } = require('node:async_hooks');

const als = new AsyncLocalStorage();

let index = 0;

function runInContext(fn) {
  return als.run(++index, fn);
}

function getContextId() {
  return als.getStore();
}

module.exports = {
  runInContext,
  getContextId,
};
