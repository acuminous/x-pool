const { validateNumber } = require('./validation');

module.exports = class ResourceSstore {

  constructor(options) {
    this._maxSize = validateNumber('maxSize', options, false, 1) || Infinity;
    this._idle = [];
    this._acquired = [];
    this._bad = [];
  }

  isExhausted() {
    return this._maxSize === this._acquired.length;
  }

  getIdleResource() {
    return this._idle.shift();
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

  excludeBadResource(resource) {
    this._removeAcquiredResource(resource);
    this._bad.push(resource);
  }

  evictBadResources() {
    this._bad.length = 0;
  }

  stats() {
    return {
      size: this._acquired.length + this._idle.length + this._bad.length,
      idle: this._idle.length,
      acquired: this._acquired.length,
      bad: this._bad.length,
      available: this._maxSize - this._acquired.length - this._bad.length,
    };
  }

  _removeAcquiredResource(resource) {
    const index = this._acquired.indexOf(resource);
    if (index < 0) return false;

    this._acquired.splice(index, 1);
    return true;
  }
};
