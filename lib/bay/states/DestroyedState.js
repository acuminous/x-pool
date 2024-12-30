const debug = require('debug')('XPool:bay:DestroyedState');
const InvalidOperation = require('../../errors/InvalidOperation');
const BaseState = require('./BaseState');

class DestroyedState extends BaseState {

  get name() {
    return 'destroyed';
  }

  abort() {
    debug(`Suppressing request to abort ${this.name} bay [${this._bay.shortId}]`);
  }

  destroy() {
    debug(`Suppressing request to destroy ${this.name} bay [${this._bay.shortId}]`);
  }

  transition() {
    throw new InvalidOperation('Bays cannot change state once destroyed');
  }

  accept(bay) {
    this._bay = bay;
    return this;
  }
}

module.exports = DestroyedState;
