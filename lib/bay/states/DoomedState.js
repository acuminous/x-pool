const { debug } = require('../../XPoolDebug');
const BaseState = require('./BaseState');
const Command = require('../../command/Command');
const XPoolEvents = require('../../XPoolEvents');

class DoomedState extends BaseState {

  #destroyResource;

  constructor(stateMachine, store, destroyResource) {
    super(stateMachine, store);
    this.#destroyResource = destroyResource;
  }

  get name() {
    return 'doomed';
  }

  async destroy(resource) {
    debug(`Destroying ${this.name} bay`);
    this.#destroyResource.on(Command.SUCCESS, (payload) => this.#onDestroySuccess(payload));
    this.#destroyResource.on(Command.ERROR, (payload) => this.#onDestroyError(payload));
    this.#destroyResource.on(Command.TIMEOUT, (payload) => this.#onDestroyTimeout(payload));
    this.#destroyResource.on(Command.POST_TIMEOUT_SUCCESS, (payload) => this.#onBelatedDestroySuccess(payload));
    this.#destroyResource.on(Command.POST_TIMEOUT_ERROR, (payload) => this.#onBelatedDestroyError(payload));
    await this.#destroyResource.execute(resource).catch(() => {});
  }

  abandon() {
    debug(`Suppressing request to abandon ${this.name} bay`);
  }

  segregate() {
    debug(`Segregating ${this.name} bay`);
    this._stateMachine.toTimedout();
    this.notify(XPoolEvents.RESOURCE_SEGREGATED);
  }

  #onDestroySuccess() {
    debug(`Successfully destroyed ${this.name} bay`);
    this._stateMachine.toDestroyed();
    this.notify(XPoolEvents.RESOURCE_DESTROYED);
  }

  #onDestroyError({ error }) {
    debug(`Error destroying ${this.name} bay`, error);
    this.notify(XPoolEvents.RESOURCE_DESTRUCTION_ERROR, { error });
    this._stateMachine.toZombie();
  }

  #onDestroyTimeout({ timeout }) {
    debug(`Timedout after ${timeout.toLocaleString()}ms destroying ${this.name} bay`);
    this.notify(XPoolEvents.RESOURCE_DESTRUCTION_TIMEOUT, { timeout });
    this._bay.segregate();
  }

  #onBelatedDestroySuccess() {
    debug(`Belated success destroying ${this.name} bay`);
    this._stateMachine.toDestroyed();
    this.notify(XPoolEvents.RESOURCE_DESTROYED);
  }

  #onBelatedDestroyError({ error }) {
    debug(`Belated error destroying ${this.name} bay`, error);
    this.notify(XPoolEvents.RESOURCE_DESTRUCTION_ERROR, { error });
    this._stateMachine.toZombie();
  }
}

module.exports = DoomedState;
