const assert = require('node:assert');

module.exports = {
  takesAtLeast: async (fn, duration) => {
    const start = process.hrtime.bigint();
    await fn();
    const end = process.hrtime.bigint();
    const elapsed = Number(end - start) / 1_000_000;
    assert(elapsed >= duration, `Expected execution time to be greater than or equal to ${duration.toLocaleString()}ms, but got ${elapsed.toLocaleString()}ms.`);
  },
  takesAtMost: async (fn, duration) => {
    const start = process.hrtime.bigint();
    await fn();
    const end = process.hrtime.bigint();
    const elapsed = Number(end - start) / 1_000_000;
    assert(elapsed <= duration, `Expected execution time to be less than or equal to ${duration.toLocaleString()}ms, but got ${elapsed.toLocaleString()}ms.`);
  }
}
