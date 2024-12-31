const debug = require('debug')('XPool:bay:DestroyedState');
const InvalidOperation = require('../../errors/InvalidOperation');
const BaseState = require('./BaseState');

class DestroyedState extends BaseState {

  get name() {
    return 'destroyed';
  }

  destroy() {
    debug(`Suppressing request to destroy ${this.name} bay [${this._bay.shortId}]`);
  }

  abandon() {
    debug(`Suppressing request to abandon ${this.name} bay [${this._bay.shortId}]`);
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
