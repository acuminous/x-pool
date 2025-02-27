const { inspect } = require('node:util');
const { scheduler } = require('node:timers/promises');

const { debug } = require('../XPoolDebug');

const StateMachine = require('./StateMachine');
const AsyncLatch = require('../utils/AsyncLatch');

class AcquiredRequest {

  #id;
  #handler;
  #backoff;
  #stateMachine;
  #latch = new AsyncLatch();
  #bay;

  constructor(id, handler, backoff) {
    this.#id = id;
    this.#handler = handler;
    this.#backoff = backoff;
  }

  get id() {
    return this.#id;
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
    return this.#latch.yield(...args);
  }

  setBay(bay) {
    this.#bay = bay;
  }

  queue() {
    debug(`Queueing ${this.#state.name} request`);
    this.#state.queue();
  }

  abort() {
    debug(`Aborting ${this.#state.name} request`);
    this.#state.abort(this.#bay);
  }

  dispatch() {
    debug(`Dispatching ${this.#state.name} request`);
    this.#state.dispatch();
  }

  async requeue() {
    const delay = this.#backoff.next();
    debug(`Requeueing ${this.#state.name} request in ${delay.toLocaleString()}ms`);
    await scheduler.wait(delay);
    this.#state.requeue();
  }

  dequeue(resource) {
    debug(`Dequeueing ${this.#state.name} request`);
    this.#state.dequeue(resource);
  }

  [inspect.custom]() {
    return `${this.constructor.name} { id: ${this.id}, state: ${this.state} }`;
  }
}

module.exports = AcquiredRequest;
