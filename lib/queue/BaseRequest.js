class BaseRequest {

  queue() {
  	throw new Error(`queue is an invalid operation for ${this.name} requests`);
  }

  abort() {
  	throw new Error(`abort is an invalid operation for ${this.name} requests`);
  }

  dispatch() {
  	throw new Error(`dispatch is an invalid operation for ${this.name} requests`);
  }

  requeue() {
  	throw new Error(`requeue is an invalid operation for ${this.name} requests`);
	}

	dequeue() {
  	throw new Error(`dequeue is an invalid operation for ${this.name} requests`);
	}
}

module.exports = BaseRequest;
