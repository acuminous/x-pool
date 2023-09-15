module.exports = class XPoolError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.code = code;
  }

};
