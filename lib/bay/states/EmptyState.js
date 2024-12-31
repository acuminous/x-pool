const debug = require('debug')('XPool:bay:EmptyState');
const BaseState = require('./BaseState');
const Command = require('../../command/Command');
const XPoolEvents = require('../../XPoolEvents');

class EmptyState extends BaseState {

  #createResource;

  constructor(stateMachine, store, createResource) {
    super(stateMachine, store);
    this.#createResource = createResource;
  }

  get name() {
    return 'empty';
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

  abandon() {
    debug(`Abandoning resource creation for ${this.name} bay [${this._bay.shortId}]`);
    this.#segregate();
    this.#createResource.abort();
    this.notify(XPoolEvents.RESOURCE_CREATION_ABANDONED);
  }

  #segregate() {
    debug(`Segregating ${this.name} bay [${this._bay.shortId}]`);
    this._stateMachine.toTimedout();
    this.notify(XPoolEvents.RESOURCE_SEGREGATED);
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
    this.#segregate();
  }

  #onBelatedCreateSuccess({ resource }) {
    debug(`Belated success provisioning ${this.name} bay [${this._bay.shortId}]`);
    this._bay.created(resource);
    this.notify(XPoolEvents.RESOURCE_CREATED);
    this._stateMachine.state.destroy();
  }

  #onBelatedCreateError = ({ error }) => {
    debug(`Belated error provisioning ${this.name} bay [${this._bay.shortId}]`, error);
    this.notify(XPoolEvents.RESOURCE_CREATION_ERROR, { error });
    this._stateMachine.state.segregate();
  };
}

module.exports = EmptyState;
