module.exports = class WrappedResource {
  constructor(resource) {
    this._resource = resource;
  }

  get resource() {
    return this._resource;
  }
};
