const { EventEmitter } = require('node:events');

class SafeEventEmitter extends EventEmitter {
	emit(event, ...args) {
		try {
			super.emit(event, ...args);
		} catch (cause) {
			setImmediate(() => {
				super.emit('error', new Error(`Custom event handlers must not throw errors; however, an error was thrown by a handler listening to '${event}' events`, { cause }));
			})
		}
	}
}

module.exports = SafeEventEmitter;
