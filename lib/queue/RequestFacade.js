const debug = require('debug')('XPool:RequestFacade');
const AsyncLatch = require('../utils/AsyncLatch');

class Request {

	#id;
	#handler;
	#state;
	#responseLatch;
	#resource;

	constructor(id, handler, factory) {
		this.#id = id;
		this.#handler = handler;
  	this.#state = factory.createUnqueuedRequest();
  	this.#responseLatch = new AsyncLatch();
	}

	get id() {
		return this.#id;
	}

	get shortId() {
		return this.#id.substring(0, 4)
	}

	get state() {
		return this.#state.name;
	}

	queue() {
    debug(`Queueing ${this.#state.name} request [${this.shortId}]`);
		this.#state = this.#state.queue(this);
		this.#responseLatch.activate();
		return this;
	}

	abort(error) {
    debug(`Aborting ${this.#state.name} request [${this.shortId}]`);
		this.#state = this.#state.abort(this, error);
	}

	dispatch() {
    debug(`Dispatching ${this.#state.name} request [${this.shortId}]`);
		this.#state = this.#state.dispatch(this);
    this.#handler(this);
	}

	associate(bay) {
		debug(`Associating ${bay.state} bay [${bay.shortId}] with ${this.#state.name} request [${this.shortId}]`);
		this.#state.associate(bay);
	}

	requeue() {
    debug(`Requeueing ${this.#state.name} request [${this.shortId}]`);
		this.#state = this.#state.requeue(this);
	}

	assign(resource) {
		this.#resource = resource;
	}

	dequeue() {
    debug(`Dequeueing ${this.#state.name} request [${this.shortId}]`);
		this.#state = this.#state.dequeue(this);
    this.#responseLatch.release(this.#resource);
	}

  async block() {
    return this.#responseLatch.block();
  }
}

module.exports = Request;
