const BaseRequest = require('./BaseRequest');
const ArrayUtils = require('../utils/ArrayUtils');

class DispatchedRequest extends BaseRequest {

	#queued;
	#dispatched;
	#factory;
  #bay;

	constructor(queued, dispatched, factory) {
		super();
  	this.#queued = queued;
  	this.#dispatched = dispatched;
  	this.#factory = factory;
	}

  get name() {
  	return 'dispatched';
  }

  associate(bay) {
    this.#bay = bay;
  }

  abort(request, error) {
    ArrayUtils.remove(request, this.#dispatched);
    this.#bay.abort();
    return this.#factory.createAbortedRequest(error);
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
