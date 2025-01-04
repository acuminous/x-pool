const BaseState = require('./BaseState');
const InvalidOperation = require('../../errors/InvalidOperation');

class NewState extends BaseState {

  constructor(stateMachine, store, request) {
    super(stateMachine, store);
    store.add(request);
    this._accept(request);
  }

  get name() {
    return 'new';
  }

  queue() {
    this._stateMachine.toQueued();
  }

  accept() {
    throw new InvalidOperation(`Cannot accept from ${this.name} request`);
  }
}

module.exports = NewState;
