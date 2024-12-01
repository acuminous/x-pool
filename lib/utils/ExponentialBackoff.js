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
}

module.exports = ExponentialBackoff;
