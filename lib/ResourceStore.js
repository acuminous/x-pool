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

  get minSize() {
    return this._minSize;
  }

  get maxSize() {
    return this._maxSize;
  }

  get size() {
    return this.idle + this.acquired + this.bad;
  }

  get idle() {
    return this._idle.length;
  }

  get acquired() {
    return this._acquired.length;
  }

  get bad() {
    return this._bad.length;
  }

  get pending() {
    return this._pending;
  }

  get spare() {
    return Math.max(0, this.idle - this.pending);
  }

  get available() {
    return this.maxSize - this.acquired - this.bad - this.pending;
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

  _removeAcquiredResource(resource) {
    const index = this._acquired.indexOf(resource);
    if (index < 0) return false;

    this._acquired.splice(index, 1);
    return true;
  }
};
