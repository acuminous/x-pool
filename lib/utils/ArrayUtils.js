module.exports = {
  move: (item, source, destination) => {
    const index = source.findIndex(i => i === item);
    if (index === -1) return false
    source.splice(index, 1);
    destination.push(item);
    return true;
  },
	remove: (item, source) => {
    const index = source.findIndex(i => i === item);
    if (index === -1) return false
    source.splice(index, 1);
    return true;
	}
}
