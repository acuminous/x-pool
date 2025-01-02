const { EventEmitter } = require('node:events');
const { inspect } = require('node:util');
const fwd = require('fwd');
const { scope } = require('../XPoolDebug');
const { shortId } = require('../utils/IdUtils');

const { ValidateOptions, ResetOptions } = require('../XPoolConfig');
const StateMachine = require('./StateMachine');

class ResourceBay extends EventEmitter {

  #id = shortId();
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

  get #state() {
    return this.#stateMachine.state;
  }

  forwardEvents(target) {
    fwd(this, target);
    return this;
  }

  setResource(resource) {
    this.#resource = resource;
  }

  validated() {
    this.#metadata.validatedAt = new Date();
  }

  contains(resource) {
    return resource !== null && this.#resource === resource;
  }

  reserve(request) {
    return scope(`bay:${this.id}`, () => {
      this.#state.reserve();
      this.#metadata.reservedAt = new Date();
      request.setBay(this);
      return this;
    });
  }

  async provision() {
    await scope(`bay:${this.id}`, async () => {
      await this.#state.provision();
    });
  }

  async validate() {
    await scope(`bay:${this.id}`, async () => {
      if (this.#shouldValidate()) await this.#state.validate(this.#resource);
      else this.#state.skipValidation();
    });
  }

  skipValidation() {
    return scope(`bay:${this.id}`, () => {
      this.#state.skipValidation();
      return this;
    });
  }

  #shouldValidate() {
    if (this.#config.validate === ValidateOptions.ALWAYS_VALIDATE) return true;
    if (this.#config.validate === ValidateOptions.VALIDATE_NEW && !this.#metadata.releasedAt) return true;
    if (this.#config.validate === ValidateOptions.VALIDATE_IDLE && Boolean(this.#metadata.releasedAt)) return true;
    return false;
  }

  async acquire() {
    return scope(`bay:${this.id}`, async () => {
      await this.#state.acquire();
      this.#metadata.acquiredAt = new Date();
      this.#metadata.acquired++;
      return this.#resource;
    });
  }

  abandon() {
    scope(`bay:${this.id}`, () => {
      this.#state.abandon();
    });
  }

  async reset() {
    await scope(`bay:${this.id}`, async () => {
      if (this.#shouldReset()) await this.#state.reset(this.#resource);
      else this.#state.skipReset();
    });
  }

  #shouldReset() {
    if (this.#config.reset === ResetOptions.ALWAYS_RESET) return true;
    return false;
  }

  skipReset() {
    scope(`bay:${this.id}`, () => {
      this.#state.skipReset();
      return this;
    });
  }

  release() {
    scope(`bay:${this.id}`, () => {
      this.#state.release();
      this.#metadata.releasedAt = new Date();
    });
  }

  async destroy() {
    await scope(`bay:${this.id}`, async () => {
      await this.#state.destroy(this.#resource);
      this.#metadata.destroyedAt = new Date();
      this.#resource = null;
    });
  }

  segregate() {
    scope(`bay:${this.id}`, () => {
      this.#state.segregate();
      this.#metadata.segregatedAt = new Date();
    });
  }

  [inspect.custom]() {
    return `${this.constructor.name} { id: ${this.id}, state: ${this.#state.name} }`;
  }
}

module.exports = ResourceBay;
