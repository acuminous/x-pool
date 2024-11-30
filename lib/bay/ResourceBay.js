const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
const fwd = require('fwd');

const EmptyState = require('./states/EmptyState');
const PendingState = require('./states/PendingState');
const ReadyState = require('./states/ReadyState');
const IdleState = require('./states/IdleState');
const AcquiredState = require('./states/AcquiredState');
const DoomedState = require('./states/DoomedState');
const DestroyedState = require('./states/DestroyedState');
const SegregatedState = require('./states/SegregatedState');

class ResourceBay extends EventEmitter {

  #id = randomUUID();
  #partitions;
  #commandFactory;
  #state;
  #request = null;
  #resource = null;

  constructor(partitions, commandFactory) {
    super();
    this.#partitions = partitions;
    this.#commandFactory = commandFactory;
    this.#state = new EmptyState(this.#partitions.empty).accept(this);
  }

  get id() {
    return this.#id;
  }

  get requestId() {
    return this.#request?.id;
  }

  get shortId() {
    return `${this.#id?.substring(0, 4)}-${this.requestId?.substring(0, 4)}`
  }

  get state() {
    return this.#state.name;
  }

  forwardEvents(target) {
    fwd(this, target);
    return this;
  }

  contains(resource) {
    return resource !== null && this.#resource === resource;
  }

  reserve(request) {
    this.#request = request;
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
    const pending = new PendingState(this.#partitions.pending, this.#commandFactory.getCreateCommand());
    this.#state = this.#state.moveTo(pending);
  }

  _toReady() {
    const ready = new ReadyState(this.#partitions.ready);
    this.#state = this.#state.moveTo(ready);
  }

  _toIdle() {
    const idle = new IdleState(this.#partitions.idle);
    this.#state = this.#state.moveTo(idle);
    this.#request = null;
  }

  _toAcquired() {
    const acquired = new AcquiredState(this.#partitions.acquired);
    this.#state = this.#state.moveTo(acquired);
  }

  _toDoomed() {
    const doomed = new DoomedState(this.#partitions.doomed, this.#commandFactory.getDestroyCommand());
    this.#state = this.#state.moveTo(doomed);
  }

  _toDestroyed() {
    const destroyed = new DestroyedState(this);
    this.#state = this.#state.moveTo(destroyed);
    this.#request = null;
  }

  _toSegregated() {
    const segregated = new SegregatedState(this.#partitions.segregated);
    this.#state = this.#state.moveTo(segregated);
  }
}

module.exports = ResourceBay
