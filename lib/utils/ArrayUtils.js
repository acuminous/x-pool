module.exports = {
	remove: (item, array) => {
    const index = array.findIndex(i => i === item);
    if (index === -1) return false
    array.splice(index, 1);
    return true;
	}
}
