const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
const debug = require('debug')('XPool:Dorm');
const forwardEvents = require('fwd');
const Bay = require('./Bay');
const ArrayUtils = require('./utils/ArrayUtils');

class Dormitory extends EventEmitter {

	#maxSize;
	#bays = [];
	#commands;
	#stopLatch;

	constructor(maxSize, commands) {
    super();
    this.#maxSize = maxSize;
		this.#commands = commands;
	}

	get size() {
		return this.stats().size;
	}

	extend(id = randomUUID()) {
		debug(`Creating bay [${id}]`);
		const bay = new Bay(id, this.#commands);
		this.#bays.push(bay);
		forwardEvents(bay, this);
		return bay;
	}

	isFull() {
		const { idle, size } = this.stats();
		return idle === 0 && size === this.#maxSize;
	}

	ensure(id = randomUUID()) {
		debug(`Ensuring bay [${id}]`);
		return this.#getIdle() || this.extend(id);
	}

	locate(resource) {
		return this.#bays.find((b) => b.contains(resource));
	}

	async release(bay) {
		debug(`Releasing bay [${bay.id}]`);
		bay.release();
		this.#cull();
	}

	async destroy(bay) {
		debug(`Destroying bay [${bay.id}]`);

		const onEventualSuccess = () => {
			this.#evict(bay);
		}

		try {
			await bay.destroy(onEventualSuccess);
		} catch (error) {
			debug(`[${bay.id}]`, error);
			bay.segregate();
		} finally {
			this.#cull();
		}
	}

	async stop(stopLatch) {
		this.#stopLatch = stopLatch;
		await this.#cull();
		await this.#stopLatch.block();
	}

	// TODO Find a way to cache the stats so we don't have to loop through the bays
	stats() {
		return this.#bays.reduce((stats, bay) => {
			if (bay.isInitialising()) return { ...stats, initialising: stats.initialising + 1, size: stats.size + 1 };
			if (bay.isIdle()) return { ...stats, idle: stats.idle + 1, size: stats.size + 1 };
			if (bay.isBusy()) return { ...stats, busy: stats.busy + 1, size: stats.size + 1 };
			if (bay.isDestroying()) return { ...stats, destroying: stats.destroying + 1, size: stats.size + 1 };
			if (bay.isSegregated()) return { ...stats, segregated: stats.segregated + 1, size: stats.size + 1 };
			return stats;
		}, { size: 0, initialising: 0, idle: 0, busy: 0, destroying: 0, segregated: 0 });
	}

	#getIdle() {
		return this.#bays.find((b) => b.isIdle());
	}

	async #cull() {
		if (!this.#stopLatch?.isActive()) return;

		await this.#cullIdleResources();
		this.#cullSegregatedResources();

		if (this.#bays.length === 0) this.#stopLatch.release();
	}

	async #cullIdleResources() {
		const idleResources = this.#bays.filter((b) => b.isIdle());
		if (idleResources.length > 0) {
			debug(`Culling ${idleResources.length.toLocaleString()} idle resources`);
			await Promise.all(idleResources.map((b) => this.destroy(b)));
		}
	}

	#cullSegregatedResources() {
		const segregatedResources = this.#bays.filter((b) => b.isSegregated());
		if (segregatedResources.length > 0) {
			debug(`Culling ${segregatedResources.length.toLocaleString()} segregated resources`);
			segregatedResources.forEach((b) => this.#evict(b));
		}
	}

  #evict(bay) {
    ArrayUtils.remove(bay, this.#bays);
    bay.evict();
  }
}

module.exports = Dormitory;
