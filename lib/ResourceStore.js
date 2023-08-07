const { validateNumber } = require('./validation');

module.exports = class ResourceSstore {

  constructor(options) {
    this._maxSize = validateNumber('maxSize', options, false, 1) || Infinity;
    this._idle = [];
    this._acquired = [];
  }

  isExhausted() {
    return this._maxSize === this._acquired.length;
  }

  addIdleResource(resource) {
    this._idle.push(resource);
  }

  addAcquiredResource(resource) {
    this._acquired.push(resource);
  }

  releaseAcquiredResource(resource) {
    if (this._removeAcquiredResource(resource)) this.addIdleResource(resource);
  }

  removeAcquiredResource(resource) {
    this._removeAcquiredResource(resource);
  }

  _removeAcquiredResource(resource) {
    const index = this._acquired.indexOf(resource);
    if (index < 0) return false;

    this._acquired.splice(index, 1);
    return true;
  }

  getIdleResource() {
    return this._idle.shift();
  }

  stats() {
    return {
      size: this._acquired.length + this._idle.length,
      acquired: this._acquired.length,
      idle: this._idle.length,
      available: this._maxSize - this._acquired.length,
    };
  }

};
