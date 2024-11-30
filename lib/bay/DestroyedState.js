const debug = require('debug')('XPool:bay:DestroyedState');
const BaseState = require('./BaseState');

class DestroyedState extends BaseState {

	get name() {
		return 'destroyed';
	}

  destroy() {
    debug(`Bay [${this._bay.shortId}] is already destroyed`);
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
