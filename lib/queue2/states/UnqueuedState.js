const BaseState = require('./BaseState');

class UnqueuedState extends BaseState {

  get name() {
  	return 'unqueued';
  }

  queue() {
  	this._request._toQueued()
  }

  moveTo(destination) {
    destination.accept(this._request);
    return destination;
  }

  accept(request) {
    this._request = request;
    return this;
  }
}

module.exports = UnqueuedState;
