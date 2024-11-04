const debug = require('debug')('XPool:RequestFacade');
const AsyncLatch = require('../utils/AsyncLatch');

class Request {

	#id;
	#handler;
	#state;
	#responseLatch;

	constructor(id, handler, factory) {
		this.#id = id;
		this.#handler = handler;
  	this.#state = factory.createUnqueuedRequest();
  	this.#responseLatch = new AsyncLatch();
	}

	get id() {
		return this.#id;
	}

	get state() {
		return this.#state.name;
	}

	isAborted() {
		return this.#state.isAborted();
	}

	queue() {
    debug(`Queueing ${this.#state.name} request [${this.#id}]`);
		this.#state = this.#state.queue(this);
		this.#responseLatch.activate();
		return this;
	}

	abort() {
    debug(`Aborting ${this.#state.name} request [${this.#id}]`);
		this.#state = this.#state.abort(this);
	}

	dispatch() {
    debug(`Dispatching ${this.#state.name} request [${this.#id}]`);
		this.#state = this.#state.dispatch(this);
    this.#handler(this);
	}

	requeue() {
    debug(`Requeueing ${this.#state.name} request [${this.#id}]`);
		this.#state = this.#state.requeue(this);
	}

	dequeue() {
    debug(`Dequeueing ${this.#state.name} request [${this.#id}]`);
		this.#state = this.#state.dequeue(this);
	}

  async block() {
    return this.#responseLatch.block();
  }

  release(resource) {
    debug(`Releasing resource for request [${this.#id}]`);
    this.#responseLatch.release(resource);
  }
}

module.exports = Request;
