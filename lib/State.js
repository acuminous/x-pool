const { validateNumber, validateUpperBoundary } = require('./validation');
const { MaxQueueDepthExceeded } = require('./Errors');

const PLACEHOLDER = { abort: () => {} };

module.exports = class State {

  constructor(options) {
    this._maxSize = validateNumber('maxSize', options, false, 1) || Infinity;
    this._minSize = validateNumber('minSize', options, false, 0) || 0;
    validateUpperBoundary('minSize', 'maxSize', options);

    this._maxQueueDepth = validateNumber('maxQueueDepth', options, false, 1) || Infinity;

    this._queuedAcquireRequests = [];
    this._inProgressAcquireTasks = [];
    this._acquiredResources = [];
    this._idleResources = [];
    this._inProgressDestroyTasks = [];
    this._badResources = [];
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
    return this._queuedAcquireRequests.length;
  }

  get acquiring() {
    return this._inProgressAcquireTasks.length;
  }

  get acquired() {
    return this._acquiredResources.length;
  }

  get idle() {
    return this._idleResources.length;
  }

  get destroying() {
    return this._inProgressDestroyTasks.length;
  }

  get bad() {
    return this._badResources.length;
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
    if (this._queuedAcquireRequests.length === this._maxQueueDepth) throw new MaxQueueDepthExceeded(`Maximum queue depth of ${this._maxQueueDepth} exceeded`);
    this._queuedAcquireRequests.push(request);
  }

  dequeueAcquireRequest() {
    this._inProgressAcquireTasks.push(PLACEHOLDER);
    return this._queuedAcquireRequests.shift();
  }

  commenceAcquisition(task) {
    this._removeItem(this._inProgressAcquireTasks, PLACEHOLDER);
    this._inProgressAcquireTasks.push(task);
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
    return this._idleResources.shift();
  }

  addAcquiredResource(resource, task) {
    this._removeItem(this._inProgressAcquireTasks, task);
    this._acquiredResources.push(resource);
  }

  addLateAcquiredResource(resource, task) {
    this._removeItem(this._inProgressAcquireTasks, task);
    this._idleResources.push(resource);
  }

  dequeueAcquireTask() {
    return this._inProgressAcquireTasks.shift();
  }

  releaseAcquiredResource(resource) {
    if (this._removeItem(this._acquiredResources, resource)) this._idleResources.push(resource);
  }

  removeAcquiredResource(resource) {
    this._removeItem(this._acquiredResources, resource);
  }

  commenceDestruction(task) {
    this._inProgressDestroyTasks.push(task);
  }

  completeDestruction(task) {
    this._removeItem(this._inProgressDestroyTasks, task);
  }

  dequeueDestroyTask() {
    return this._inProgressDestroyTasks.shift();
  }

  excludeBadResource(resource, task) {
    this._removeItem(this._inProgressDestroyTasks, task);
    this._badResources.push(resource);
  }

  evictBadResource(resource) {
    this._removeItem(this._badResources, resource);
  }

  evictBadResources() {
    this._badResources.length = 0;
  }

  nuke() {
    this._maxSize = 0;
    this._minSize = 0;
    this._queuedAcquireRequests.length = 0;
    this._inProgressAcquireTasks.length = 0;
    this._acquiredResources.length = 0;
    this._idleResources.length = 0;
    this._inProgressDestroyTasks.length = 0;
    this._badResources.length = 0;
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
