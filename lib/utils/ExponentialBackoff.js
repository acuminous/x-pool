const { inspect } = require('node:util');

class ExponentialBackoff {

  #initialValue;
  #factor;
  #maxValue;
  #attempts = 0;

  constructor({ initialValue, factor, maxValue }) {
    this.#initialValue = initialValue;
    this.#factor = factor;
    this.#maxValue = maxValue;
  }

  next() {
    return Math.min(this.#maxValue, this.#initialValue * this.#factor ** this.#attempts++);
  }

  [inspect.custom]() {
    return `${this.constructor.name} { initialValue: ${this.#initialValue}, factor: ${this.#factor}, maxValue: ${this.#maxValue} }`;
  }
}

module.exports = ExponentialBackoff;
