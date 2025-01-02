const { randomUUID } = require('node:crypto');

function shortId() {
  return `${randomUUID().substring(0, 4)}`;
}

module.exports = {
  shortId,
};
