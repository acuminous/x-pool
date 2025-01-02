const { debug } = require('../../XPoolDebug');
const BaseState = require('./BaseState');

class IdleState extends BaseState {

  get name() {
    return 'idle';
  }

  abandon() {
    debug(`Suppressing request to abandon ${this.name} bay`);
  }

  reserve() {
    debug(`Reserving ${this.name} bay`);
    this._stateMachine.toProvisioned();
  }
}

module.exports = IdleState;
