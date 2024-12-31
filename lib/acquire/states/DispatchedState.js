const BaseState = require('./BaseState');

class DispatchedState extends BaseState {

  #queued;
  #dispatched;
  #factory;
  #bay;
  #resource;

  get name() {
    return 'dispatched';
  }

  associate(bay) {
    this.#bay = bay;
  }

  assign(resource) {
    this.#resource = resource;
  }

  abort(error) {
    this._stateMachine.toAborted(error);
    this.#bay.abandon();
  }

  requeue() {
    this._stateMachine.toQueued();
  }

  dequeue() {
    this._stateMachine.toFulfilled();
    this._request.finalise(this.#resource);
  }

}

module.exports = DispatchedState;
