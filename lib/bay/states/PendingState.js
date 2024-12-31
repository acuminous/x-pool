const debug = require('debug')('XPool:bay:PendingState');
const BaseState = require('./BaseState');
const Command = require('../../command/Command');
const XPoolEvents = require('../../XPoolEvents');

class PendingState extends BaseState {

  #createResource;

  constructor(stateMachine, store, createResource) {
    super(stateMachine, store);
    this.#createResource = createResource;
  }

  get name() {
    return 'pending';
  }

  async provision() {
    debug(`Provisioning ${this.name} bay [${this._bay.shortId}]`);
    this.#createResource.on(Command.SUCCESS, (payload) => this.#onCreateSuccess(payload));
    this.#createResource.on(Command.ERROR, (payload) => this.#onCreateError(payload));
    this.#createResource.on(Command.TIMEOUT, (payload) => this.#onCreateTimeout(payload));
    this.#createResource.on(Command.POST_TIMEOUT_SUCCESS, (payload) => this.#onBelatedCreateSuccess(payload));
    this.#createResource.on(Command.POST_TIMEOUT_ERROR, (payload) => this.#onBelatedCreateError(payload));
    this.#createResource.on(Command.POST_ABORT_SUCCESS, (payload) => this.#onBelatedCreateSuccess(payload));
    this.#createResource.on(Command.POST_ABORT_ERROR, (payload) => this.#onBelatedCreateError(payload));
    await this.#createResource.execute();
  }

  segregate() {
    debug(`Segregating ${this.name} bay [${this._bay.shortId}]`);
    this._stateMachine.toSegregated();
    this.notify(XPoolEvents.RESOURCE_SEGREGATED);
  }

  abandon() {
    debug(`Abandoning resource creation for ${this.name} bay [${this._bay.shortId}]`);
    this.segregate();
    this.#createResource.abort();
    this.notify(XPoolEvents.RESOURCE_CREATION_ABANDONED);
  }

  #onCreateSuccess({ resource }) {
    debug(`Successfully provisioned ${this.name} bay [${this._bay.shortId}]`);
    this._bay.created(resource);
    this._stateMachine.toUnvalidated();
    this.notify(XPoolEvents.RESOURCE_CREATED);
  }

  #onCreateError({ error }) {
    debug(`Error provisioning ${this.name} bay [${this._bay.shortId}]`, error);
    this.notify(XPoolEvents.RESOURCE_CREATION_ERROR, { error });
    this._stateMachine.toDestroyed();
  }

  #onCreateTimeout({ timeout }) {
    debug(`Timed out after ${timeout.toLocaleString()}ms provisioning ${this.name} bay [${this._bay.shortId}]`);
    this.notify(XPoolEvents.RESOURCE_CREATION_TIMEOUT, { timeout });
    this.segregate();
  }

  #onBelatedCreateSuccess({ resource }) {
    debug(`Belated success provisioning ${this.name} bay [${this._bay.shortId}]`);
    this._bay.created(resource);
    this.notify(XPoolEvents.RESOURCE_CREATED);
    this._bay.destroy();
  }

  #onBelatedCreateError = ({ error }) => {
    debug(`Belated error provisioning ${this.name} bay [${this._bay.shortId}]`, error);
    this.notify(XPoolEvents.RESOURCE_CREATION_ERROR, { error });
    this._bay.segregate();
  };
}

module.exports = PendingState;
