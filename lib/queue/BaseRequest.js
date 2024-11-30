class BaseRequest {

  queue() {
  	this.#reportInvalidOperation('queue');
  }

  abort() {
  	this.#reportInvalidOperation('abort');
  }

  dispatch() {
  	this.#reportInvalidOperation('dispatch');
  }

  requeue() {
  	this.#reportInvalidOperation('requeue');
	}

  assign() {
    this.#reportInvalidOperation('assign');
  }

	dequeue() {
  	this.#reportInvalidOperation('dequeue');
	}

  #reportInvalidOperation(operation) {
    throw new Error(`${operation} is an invalid operation for ${this.name} requests`);
  }
}

module.exports = BaseRequest;
