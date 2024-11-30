const debug = require('debug')('XPool:bay:IdleState');
const BaseState = require('./BaseState');

class IdleState extends BaseState {

  get name() {
    return 'idle';
  }

  abort() {
    debug(`Suppressing request to abort ${this._bay.state} bay [${this._bay.shortId}]`);
  }

  reserve() {
    debug(`Reserving ${this._bay.state} bay [${this._bay.shortId}]`);
    this._bay._toReady();
  }
}

module.exports = IdleState
