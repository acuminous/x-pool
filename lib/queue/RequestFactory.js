const UnqueuedRequest = require('./UnqueuedRequest');
const QueuedRequest = require('./QueuedRequest');
const DispatchedRequest = require('./DispatchedRequest');
const AbortedRequest = require('./AbortedRequest');
const FulfilledRequest = require('./FulfilledRequest');

class RequestFactory {

	#queued;
	#dispatched;

	constructor(queued, dispatched) {
  	this.#queued = queued;
  	this.#dispatched = dispatched;
	}

	createUnqueuedRequest() {
		return new UnqueuedRequest(this.#queued, this);
	}

	createQueuedRequest() {
		return new QueuedRequest(this.#queued, this.#dispatched, this);
	}

	createDispatchedRequest() {
		return new DispatchedRequest(this.#queued, this.#dispatched, this);
	}

	createAbortedRequest(error) {
		return new AbortedRequest(error);
	}

	createFulfilledRequest() {
		return new FulfilledRequest();
	}

}

module.exports = RequestFactory
