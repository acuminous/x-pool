const { validateNumber, validateUpperBoundary } = require('./validation');
const { MaxQueueDepthExceeded } = require('./Errors');

const PLACEHOLDER = { abort: () => {} };

module.exports = class State {

  constructor(options) {
    this._maxSize = validateNumber('maxSize', options, false, 1) || Infinity;
    this._minSize = validateNumber('minSize', options, false, 0) || 0;
    validateUpperBoundary('minSize', 'maxSize', options);

    this._maxQueueDepth = validateNumber('maxQueueDepth', options, false, 1) || Infinity;

    this._queued = [];
    this._acquiring = [];
    this._acquired = [];
    this._idle = [];
    this._destroying = [];
    this._bad = [];
    this._peakCount = 0;
  }

  get minSize() {
    return this._minSize;
  }

  get maxSize() {
    return this._maxSize;
  }

  get deficit() {
    return Math.max(this.minSize - this.size, 0);
  }

  get queued() {
    return this._queued.length;
  }

  get acquiring() {
    return this._acquiring.length;
  }

  get acquired() {
    return this._acquired.length;
  }

  get idle() {
    return this._idle.length;
  }

  get destroying() {
    return this._destroying.length;
  }

  get bad() {
    return this._bad.length;
  }

  get size() {
    return this.acquiring + this.acquired + this.idle + this.destroying + this.bad;
  }

  get spare() {
    return Math.max(0, this.idle - this.queued - this.acquiring - this.destroying);
  }

  get available() {
    return this.maxSize - this.acquiring - this.acquired - this.destroying - this.bad;
  }

  get peak() {
    return this._peakCount;
  }

  hasAcquireRequests() {
    return this.queued > 0;
  }

  queueAcquireRequest(request) {
    if (this._queued.length === this._maxQueueDepth) throw new MaxQueueDepthExceeded(`Maximum queue depth of ${this._maxQueueDepth} exceeded`);
    this._queued.push(request);
  }

  dequeueAcquireRequest() {
    this._acquiring.push(PLACEHOLDER);
    return this._queued.shift();
  }

  commenceAcquisition(task) {
    this._removeItem(this._acquiring, PLACEHOLDER);
    this._acquiring.push(task);
    this._peakCount = Math.max(this._peakCount, this.size);
  }

  isEmpty() {
    return this.queued + this.acquiring + this.acquired + this.destroying + this.idle + this.bad === 0;
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

  addAcquiredResource(resource, task) {
    this._removeItem(this._acquiring, task);
    this._acquired.push(resource);
  }

  addLateAcquiredResource(resource, task) {
    this._removeItem(this._acquiring, task);
    this._idle.push(resource);
  }

  dequeueAcquireTask() {
    return this._acquiring.shift();
  }

  releaseAcquiredResource(resource) {
    if (this._removeItem(this._acquired, resource)) this._idle.push(resource);
  }

  removeAcquiredResource(resource) {
    this._removeItem(this._acquired, resource);
  }

  commenceDestruction(task) {
    this._destroying.push(task);
  }

  completeDestruction(task) {
    this._removeItem(this._destroying, task);
  }

  dequeueDestroyTask() {
    return this._destroying.shift();
  }

  excludeBadResource(resource, task) {
    this._removeItem(this._destroying, task);
    this._bad.push(resource);
  }

  evictBadResource(resource) {
    this._removeItem(this._bad, resource);
  }

  evictBadResources() {
    this._bad.length = 0;
  }

  nuke() {
    this._maxSize = 0;
    this._minSize = 0;
    this._queued.length = 0;
    this._acquiring.length = 0;
    this._acquired.length = 0;
    this._idle.length = 0;
    this._destroying.length = 0;
    this._bad.length = 0;
  }

  stats() {
    return {
      queued: this.queued,
      acquiring: this.acquiring,
      acquired: this.acquired,
      idle: this.idle,
      destroying: this.destroying,
      bad: this.bad,
      size: this.size,
      available: this.available,
      peak: this.peak,
    };
  }

  _removeItem(list, resource) {
    const index = list.indexOf(resource);
    if (index < 0) return false;

    list.splice(index, 1);
    return true;
  }
};
