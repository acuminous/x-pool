const BaseState = require('./BaseState');

class DispatchedState extends BaseState {

  #factory;
  #bay;

  get name() {
    return 'dispatched';
  }

  abort(bay) {
    this._stateMachine.toAborted();
    bay.abandon();
  }

  requeue() {
    this._stateMachine.toQueued();
  }

  dequeue(resource) {
    this._stateMachine.toFulfilled();
    this._request.finalise(resource);
  }

}

module.exports = DispatchedState;
