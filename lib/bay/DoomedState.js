const debug = require('debug')('XPool:bay:DoomedState');
const BaseState = require('./BaseState');
const Command = require('../command/Command');
const BayEvents = require('./Events');

class DoomedState extends BaseState {

  #destroyResource;

  constructor(ward, destroyResource) {
    super(ward);
    this.#destroyResource = destroyResource;
  }

	get name() {
		return 'doomed';
	}

  async destroy(resource) {
    debug(`Destroying ${this._bay.state} bay [${this._bay.shortId}]`);
    this.#destroyResource.on(Command.SUCCESS, (payload) => this.#onDestroySuccess(payload));
    this.#destroyResource.on(Command.ERROR, (payload) => this.#onDestroyError(payload))
    this.#destroyResource.on(Command.TIMEOUT, (payload) => this.#onDestroyTimeout(payload))
    this.#destroyResource.on(Command.POST_TIMEOUT_SUCCESS, (payload) => this.#onBelatedDestroySuccess(payload))
    this.#destroyResource.on(Command.POST_TIMEOUT_ERROR, (payload) => this.#onBelatedDestroyError(payload))
    await this.#destroyResource.execute(resource).catch((error) => {});
  }

  #onDestroySuccess() {
    debug(`Successfully destroyed ${this._bay.state} bay [${this._bay.shortId}]`);
    this._bay._toDestroyed();
    this.notify(BayEvents.RESOURCE_DESTROYED);
  }

  #onDestroyError({ error }) {
    debug(`Error destroying ${this._bay.state} bay [${this._bay.shortId}]`, error);
    this.notify(BayEvents.RESOURCE_DESTRUCTION_ERROR, { error });
    this._bay.segregate();
  }

  #onDestroyTimeout({ timeout }) {
    debug(`Timedout after ${timeout.toLocaleString()}ms destroying ${this._bay.state} bay [${this._bay.shortId}]`)
    this.notify(BayEvents.RESOURCE_DESTRUCTION_TIMEOUT, { timeout });
    this._bay.segregate();
  }

  #onBelatedDestroySuccess() {
    debug(`Belated success destroying ${this._bay.state} bay [${this._bay.shortId}]`);
    this.notify(BayEvents.RESOURCE_DESTROYED);
    this._bay._toDestroyed();
  }

  #onBelatedDestroyError({ error }) {
    debug(`Belated error destroying ${this._bay.state} bay [${this._bay.shortId}]`, error);
    this.notify(BayEvents.RESOURCE_DESTRUCTION_ERROR, { error });
    this._bay.segregate();
  }

  segregate() {
    debug(`Segregating ${this._bay.state} bay [${this._bay.shortId}]`);
    this._bay._toSegregated();
    this.notify(BayEvents.RESOURCE_SEGREGATED);
  }
}

module.exports = DoomedState;
