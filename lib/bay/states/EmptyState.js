const debug = require('debug')('XPool:bay:EmptyState');
const BaseState = require('./BaseState');

class EmptyState extends BaseState {

	get name() {
		return 'empty';
	}

	reserve() {
		debug(`Reserving ${this._bay.state} bay [${this._bay.shortId}]`);
		this._bay._toPending();
	}
}

module.exports = EmptyState;
