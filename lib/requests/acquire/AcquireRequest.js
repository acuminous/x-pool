const { inspect } = require('node:util');
const { scheduler } = require('node:timers/promises');

const debug = require('debug')('XPool:requests:AcquireRequest');

const UnqueuedState = require('./states/UnqueuedState');
const QueuedState = require('./states/QueuedState');
const DispatchedState = require('./states/DispatchedState');
const AbortedState = require('./states/AbortedState');
const FulfilledState = require('./states/FulfilledState');
const AsyncLatch = require('../../utils/AsyncLatch');
const ExponentialBackoff = require('../../utils/ExponentialBackoff');


class AcquiredRequest {

  #id;
  #partitions;
  #handler;
  #backoff;
  #state;
  #latch = new AsyncLatch();

  constructor(id, partitions, handler, backoff) {
    this.#id = id;
    this.#partitions = partitions;
    this.#handler = handler;
    this.#backoff = backoff;
    this.#state = new UnqueuedState().accept(this);
  }

  get id() {
    return this.#id;
  }

  get shortId() {
    return `${this.#id?.substring(0, 4)}`
  }

  get state() {
    return this.#state.name;
  }

  get initiated() {
    return this.#latch.activated;
  }

  initiate() {
    this.#latch.activate();
    return this;
  }

  async wait() {
    return this.#latch.block();
  }

  finalise(...args) {
    return this.#latch.release(...args);
  }

  queue() {
    debug(`Queueing ${this.#state.name} request [${this.shortId}]`);
    this.#state.queue();
    return this;
  }

  abort() {
    debug(`Aborting ${this.#state.name} request [${this.shortId}]`);
    this.#state.abort();
  }

  dispatch() {
    debug(`Dispatching ${this.#state.name} request [${this.shortId}]`);
    this.#state.dispatch();
  }

  associate(bay) {
    debug(`Associating ${bay.state} bay [${bay.shortId}] with ${this.#state.name} request [${this.shortId}]`);
    this.#state.associate(bay);
  }

  assign(resource) {
    debug(`Assigning resource to ${this.#state.name} request [${this.shortId}]`);
    this.#state.assign(resource);
  }

  async requeue() {
    const delay = this.#backoff.next();
    debug(`Requeueing ${this.#state.name} request [${this.shortId}] in ${delay.toLocaleString()}ms`);
    await scheduler.wait(delay);
    this.#state.requeue();
  }

  dequeue() {
    debug(`Dequeueing ${this.#state.name} request [${this.shortId}]`);
    this.#state.dequeue();
  }

  _toQueued() {
    const queued = new QueuedState(this.#partitions.queued);
    this.#state = this.#state.moveTo(queued);
  }

  _toDispatched() {
    const dispatched = new DispatchedState(this.#partitions.dispatched);
    this.#state = this.#state.moveTo(dispatched);
    this.#handler(this);
  }

  _toAborted(error) {
    const aborted = new AbortedState(error);
    this.#state = this.#state.moveTo(aborted);
  }

  _toFulfilled() {
    const fulfilled = new FulfilledState();
    this.#state = this.#state.moveTo(fulfilled);
  }

  [inspect.custom]() {
    return `${this.constructor.name} { id: ${this.shortId}, state: ${this.state} }`
  }
}

module.exports = AcquiredRequest
