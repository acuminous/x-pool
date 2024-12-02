const debug = require('debug')('XPool:bay:ReadyState');
const BaseState = require('./BaseState');
const Events = require('../Events');

class ReadyState extends BaseState {

  get name() {
    return 'ready';
  }

  async provision() {
    debug(`${this.name} bay [${this._bay.shortId}] is already provisioned`);
  }

  async release() {
    debug(`Releasing ${this.name} bay [${this._bay.shortId}]`);
    this._stateMachine.toIdle();
    this.notify(Events.RESOURCE_RELEASED);
  }

  async acquire() {
    debug(`Acquiring ${this.name} bay [${this._bay.shortId}]`);
    this._stateMachine.toAcquired();
    this.notify(Events.RESOURCE_ACQUIRED);
  }

  async destroy() {
    debug(`Dooming ${this.name} bay [${this._bay.shortId}]`);
    this._stateMachine.toDoomed();
    await this._bay.destroy();
  }
}

module.exports = ReadyState;
