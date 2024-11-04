const BaseRequest = require('./BaseRequest');

class UnqueuedRequest extends BaseRequest {

	#queued;
	#factory;

  constructor(queued, factory) {
		super();
    this.#queued = queued;
    this.#factory = factory;
  }

  get name() {
  	return 'unqueued';
  }

  queue(request) {
    this.#queued.push(request);
    return this.#factory.createQueuedRequest();
  }
}

module.exports = UnqueuedRequest;
