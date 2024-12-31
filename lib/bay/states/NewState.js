const debug = require('debug')('XPool:bay:NewState');
const BaseState = require('./BaseState');

class NewState extends BaseState {

  get name() {
    return 'new';
  }

  reserve() {
    debug(`Reserving ${this.name} bay [${this._bay.shortId}]`);
    this._stateMachine.toEmpty();
  }

  accept(bay) {
    this._store.add(bay);
    return super.accept(bay);
  }
}

module.exports = NewState;
