const debug = require('debug')('XPool:bay:PendingState');
const BaseState = require('./BaseState');
const Command = require('../../command/Command');
const Events = require('../Events');

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
    this.notify(Events.RESOURCE_SEGREGATED);
  }

  abort() {
    debug(`Aborting resource creation for ${this.name} bay [${this._bay.shortId}]`);
    this._bay.segregate();
    this.#createResource.abort();
  }

  #onCreateSuccess({ resource }) {
    debug(`Successfully provisioned ${this.name} bay [${this._bay.shortId}]`);
    this._bay.created(resource);
    this._stateMachine.toUnvalidated();
    this.notify(Events.RESOURCE_CREATED);
  }

  #onCreateError({ error }) {
    debug(`Error provisioning ${this.name} bay [${this._bay.shortId}]`, error);
    this.notify(Events.RESOURCE_CREATION_ERROR, { error });
    this._stateMachine.toDestroyed();
  }

  #onCreateTimeout({ timeout }) {
    debug(`Timed out after ${timeout.toLocaleString()}ms provisioning ${this.name} bay [${this._bay.shortId}]`);
    this.notify(Events.RESOURCE_CREATION_TIMEOUT, { timeout });
    this._bay.segregate();
  }

  #onBelatedCreateSuccess({ resource }) {
    debug(`Belated success provisioning ${this.name} bay [${this._bay.shortId}]`);
    this._bay.created(resource);
    this.notify(Events.RESOURCE_CREATED);
    this._bay.destroy();
  }

  #onBelatedCreateError = ({ error }) => {
    debug(`Belated error provisioning ${this.name} bay [${this._bay.shortId}]`, error);
    this.notify(Events.RESOURCE_CREATION_ERROR, { error });
    this._stateMachine.toDestroyed();
  };
}

module.exports = PendingState;
