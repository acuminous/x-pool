const debug = require('debug')('XPool:bay:IdleState');
const BaseState = require('./BaseState');

class IdleState extends BaseState {

  get name() {
    return 'idle';
  }

  abandon() {
    debug(`Suppressing request to abandon ${this.name} bay [${this._bay.shortId}]`);
  }

  reserve() {
    debug(`Reserving ${this.name} bay [${this._bay.shortId}]`);
    this._stateMachine.toUnvalidated();
  }
}

module.exports = IdleState;
