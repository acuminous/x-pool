const debug = require('debug')('XPool:Request');
const AsyncLatch = require('./utils/AsyncLatch');

const Dispositions = {
  QUEUED: Symbol('queued'),
  DISPATCHED: Symbol('dispatched'),
}

class Request {

  #id;
  #handler;
  #stats;
  #location = Dispositions.QUEUED;
  #aborted = false;
  #attempts = 0;
  #responseLatch = new AsyncLatch();

  constructor(id, handler, stats) {
    this.#id = id;
    this.#handler = handler;
    this.#stats = stats;
    this.#responseLatch.activate();
  }

  get id() {
    return this.#id;
  }

  get attempts() {
    return this.#attempts;
  }

  isQueued() {
    return this.#location === Dispositions.QUEUED;
  }

  queue() {
    debug(`Queueing request [${this.#id}]`)
    this.#stats.queued();
  }

  dispatch() {
    debug(`Dispatching request [${this.#id}]`);
    this.#location = Dispositions.DISPATCHED;
    this.#attempts++;
    this.#stats.dispatched();
    this.#handler(this);
  }

  requeue() {
    debug(`Requeueing request [${this.#id}]`);
    this.#location = Dispositions.QUEUED;
    this.#stats.requeued();
  }

  isAborted() {
    return this.#aborted;
  }

  abort() {
    debug(`Aborting request [${this.#id}]`);
    this.#aborted = true;
    this.#responseLatch.release();
  }

  remove() {
    debug(`Removing request [${this.#id}]`);
    if (this.#location === Dispositions.QUEUED) this.#stats.removedFromQueued();
    else if (this.#location === Dispositions.DISPATCHED) this.#stats.removedFromDispatched();
  }

  async block() {
    return this.#responseLatch.block();
  }

  release(resource) {
    this.#responseLatch.release(resource);
  }
}

module.exports = Request;
