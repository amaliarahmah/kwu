const { isValidDate } = require('./lib/period');

const str = (v, max = 5000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function optionalNumber(v, { min = 0, max = 24 } = {}) {
  if (v === undefined || v === null || String(v).trim() === '') return { value: null };
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n < min || n > max) return { error: `Nilai harus angka antara ${min}–${max}.` };
  return { value: Math.round(n * 10) / 10 };
}

// Validasi isian log (pribadi maupun kelompok). Mengembalikan { values, errors }.
function validateLog(body, { withAttendees = false } = {}) {
  const errors = [];
  const values = {
    log_date: str(body.log_date, 10),
    activity: str(body.activity, 200),
    description: str(body.description),
    outcome: str(body.outcome),
  };
  if (!isValidDate(values.log_date)) errors.push('Tanggal kegiatan tidak valid.');
  if (!values.activity) errors.push('Nama kegiatan wajib diisi.');
  const duration = optionalNumber(body.duration_hours);
  if (duration.error) errors.push(`Durasi: ${duration.error}`);
  values.duration_hours = duration.value ?? null;
  if (withAttendees) values.attendees = str(body.attendees, 500);
  return { values, errors };
}

function validUrl(v) {
  const s = str(v, 1000);
  if (!s) return { value: null };
  try {
    const url = new URL(s);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    return { value: url.toString() };
  } catch {
    return { error: 'Tautan harus berupa URL http(s) yang valid.' };
  }
}

module.exports = { str, optionalNumber, validateLog, validUrl };
