const BaseState = require('./BaseState');

class NewState extends BaseState {

  get name() {
    return 'new';
  }

  queue() {
    this._stateMachine.toQueued();
  }

  accept(request) {
    this._store.add(request);
    return super.accept(request);
  }
}

module.exports = NewState;
