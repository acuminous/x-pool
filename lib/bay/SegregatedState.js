const debug = require('debug')('XPool:bay:SegregatedState');
const BaseState = require('./BaseState');

class SegregatedState extends BaseState {

	get name() {
		return 'segregated';
	}

	segregate() {
    debug(`Bay [${this._bay.shortId}] is already segregated`);
	}

	async destroy() {
    debug(`Dooming ${this._bay.state} bay [${this._bay.shortId}]`);
    this._bay._toDoomed();
    await this._bay.destroy();
	}

	evict() {
    debug(`Evicting ${this._bay.state} bay [${this._bay.shortId}]`);
		this._bay._toEvicted();
    this.notify(RESOURCE_EVICTED);
	}

}

module.exports = SegregatedState
