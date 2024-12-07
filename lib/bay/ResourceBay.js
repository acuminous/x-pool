const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
const { inspect } = require('node:util');

const fwd = require('fwd');

const StateMachine = require('./StateMachine');

class ResourceBay extends EventEmitter {

  #id = randomUUID();
  #stateMachine;
  #request = null;
  #resource = null;

  constructor(stores, commandFactory) {
    super();
    this.#stateMachine = new StateMachine(this, stores, commandFactory);
  }

  get id() {
    return this.#id;
  }

  get shortId() {
    return `${this.#request.shortId}-${this.#id?.substring(0, 4)}`;
  }

  get #state() {
    return this.#stateMachine.state;
  }

  forwardEvents(target) {
    fwd(this, target);
    return this;
  }

  assign(resource) {
    this.#resource = resource;
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

  async validate(shouldValidate) {
    shouldValidate
      ? await this.#state.validate(this.#resource)
      : this.#stateMachine.toReady();
  }

  async acquire() {
    await this.#state.acquire();
    this.#request.assign(this.#resource);
  }

  abort() {
    this.#state.abort();
  }

  async release() {
    await this.#state.release();
  }

  async destroy() {
    await this.#state.destroy(this.#resource);
    this.#resource = null;
  }

  segregate() {
    this.#state.segregate();
  }

  [inspect.custom]() {
    return `${this.constructor.name} { id: ${this.shortId}, state: ${this.#state.name} }`;
  }
}

module.exports = ResourceBay;
