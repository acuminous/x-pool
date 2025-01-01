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
  #config;
  #metadata = {
    acquired: 0,
  };

  constructor(stores, commandFactory, config) {
    super();
    this.#stateMachine = new StateMachine(this, stores, commandFactory);
    this.#config = config;
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

  created(resource) {
    this.#resource = resource;
    this.#metadata.createdAt = new Date();
  }

  validated() {
    this.#metadata.validatedAt = new Date();
  }

  contains(resource) {
    return resource !== null && this.#resource === resource;
  }

  reserve(request) {
    this.#request = request;
    this.#state.reserve();
    this.#metadata.reservedAt = new Date();
    request.associate(this);
    return this;
  }

  async provision() {
    await this.#state.provision();
  }

  async validate() {
    if (this.#shouldValidate()) await this.#state.validate(this.#resource);
    else this.#state.skipValidation();
  }

  skipValidation() {
    this.#state.skipValidation();
    return this;
  }

  #shouldValidate() {
    if (this.#config.validate === 'ALWAYS') return true;
    if (this.#config.validate === 'CREATE' && !this.#metadata.releasedAt) return true;
    if (this.#config.validate === 'IDLE' && Boolean(this.#metadata.releasedAt)) return true;
    return false;
  }

  async acquire() {
    await this.#state.acquire();
    this.#metadata.acquiredAt = new Date();
    this.#metadata.acquired++;
    this.#request.assign(this.#resource);
  }

  abandon() {
    this.#state.abandon();
  }

  async release() {
    await this.#state.release();
    this.#metadata.releasedAt = new Date();
  }

  async destroy() {
    await this.#state.destroy(this.#resource);
    this.#metadata.destroyedAt = new Date();
    this.#resource = null;
  }

  segregate() {
    this.#state.segregate();
    this.#metadata.segregatedAt = new Date();
  }

  [inspect.custom]() {
    return `${this.constructor.name} { id: ${this.shortId}, state: ${this.#state.name} }`;
  }
}

module.exports = ResourceBay;
