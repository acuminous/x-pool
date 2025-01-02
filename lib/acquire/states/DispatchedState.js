const BaseState = require('./BaseState');

class DispatchedState extends BaseState {

  #factory;
  #bay;

  get name() {
    return 'dispatched';
  }

  associate(bay) {
    this.#bay = bay;
  }

  abort(error) {
    this._stateMachine.toAborted(error);
    this.#bay.abandon();
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
