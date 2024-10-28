const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
const debug = require('debug')('XPool:Dorm');
const forward = require('fwd');
const Berth = require('./Berth');
const AsyncLatch = require('../lib/utils/AsyncLatch');

class Dormitory extends EventEmitter {

	#maxSize;
	#berths = [];
	#commands;
	#stopLatch;

	constructor(maxSize, commands) {
    super();
    this.#maxSize = maxSize;
		this.#commands = commands;
	}

	extend(id = randomUUID()) {
		debug(`Creating berth [${id}]`);
		const berth = new Berth(id, this.#commands);
		this.#berths.push(berth);
		forward(berth, this);
		return berth;
	}

	isFull() {
		const { idle, size } = this.stats();
		return idle === 0 && size === this.#maxSize;
	}

	ensure(id = randomUUID()) {
		debug(`Ensuring berth [${id}]`);
		return this.#getIdle() || this.extend(id);
	}

	locate(resource) {
		return this.#berths.find((b) => b.contains(resource));
	}

	async release(berth) {
		debug(`Releasing berth [${berth.id}]`);
		berth.release();
		this.#cull();
	}

	async destroy(berth) {
		debug(`Destroying berth [${berth.id}]`);

		const onEventualSuccess = () => {
			this.#evict(berth);
		}

		try {
			await berth.destroy(onEventualSuccess);
		} catch (error) {
			debug(`[${berth.id}]`, error);
			berth.segregate();
		} finally {
			this.#cull();
		}
	}

	async stop(stopped) {
		this.#stopLatch = stopped;
		await this.#cull();
		await this.#stopLatch.block();
	}

	// TODO Find a way to cache the stats so we don't have to loop through the berths
	stats() {
		return this.#berths.reduce((stats, berth) => {
			if (berth.isInitialising()) return { ...stats, initialising: stats.initialising + 1, size: stats.size + 1 };
			if (berth.isIdle()) return { ...stats, idle: stats.idle + 1, size: stats.size + 1 };
			if (berth.isBusy()) return { ...stats, busy: stats.busy + 1, size: stats.size + 1 };
			if (berth.isDestroying()) return { ...stats, destroying: stats.destroying + 1, size: stats.size + 1 };
			if (berth.isSegregated()) return { ...stats, segregated: stats.segregated + 1, size: stats.size + 1 };
			return stats;
		}, { size: 0, initialising: 0, idle: 0, busy: 0, destroying: 0, segregated: 0 });
	}

	#getIdle() {
		return this.#berths.find((b) => b.isIdle());
	}

	async #cull() {
		if (!this.#stopLatch) return;
		const operations = this.#berths.reduce((operations, b) => {
			if (b.isIdle()) return operations.concat(Promise.resolve().then(async () => await this.destroy(b)));
			if (b.isSegregated()) return operations.concat(Promise.resolve().then(() => this.#evict(b)));
			return operations;
		}, []);
		if (operations.length > 0) {
			debug(`Culling ${operations.length} of ${this.#berths.length} berths`);
			await Promise.all(operations);
		}
		if (this.#berths.length === 0) this.#stopLatch.release();
	}

  #evict(berth) {
		debug(`Evicting berth [${berth.id}]`);
    const index = this.#berths.findIndex(b => b === berth);
    if (index !== -1) this.#berths.splice(index, 1);
    this.emit('resource_evicted');
  }
}

module.exports = Dormitory;
