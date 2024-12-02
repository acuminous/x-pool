const BaseState = require('./BaseState');

class QueuedState extends BaseState {

  get name() {
    return 'queued';
  }

  abort(error) {
    this._stateMachine.toAborted(error);
  }

  dispatch() {
    this._stateMachine.toDispatched();
  }
}

module.exports = QueuedState;
