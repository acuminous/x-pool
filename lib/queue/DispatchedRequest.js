const BaseRequest = require('./BaseRequest');
const ArrayUtils = require('../utils/ArrayUtils');

class DispatchedRequest extends BaseRequest {

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
  	return 'dispatched';
  }

  abort(request) {
    ArrayUtils.remove(request, this.#dispatched);
    return this.#factory.createAbortedRequest();
  }

  requeue(request) {
    ArrayUtils.remove(request, this.#dispatched);
    this.#queued.unshift(request);
    return this.#factory.createQueuedRequest();
	}

	dequeue(request) {
    ArrayUtils.remove(request, this.#dispatched);
    return this.#factory.createFulfilledRequest();
	}

}

module.exports = DispatchedRequest;
