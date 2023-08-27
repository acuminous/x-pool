const { validateNumber, validateUpperBoundary } = require('./validation');
const { MaxQueueDepthExceeded, OutOfBoundsError } = require('./Errors');

const PLACEHOLDER_TASK = { abort: () => {} };

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
    this._peak = 0;
    this._wrappedResources = new Map();
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
    return this.acquired + this.idle + this.destroying + this.bad;
  }

  get spare() {
    return Math.max(0, this.idle - this.queued - this.acquiring);
  }

  get available() {
    return this.maxSize - this.acquiring - this.size + this.idle;
  }

  get peak() {
    return this._peak;
  }

  getWrappedResource(resource) {
    return this._wrappedResources.get(resource);
  }

  forgetWrappedResource(wrappedResource) {
    this._wrappedResources.delete(wrappedResource.resource);
  }

  hasAcquireRequests() {
    return this.queued > 0;
  }

  queueAcquireRequest(request) {
    if (this._queuedAcquireRequests.length === this._maxQueueDepth) throw new MaxQueueDepthExceeded(`Maximum queue depth of ${this._maxQueueDepth} exceeded`);
    this._queuedAcquireRequests.push(request);
  }

  dequeueAcquireRequest() {
    this._inProgressAcquireTasks.push(PLACEHOLDER_TASK);
    return this._queuedAcquireRequests.shift();
  }

  commenceAcquisition(task) {
    this._removeItem(this._inProgressAcquireTasks, PLACEHOLDER_TASK);
    this._inProgressAcquireTasks.push(task);
  }

  isEmpty() {
    return this.queued + this.acquiring + this.acquired + this.idle + this.destroying + this.bad === 0;
  }

  isExhausted() {
    return this.available === 0;
  }

  hasIdleResources() {
    return this.idle > 0;
  }

  getIdleResource() {
    if (this._idleResources.length === 0) throw new OutOfBoundsError('There are no more idle resources');
    return this._idleResources.shift();
  }

  addAcquiredResource(wrappedResource, task) {
    this._removeItem(this._inProgressAcquireTasks, task);
    this._acquiredResources.push(wrappedResource);
    this._wrappedResources.set(wrappedResource.resource, wrappedResource);
    this._updatePeak();
  }

  addLateAcquiredResource(wrappedResource, task) {
    this._removeItem(this._inProgressAcquireTasks, task);
    this._idleResources.push(wrappedResource);
    this._wrappedResources.set(wrappedResource.resource, wrappedResource);
    this._updatePeak();
  }

  _updatePeak() {
    this._peak = Math.max(this._peak, this.size);
  }

  dequeueAcquireTask() {
    if (this._inProgressAcquireTasks.length === 0) throw new OutOfBoundsError('There are no more acquire tasks');
    return this._inProgressAcquireTasks.shift();
  }

  releaseAcquiredResource(wrappedResource) {
    if (this._removeItem(this._acquiredResources, wrappedResource)) this._idleResources.push(wrappedResource);
  }

  prepareForDestruction(wrappedResource) {
    if (this._removeItem(this._acquiredResources, wrappedResource)) this._inProgressDestroyTasks.push(PLACEHOLDER_TASK);
  }

  commenceDestruction(task) {
    this._removeItem(this._inProgressDestroyTasks, PLACEHOLDER_TASK);
    this._inProgressDestroyTasks.push(task);
  }

  completeDestruction(task) {
    this._removeItem(this._inProgressDestroyTasks, task);
  }

  dequeueDestroyTask() {
    if (this._inProgressDestroyTasks.length === 0) throw new OutOfBoundsError('There are no more destroy tasks');
    return this._inProgressDestroyTasks.shift();
  }

  excludeBadResource(wrappedResource, task) {
    this._removeItem(this._inProgressDestroyTasks, task);
    this._badResources.push(wrappedResource);
  }

  evictBadResource(wrappedResource) {
    this._removeItem(this._badResources, wrappedResource);
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
    this._wrappedResources.clear();
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

  _removeItem(list, wrappedResource) {
    const index = list.indexOf(wrappedResource);
    if (index < 0) return false;

    list.splice(index, 1);
    return true;
  }
};
