const debug = require('debug')('XPool:bay:BaseState');

class BaseState {

	_bay;
	_ward;

	constructor(ward) {
		this._ward = ward;
	}

  moveTo(destination) {
    this._ward.move(this._bay, destination);
    return destination;
  }

  accept(bay) {
  	this._bay = bay;
    this._ward.accept(this._bay);
    return this;
  }

  notify(event, payload) {
  	this._bay.emit(event, { ...payload, leaseId: this._bay.leaseId });
  }

	reserve() {
  	this.#reportInvalidOperation('reserve');
	}

	async provision() {
  	this.#reportInvalidOperation('provision');
	}

	async release() {
  	this.#reportInvalidOperation('release');
	}

  async acquire() {
  	this.#reportInvalidOperation('acquire');
  }

  abort() {
    this.#reportInvalidOperation('abort');
  }

  async destroy() {
  	this.#reportInvalidOperation('destroy');
  }

  segregate() {
  	this.#reportInvalidOperation('segregate');
  }

	#reportInvalidOperation(operation) {
  	throw new Error(`Cannot ${operation} ${this.name} bays`);
	}

}

module.exports = BaseState;
