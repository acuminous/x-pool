module.exports = class ManagedResource {

  static States = Object.freeze({
    ACQUIRING: Symbol('acquiring'),
    CREATING: Symbol('creating'),
    VALIDATING: Symbol('validating'),
    IDLE: Symbol('idle'),
    ACQUIRED: Symbol('acquired'),
    DESTROYING: Symbol('destroying'),
    QUARANTINED: Symbol('quarantined'),
  });

  #factory;
  #state = ManagedResource.States.ACQUIRING;
  #resource;

  constructor({ factory }) {
    this.#factory = factory;
  }

  get resource() {
    return this.#resource;
  }

  wraps(resource) {
    return this.#resource === resource;
  }

  isIdle() {
    return this.#state === ManagedResource.States.IDLE;
  }

  isAcquired() {
    return this.#state === ManagedResource.States.ACQUIRED;
  }

  isQuarantined() {
    return this.#state === ManagedResource.States.QUARANTINED;
  }

  async create() {
    this.#state = ManagedResource.States.CREATING;
    this.#resource = await this.#factory.create();
    return this;
  }

  async validate() {
    this.#state = ManagedResource.States.VALIDATING;
    await this.#factory.validate(this.#resource);
    return this;
  }

  idle() {
    this.#state = ManagedResource.States.IDLE;
    return this;
  }

  acquire() {
    this.#state = ManagedResource.States.ACQUIRED;
    return this;
  }

  async destroy() {
    this.#state = ManagedResource.States.DESTROYING;
    await this.#factory.destroy(this.#resource);
    return this;
  }

  quarantine() {
    this.#state = ManagedResource.States.QUARANTINED;
    return this;
  }

  updateStats(stats) {
    const key = this.#state.description;
    return { ...stats, [key]: stats[key] + 1 };
  }
};
