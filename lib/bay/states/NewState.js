const { debug } = require('../../XPoolDebug');
const BaseState = require('./BaseState');
const InvalidOperation = require('../../errors/InvalidOperation');

class NewState extends BaseState {

  constructor(stateMachine, store, bay) {
    super(stateMachine, store);
    this._store.add(bay);
    this._accept(bay);
  }

  get name() {
    return 'new';
  }

  reserve() {
    debug(`Reserving ${this.name} bay`);
    this._stateMachine.toEmpty();
  }

  accept() {
    throw new InvalidOperation(`Cannot accept from ${this.name} bay`);
  }
}

module.exports = NewState;
