const { validateNumber, validateUpperBoundary } = require('./validation');

module.exports = class ResourceSstore {

  constructor(options) {
    this._maxSize = validateNumber('maxSize', options, false, 1) || Infinity;
    this._minSize = validateNumber('minSize', options, false, 0) || 0;

    validateUpperBoundary('minSize', 'maxSize', options);
    this._idle = [];
    this._acquired = [];
    this._bad = [];
    this._pending = 0;
  }

  isEmpty() {
    return this._acquired.length + this._idle.length + this._bad.length + this._pending === 0;
  }

  isExhausted() {
    return this._maxSize === this._acquired.length;
  }

  getIdleResource() {
    return this._idle.shift();
  }

  getEmptyBatch() {
    return new Array(this._minSize).fill();
  }

  addIdleResource(resource) {
    this._idle.push(resource);
  }

  registerAcquire() {
    this._pending++;
  }

  addAcquiredResource(resource) {
    this._pending--;
    this._acquired.push(resource);
  }

  releaseAcquiredResource(resource) {
    if (this._removeAcquiredResource(resource)) this.addIdleResource(resource);
  }

  removeAcquiredResource(resource) {
    this._removeAcquiredResource(resource);
  }

  excludeBadResource(resource) {
    this._removeAcquiredResource(resource);
    this._bad.push(resource);
  }

  evictBadResources() {
    this._bad.length = 0;
  }

  stats() {
    return {
      size: this._acquired.length + this._idle.length + this._bad.length,
      idle: this._idle.length,
      acquired: this._acquired.length,
      bad: this._bad.length,
      available: this._maxSize - this._acquired.length - this._bad.length,
      pending: this._pending,
    };
  }

  _removeAcquiredResource(resource) {
    const index = this._acquired.indexOf(resource);
    if (index < 0) return false;

    this._acquired.splice(index, 1);
    return true;
  }
};
