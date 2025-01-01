const debug = require('debug')('XPool:bay:AcquiredState');
const BaseState = require('./BaseState');
const XPoolEvents = require('../../XPoolEvents');

class AcquiredState extends BaseState {

  get name() {
    return 'acquired';
  }

  async reset() {
    debug(`Resetting ${this.name} bay [${this._bay.shortId}]`);
    this._stateMachine.toReset();
    this.notify(XPoolEvents.RESOURCE_RESET);
  }

  skipReset() {
    debug(`Skipped reset for ${this.name} bay [${this._bay.shortId}]`);
    this._stateMachine.toReset();
  }

  async destroy() {
    debug(`Dooming ${this.name} bay [${this._bay.shortId}]`);
    this._stateMachine.toDoomed();
    await this._bay.destroy();
  }
}

module.exports = AcquiredState;
