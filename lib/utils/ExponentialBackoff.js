class ExponentialBackoff {

	#initialValue = 100;
	#factor = 2;
	#maxValue;
	#attempts = 0;

	constructor({ initialValue, factor, maxValue }) {
		this.#initialValue = initialValue
		this.#factor = factor;
		this.#maxValue = maxValue;
	}

	next() {
		return Math.min(this.#maxValue, this.#initialValue * Math.pow(this.#factor, this.#attempts++));
	}
}

module.exports = ExponentialBackoff;
