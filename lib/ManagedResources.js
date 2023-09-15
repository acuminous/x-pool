const ManagedResource = require('./ManagedResource');

module.exports = class ManagedResources {

  #list = [];
  #factory;
  #maxSize;

  constructor({ factory, maxSize }) {
    this.#factory = factory;
    this.#maxSize = maxSize;
  }

  add() {
    const managedResource = new ManagedResource({ factory: this.#factory });
    this.#list.push(managedResource);
    return managedResource;
  }

  release(resource) {
    const managedResource = this.#list.find((managedResource) => managedResource.wraps(resource));
    return Boolean(managedResource?.idle());
  }

  async destroy(resource) {
    const index = this.#list.findIndex((managedResource) => managedResource.wraps(resource));
    if (index < 0) return false;

    const managedResource = this.#list[index];
    await managedResource.destroy();

    this.#list.splice(index, 1);
    return true;
  }

  async destroyIdleResources() {
    const destroys = this.#list.filter((managedResource) => managedResource.isIdle()).map((managedResource) => this.destroy(managedResource.resource));
    return Promise.all(destroys);
  }

  quarantine(resource) {
    const managedResource = this.#list.find((managedResource) => managedResource.wraps(resource));
    managedResource.quarantine();
  }

  hasQuarantinedResources() {
    return Boolean.find((managedResource) => managedResource.isQuarantined());
  }

  evictQuarantinedResources() {
    this.#list.filter((managedResource) => managedResource.isQuarantined()).forEach((managedResource) => {
      const index = this.#list.indexOf(managedResource);
      this.#list.splice(index, 1);
    });
  }

  hasIdleResources() {
    return Boolean(this.getIdleManagedResource());
  }

  getIdleManagedResource() {
    return this.#list.find((managedResource) => managedResource.isIdle());
  }

  hasAcquiredResources() {
    return Boolean(this.#list.find((managedResource) => managedResource.isAcquired()));
  }

  hasSpareCapacity() {
    return this.#list.length < this.#maxSize;
  }

  hasBusyResources() {
    return this.hasAcquiringResources() || this.hasAcquiredResources() || this.hasQuarantinedResources();
  }

  stats() {
    return this.#list.reduce((stats, managedResource) => managedResource.updateStats(stats), this.#initStats());
  }

  #initStats() {
    return Object.values(ManagedResource.States).reduce((stats, state) => Object.assign(stats, { [state.description]: 0 }), {});
  }
};
