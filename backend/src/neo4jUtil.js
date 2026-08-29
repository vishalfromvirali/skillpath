// neo4j-driver returns 64-bit integers as a special Integer object, not a
// plain JS number. This safely unwraps them (and passes plain numbers through)
// so JSON.stringify doesn't emit {low, high} objects to the frontend.
function toNumber(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'number') return value;
  if (typeof value.toNumber === 'function') return value.toNumber();
  return value;
}

module.exports = { toNumber };
