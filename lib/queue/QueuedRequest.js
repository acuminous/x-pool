const BaseRequest = require('./BaseRequest');
const ArrayUtils = require('../utils/ArrayUtils');

class QueuedRequest extends BaseRequest {

	#queued;
	#dispatched;
	#factory;

	constructor(queued, dispatched, factory) {
		super();
  	this.#queued = queued;
  	this.#dispatched = dispatched;
  	this.#factory = factory;
	}

  get name() {
  	return 'queued';
  }

  abort(request, error) {
    ArrayUtils.remove(request, this.#queued);
    return this.#factory.createAbortedRequest(error);
  }

  dispatch(request) {
    ArrayUtils.move(request, this.#queued, this.#dispatched);
    return this.#factory.createDispatchedRequest();
  }
}

module.exports = QueuedRequest;
