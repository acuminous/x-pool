const debug = require('debug')('XPool:bay:EmptyState');
const BaseState = require('./BaseState');

class EmptyState extends BaseState {

  get name() {
    return 'empty';
  }

  reserve() {
    debug(`Reserving ${this.name} bay [${this._bay.shortId}]`);
    this._stateMachine.toPending();
  }
}

module.exports = EmptyState;
