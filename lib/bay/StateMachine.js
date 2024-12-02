const BaseState = require('./states/BaseState');
const EmptyState = require('./states/EmptyState');
const PendingState = require('./states/PendingState');
const ReadyState = require('./states/ReadyState');
const IdleState = require('./states/IdleState');
const AcquiredState = require('./states/AcquiredState');
const DoomedState = require('./states/DoomedState');
const DestroyedState = require('./states/DestroyedState');
const SegregatedState = require('./states/SegregatedState');

class StateMachine {

	#partitions;
	#commandFactory;
  #state;

  constructor(partitions, commandFactory) {
    this.#partitions = partitions;
    this.#commandFactory = commandFactory;
  }

  get state() {
  	return this.#state;
  }

  toEmpty(bay) {
		this.#state = new EmptyState(this, this.#partitions.empty).accept(bay);
  }

  toPending() {
    const pending = new PendingState(this, this.#partitions.pending, this.#commandFactory.getCreateCommand());
    this.#state = this.#state.moveTo(pending);
		return this;
  }

  toReady() {
    const ready = new ReadyState(this, this.#partitions.ready);
    this.#state = this.#state.moveTo(ready);
		return this;
  }

  toIdle() {
    const idle = new IdleState(this, this.#partitions.idle);
    this.#state = this.#state.moveTo(idle);
  }

  toAcquired() {
    const acquired = new AcquiredState(this, this.#partitions.acquired);
    this.#state = this.#state.moveTo(acquired);
  }

  toDoomed() {
    const doomed = new DoomedState(this, this.#partitions.doomed, this.#commandFactory.getDestroyCommand());
    this.#state = this.#state.moveTo(doomed);
  }

  toDestroyed() {
    const destroyed = new DestroyedState(this);
    this.#state = this.#state.moveTo(destroyed);
  }

  toSegregated() {
    const segregated = new SegregatedState(this, this.#partitions.segregated);
    this.#state = this.#state.moveTo(segregated);
  }

}

module.exports = StateMachine;
