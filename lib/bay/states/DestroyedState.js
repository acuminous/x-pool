const debug = require('debug')('XPool:bay:DestroyedState');
const BaseState = require('./BaseState');

class DestroyedState extends BaseState {

  get name() {
    return 'destroyed';
  }

  destroy() {
    debug(`Suppressing request to destroy ${this._bay.state} bay [${this._bay.shortId}]`);
  }

  moveTo() {
    throw new Error('Cannot move bay once it has been destroyed');
  }

  accept(bay) {
    this._bay = bay;
    return this;
  }
}

module.exports = DestroyedState;
