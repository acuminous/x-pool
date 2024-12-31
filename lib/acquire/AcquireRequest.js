const { inspect } = require('node:util');
const { scheduler } = require('node:timers/promises');

const debug = require('debug')('XPool:acquire:AcquireRequest');

const StateMachine = require('./StateMachine');
const AsyncLatch = require('../utils/AsyncLatch');

class AcquiredRequest {

  #id;
  #handler;
  #backoff;
  #stateMachine;
  #latch = new AsyncLatch();

  constructor(id, handler, backoff) {
    this.#id = id;
    this.#handler = handler;
    this.#backoff = backoff;
  }

  get id() {
    return this.#id;
  }

  get shortId() {
    return `${this.#id?.substring(0, 4)}`;
  }

  get #state() {
    return this.#stateMachine.state;
  }

  get initiated() {
    return this.#latch.activated;
  }

  initiate(stores) {
    this.#stateMachine = new StateMachine(this, stores, this.#handler);
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
    debug(`Associating bay [${bay.shortId}] with ${this.#state.name} request [${this.shortId}]`);
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

  [inspect.custom]() {
    return `${this.constructor.name} { id: ${this.shortId}, state: ${this.state} }`;
  }
}

module.exports = AcquiredRequest;
