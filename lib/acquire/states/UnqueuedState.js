const BaseState = require('./BaseState');

class UnqueuedState extends BaseState {

  get name() {
    return 'unqueued';
  }

  queue() {
    this._stateMachine.toQueued();
  }

  accept(request) {
    this._store.add(request);
    return super.accept(request);
  }
}

module.exports = UnqueuedState;
