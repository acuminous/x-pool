const { inspect } = require('node:util');

class Partition {

  #name;
  #list = new Array();

  constructor(name) {
    this.#name = name;
  }

  get name() {
    return this.#name;
  }

  get size() {
    return this.#list.length;
  }

  peek() {
    return this.#list[0];
  }

  add(item) {
    this.#list.push(item);
  }

  remove(item) {
    const index = this.#getIndex(item);
    this.#removeAt(index);
  }

  transfer(item, destination) {
    if (destination === this) return;
    this.remove(item);
    destination.add(item);
  }

  map(cb) {
    return [...this.#list].map(cb);
  }

  forEach(cb) {
    [...this.#list].forEach(cb);
  }

  find(cb) {
    return [...this.#list].find(cb);
  }

  #getIndex(item) {
    const index = this.#list.findIndex((i) => i === item);
    if (index === -1) throw new Error(`Item not found in ${this.name} partition`);
    return index;
  }

  #removeAt(index) {
    this.#list.splice(index, 1);
  }

  [inspect.custom]() {
    return `${this.constructor.name} { name: ${this.name}, size: ${this.size} }`;
  }
}

module.exports = Partition;
