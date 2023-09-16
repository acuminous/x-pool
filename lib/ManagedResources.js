const ManagedResource = require('./ManagedResource');

module.exports = class ManagedResources {

  #list = [];
  #index = new Map();
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

  index(managedResource) {
    this.#index.set(managedResource.resource, managedResource);
  }

  release(resource) {
    const managedResource = this.#index.get(resource);
    managedResource?.idle();
  }

  async destroy(resource) {
    const managedResource = this.#index.get(resource);
    if (!managedResource) return;

    await managedResource.destroy();
    this.#removeManagedResource(managedResource);
  }

  async destroyIdleResources() {
    const destroys = this.#list.map((managedResource, index) => {
      if (!managedResource.isIdle()) return;
      return this.destroy(managedResource.resource).then(() => this.#removeManagedResource(managedResource, index));
    });
    return Promise.all(destroys);
  }

  #removeManagedResource(managedResource, index = this.#list.indexOf(managedResource)) {
    this.#index.delete(managedResource.resource);
    this.#list.splice(index, 1);
  }

  quarantine(resource) {
    const managedResource = this.#index.get(resource);
    managedResource.quarantine();
  }

  hasQuarantinedResources() {
    return this.#list.some((managedResource) => managedResource.isQuarantined());
  }

  evictQuarantinedResources() {
    this.#list = this.#list.filter((managedResource) => !managedResource.isQuarantined());
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
