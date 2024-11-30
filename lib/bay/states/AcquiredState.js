const debug = require('debug')('XPool:bay:AcquiredState');
const BaseState = require('./BaseState');
const { RESOURCE_RELEASED } = require('../Events');

class AcquiredState extends BaseState {

  get name() {
    return 'acquired';
  }

  async release() {
    debug(`Releasing ${this._bay.state} bay [${this._bay.shortId}]`);
    this._bay._toIdle();
    this.notify(RESOURCE_RELEASED);
  }

  async destroy() {
    debug(`Dooming ${this._bay.state} bay [${this._bay.shortId}]`);
    this._bay._toDoomed();
    await this._bay.destroy();
  }
}

module.exports = AcquiredState
