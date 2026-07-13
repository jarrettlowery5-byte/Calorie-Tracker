// Date strings are YYYY-MM-DD (client-local). Arithmetic treats them as UTC
// dates so the server's timezone never shifts a day boundary.

function toDate(s) {
  return new Date(s + 'T00:00:00Z');
}

function toStr(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(s, n) {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toStr(d);
}

function diffDays(a, b) {
  return Math.round((toDate(b) - toDate(a)) / 86400000);
}

function isValidDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(toDate(s));
}

module.exports = { toDate, toStr, addDays, diffDays, isValidDate };
