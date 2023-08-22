const { validateNumber, validateUpperBoundary } = require('./validation');

module.exports = class State {

  constructor(options) {
    this._maxSize = validateNumber('maxSize', options, false, 1) || Infinity;
    this._minSize = validateNumber('minSize', options, false, 0) || 0;

    validateUpperBoundary('minSize', 'maxSize', options);

    this._queued = [];
    this._acquiringCount = 0;
    this._acquired = [];
    this._idle = [];
    this._bad = [];
    this._peakCount = 0;
  }

  get minSize() {
    return this._minSize;
  }

  get maxSize() {
    return this._maxSize;
  }

  get queued() {
    return this._queued.length;
  }

  get acquiring() {
    return this._acquiringCount;
  }

  get acquired() {
    return this._acquired.length;
  }

  get idle() {
    return this._idle.length;
  }

  get bad() {
    return this._bad.length;
  }

  get size() {
    return this.acquiring + this.acquired + this.idle + this.bad;
  }

  get spare() {
    return Math.max(0, this.idle - this.queued - this.acquiring);
  }

  get available() {
    return this.maxSize - this.acquiring - this.acquired - this.bad;
  }

  get peak() {
    return this._peakCount;
  }

  hasAcquireRequests() {
    return this.queued > 0;
  }

  queueAcquireRequest(request) {
    this._queued.push(request);
  }

  dequeueAcquireRequest() {
    this._acquiringCount++;
    this._peakCount = Math.max(this._peakCount, this.size);
    return this._queued.shift();
  }

  isEmpty() {
    return this.queued + this.acquiring + this.acquired + this.idle + this.bad === 0;
  }

  isExhausted() {
    return this.available === 0;
  }

  hasIdleResources() {
    return this.idle > 0;
  }

  getIdleResource() {
    return this._idle.shift();
  }

  addIdleResource(resource) {
    this._idle.push(resource);
  }

  addAcquiredResource(resource) {
    this._acquiringCount--;
    this._acquired.push(resource);
  }

  releaseAcquiredResource(resource) {
    if (this._removeResource(this._acquired, resource)) this.addIdleResource(resource);
  }

  removeAcquiredResource(resource) {
    this._removeResource(this._acquired, resource);
  }

  excludeBadResource(resource) {
    this._removeResource(this._acquired, resource);
    this._bad.push(resource);
  }

  evictBadResource(resource) {
    this._removeResource(this._bad, resource);
  }

  evictBadResources() {
    this._bad.length = 0;
  }

  stats() {
    return {
      queued: this.queued,
      acquiring: this.acquiring,
      acquired: this.acquired,
      idle: this.idle,
      bad: this.bad,
      size: this.size,
      available: this.available,
      peak: this.peak,
    };
  }

  _removeResource(list, resource) {
    const index = list.indexOf(resource);
    if (index < 0) return false;

    list.splice(index, 1);
    return true;
  }
};
