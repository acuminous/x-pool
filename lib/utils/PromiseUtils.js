module.exports = {
  times: (n, fn) => {
    const promises = Array.from({ length: n }, (_, index) => fn(index));
    return Promise.all(promises);
  },
};
