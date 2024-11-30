const debug = require('debug')('XPool:bay:ReadyState');
const BaseState = require('./BaseState');
const { RESOURCE_RELEASED, RESOURCE_ACQUIRED } = require('../Events');

class ReadyState extends BaseState {

	get name() {
		return 'ready';
	}

	async provision() {
    debug(`${this._bay.state} bay [${this._bay.shortId}] is already provisioned`);
	}

	async release() {
    debug(`Releasing ${this._bay.state} bay [${this._bay.shortId}]`);
		this._bay._toIdle();
    this.notify(RESOURCE_RELEASED);
	}

	async acquire() {
    debug(`Acquiring ${this._bay.state} bay [${this._bay.shortId}]`);
		this._bay._toAcquired();
    this.notify(RESOURCE_ACQUIRED);
	}

  async destroy() {
    debug(`Dooming ${this._bay.state} bay [${this._bay.shortId}]`);
    this._bay._toDoomed();
    await this._bay.destroy();
  }
}

module.exports = ReadyState
