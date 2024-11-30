const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');

const AsyncLatch = require('../utils/AsyncLatch');
const EmptyState = require('./EmptyState');
const PendingState = require('./PendingState');
const ReadyState = require('./ReadyState');
const IdleState = require('./IdleState');
const AcquiredState = require('./AcquiredState');
const DoomedState = require('./DoomedState');
const DestroyedState = require('./DestroyedState');
const SegregatedState = require('./SegregatedState');
const { RESOURCE_RELEASED, RESOURCE_ACQUIRED } = require('./Events');

class Bay extends EventEmitter {

  #id = randomUUID();
  #createLatch = new AsyncLatch();
  #wards;
  #commandFactory;
  #state;
  #leaseId = null;
  #resource = null;

  constructor(wards, commandFactory) {
    super();
    this.#wards = wards;
    this.#commandFactory = commandFactory;
    this.#state = new EmptyState(this.#wards.empty).accept(this);
  }

  get id() {
    return this.#id;
  }

  get leaseId() {
    return this.#leaseId;
  }

  get shortId() {
    return `${this.#id?.substring(0, 4)}-${this.#leaseId?.substring(0, 4)}`
  }

  get state() {
    return this.#state.name;
  }

  contains(resource) {
    return resource !== null && this.#resource === resource;
  }

  reserve(request) {
    this.#leaseId = request.id;
    this.#state.reserve();
    request.associate(this);
    return this;
  }

  async provision() {
    return this.#state.provision();
  }

  async acquire() {
    await this.#state.acquire();
    return this.#resource;
  }

  abort() {
    this.#state.abort();
  }

  async release() {
    await this.#state.release();
  }

  async destroy() {
    await this.#state.destroy(this.#resource);
  }

  segregate() {
    this.#state.segregate();
  }

  _assign(resource) {
    this.#resource = resource;
  }

  _toPending() {
    const pending = new PendingState(this.#wards.pending, this.#commandFactory.getCreateCommand(), this.#createLatch);
    this.#state = this.#state.moveTo(pending);
  }

  _toReady() {
    const ready = new ReadyState(this.#wards.ready);
    this.#state = this.#state.moveTo(ready);
  }

  _toIdle() {
    const idle = new IdleState(this.#wards.idle);
    this.#state = this.#state.moveTo(idle);
    this.#leaseId = null;
  }

  _toAcquired() {
    const acquired = new AcquiredState(this.#wards.acquired);
    this.#state = this.#state.moveTo(acquired);
  }

  _toDoomed() {
    const doomed = new DoomedState(this.#wards.doomed, this.#commandFactory.getDestroyCommand(), this.#createLatch);
    this.#state = this.#state.moveTo(doomed);
  }

  _toDestroyed() {
    const destroyed = new DestroyedState(this);
    this.#state = this.#state.moveTo(destroyed);
    this.#leaseId = null;
  }

  _toSegregated() {
    const segregated = new SegregatedState(this.#wards.segregated);
    this.#state = this.#state.moveTo(segregated);
  }
}

module.exports = Bay
