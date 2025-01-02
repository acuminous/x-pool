const { debug } = require('../../XPoolDebug');
const BaseState = require('./BaseState');
const XPoolEvents = require('../../XPoolEvents');

class ResetState extends BaseState {

  get name() {
    return 'reset';
  }

  release() {
    debug(`Releasing ${this.name} bay`);
    this._stateMachine.toIdle();
    this.notify(XPoolEvents.RESOURCE_RELEASED);
  }
}

module.exports = ResetState;
