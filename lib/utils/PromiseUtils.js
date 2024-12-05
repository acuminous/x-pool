module.exports = {
  times: function(repetitions, fn, limit = repetitions) {
    return getBatchSizes(repetitions, limit).reduce((p, batchSize, batchIndex) => {
      return p.then(() => {
        const batch = Array.from({ length: batchSize }, (_, index) => {
          return fn(batchIndex * limit + index)
        });
        return Promise.all(batch);
      });
    }, Promise.resolve());
  },
};

function getBatchSizes(totalSize, batchSize) {
  const fullBatches = Math.floor(totalSize / batchSize);
  const remainder = totalSize % batchSize;
  const batchSizes = Array(fullBatches).fill(batchSize);
  if (remainder > 0) batchSizes.push(remainder);
  return batchSizes;
}
