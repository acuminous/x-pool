const debug = require('debug')('XPool:bay:AcquiredState');
const BaseState = require('./BaseState');
const XPoolEvents = require('../../XPoolEvents');

class AcquiredState extends BaseState {

  get name() {
    return 'acquired';
  }

  async release() {
    debug(`Releasing ${this.name} bay [${this._bay.shortId}]`);
    this._stateMachine.toIdle();
    this.notify(XPoolEvents.RESOURCE_RELEASED);
  }

  async destroy() {
    debug(`Dooming ${this.name} bay [${this._bay.shortId}]`);
    this._stateMachine.toDoomed();
    await this._bay.destroy();
  }
}

module.exports = AcquiredState;
