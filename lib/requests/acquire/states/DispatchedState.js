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
  	this._request._toAborted(error);
    this.#bay.abort();
  }

  requeue() {
  	this._request._toQueued();
  }

  dequeue() {
    this._request._toFulfilled();
    this._request.finalise(this.#resource);
  }

}

module.exports = DispatchedState;
