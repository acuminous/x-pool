const debug = require('debug')('XPool:bay:DoomedState');
const BaseState = require('./BaseState');
const Command = require('../../command/Command');
const Events = require('../Events');

class DoomedState extends BaseState {

  #destroyResource;

  constructor(stateMachine, partition, destroyResource) {
    super(stateMachine, partition);
    this.#destroyResource = destroyResource;
  }

  get name() {
    return 'doomed';
  }

  async destroy(resource) {
    debug(`Destroying ${this.name} bay [${this._bay.shortId}]`);
    this.#destroyResource.on(Command.SUCCESS, (payload) => this.#onDestroySuccess(payload));
    this.#destroyResource.on(Command.ERROR, (payload) => this.#onDestroyError(payload));
    this.#destroyResource.on(Command.TIMEOUT, (payload) => this.#onDestroyTimeout(payload));
    this.#destroyResource.on(Command.POST_TIMEOUT_SUCCESS, (payload) => this.#onBelatedDestroySuccess(payload));
    this.#destroyResource.on(Command.POST_TIMEOUT_ERROR, (payload) => this.#onBelatedDestroyError(payload));
    await this.#destroyResource.execute(resource).catch((error) => {});
  }

  segregate() {
    debug(`Segregating ${this.name} bay [${this._bay.shortId}]`);
    this._stateMachine.toSegregated();
    this.notify(Events.RESOURCE_SEGREGATED);
  }

  #onDestroySuccess() {
    debug(`Successfully destroyed ${this.name} bay [${this._bay.shortId}]`);
    this._stateMachine.toDestroyed();
    this.notify(Events.RESOURCE_DESTROYED);
  }

  #onDestroyError({ error }) {
    debug(`Error destroying ${this.name} bay [${this._bay.shortId}]`, error);
    this.notify(Events.RESOURCE_DESTRUCTION_ERROR, { error });
    this._bay.segregate();
  }

  #onDestroyTimeout({ timeout }) {
    debug(`Timedout after ${timeout.toLocaleString()}ms destroying ${this.name} bay [${this._bay.shortId}]`);
    this.notify(Events.RESOURCE_DESTRUCTION_TIMEOUT, { timeout });
    this._bay.segregate();
  }

  #onBelatedDestroySuccess() {
    debug(`Belated success destroying ${this.name} bay [${this._bay.shortId}]`);
    this._stateMachine.toDestroyed();
    this.notify(Events.RESOURCE_DESTROYED);
  }

  #onBelatedDestroyError({ error }) {
    debug(`Belated error destroying ${this.name} bay [${this._bay.shortId}]`, error);
    this.notify(Events.RESOURCE_DESTRUCTION_ERROR, { error });
    this._bay.segregate();
  }
}

module.exports = DoomedState;
