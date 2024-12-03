const debug = require('debug')('XPool:bay:DestroyedState');
const BaseState = require('./BaseState');

class DestroyedState extends BaseState {

  get name() {
    return 'destroyed';
  }

  destroy() {
    debug(`Suppressing request to destroy ${this.name} bay [${this._bay.shortId}]`);
  }

  transition() {
    throw new Error('Bays cannot change state once destroyed');
  }

  accept(bay) {
    this._bay = bay;
    return this;
  }
}

module.exports = DestroyedState;
