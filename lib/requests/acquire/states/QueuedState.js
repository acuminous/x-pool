const BaseState = require('./BaseState');

class QueuedState extends BaseState {

  get name() {
  	return 'queued';
  }

  abort(error) {
  	this._request._toAborted(error);
  }

  dispatch() {
  	this._request._toDispatched();
  }
}

module.exports = QueuedState;
