const { EventEmitter } = require('node:events');
const debug = require('debug')('XPool:Berth');
const AsyncLatch = require('./utils/AsyncLatch');

class Berth extends EventEmitter {
  #id;
  #status = 'empty';
  #request;
  #resource;
  #commands;
  #createLatch = new AsyncLatch();

  constructor(id, commands) {
    super();
    this.#id = id;
    this.#commands = commands;
  }

  get id() {
    return this.#id;
  }

  get #requestId() {
    return this.#request ? this.#request.id : 'N/A'
  }

  isInitialising() {
    return ['empty', 'reserved', 'creating'].includes(this.#status);
  }

  isIdle() {
    return this.#status === 'idle'
  }

  isBusy() {
    return this.#status === 'busy'
  }

  isDestroying() {
    return this.#status === 'destroying';
  }

  isSegregated() {
    return this.#status === 'segregated'
  }

  contains(resource) {
    return this.#resource === resource;
  }

  reserve(request) {
    debug(`Reserving berth [${this.id}] for request [${this.#requestId}]`)
    this.#request = request;
    this.#status = 'reserved';
    return this;
  }

  async provision() {
    debug(`Provisioning resource to berth [${this.id}] for request [${this.#requestId}]`);
    await this.#createResource();
    this.#status = 'idle';
  }

  async acquire() {
    debug(`Acquiring resource from berth [${this.id}] for request [${this.#requestId}]`)
    if (!this.#resource) await this.#createResource();
    if (this.#request.isAborted()) throw new Error('Request aborted');
    this.#status = 'busy';
    return this.#resource;
  }

  async release() {
    debug(`Releasing resource from berth [${this.id}] for request [${this.#requestId}]`);
    this.#request = null;
    this.#status = 'idle';
    this.emit('resource_released');
  }

  async destroy(onEventualSuccess) {
    debug(`Destroying berth [${this.id}] for request [${this.#requestId}]`);
    this.#status = 'destroying';
    await this.#createLatch.block();
    await this.#destroyResource(onEventualSuccess)
  }

  segregate() {
    debug(`Segregating berth [${this.id}] for request [${this.#requestId}]`)
    this.#status = 'segregated';
    this.emit('resource_segregated');
  }

  async #createResource() {
    this.#status = 'creating';
    this.#createLatch.activate();

    const onEventualSuccess = (resource) => {
      debug(`Resource created in berth [${this.id}] for request [${this.#requestId}]`);
      this.#resource = resource;
      this.emit('resource_created');
      this.#createLatch.release();
    }

    const onEventualError = (err) => {
      this.emit('resource_creation_error', err)
      this.#createLatch.release();
    }

    await this.#commands.create.execute(onEventualSuccess, onEventualError);
  }

  async #destroyResource(onEventualSuccess) {
    if (!this.#resource) return onEventualSuccess();
    await this.#commands.destroy.execute(this.#resource, () => {
      debug(`Resource from berth [${this.id}] destroyed for request [${this.#requestId}]`);
      onEventualSuccess();
      this.emit('resource_destroyed');
    });
  }
}

module.exports = Berth;
