const { EventEmitter } = require('node:events');

class SafeEventEmitter extends EventEmitter {
	emit(...args) {
		try {
			super.emit(...args);
		} catch (cause) {
			setImmediate(() => {
				const error = new Error('Custom event handlers must not throw errors', { cause });
				super.emit('error', { error });
			})
		}
	}
}

module.exports = SafeEventEmitter;
