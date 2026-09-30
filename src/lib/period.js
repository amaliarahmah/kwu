// Perhitungan minggu kegiatan & kelengkapan log.
// Tanggal disimpan sebagai string 'YYYY-MM-DD' dan dihitung dalam UTC agar tidak terpengaruh zona waktu.

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

const pad = (n) => String(n).padStart(2, '0');

function isValidDate(str) {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const ms = toMs(str);
  return !Number.isNaN(ms) && fromMs(ms) === str;
}

function toMs(str) {
  const [y, m, d] = str.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromMs(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function todayStr(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function weekIndex(dateStr, startStr) {
  return Math.floor((toMs(dateStr) - toMs(startStr)) / WEEK_MS);
}

// Daftar minggu periode kegiatan beserta rentang tanggalnya.
function weeksOf(settings) {
  const start = toMs(settings.period_start);
  return Array.from({ length: settings.period_weeks }, (_, i) => ({
    no: i + 1,
    start: fromMs(start + i * WEEK_MS),
    end: fromMs(start + i * WEEK_MS + 6 * DAY_MS),
  }));
}

// Minggu yang sudah selesai sepenuhnya (dasar penilaian kelengkapan) dan minggu yang sedang berjalan.
function periodProgress(settings, today = todayStr()) {
  const idx = weekIndex(today, settings.period_start);
  const completedWeeks = Math.max(0, Math.min(settings.period_weeks, idx));
  const currentWeek = idx >= 0 && idx < settings.period_weeks ? idx + 1 : null;
  return { completedWeeks, currentWeek, finished: idx >= settings.period_weeks };
}

/**
 * Hitung kelengkapan log.
 * @param {string[]} logDates  tanggal-tanggal log
 * @param {object}   settings  pengaturan periode
 * @param {number}   minPerWeek jumlah minimal log per minggu
 */
function completeness(logDates, settings, minPerWeek, today = todayStr()) {
  const { completedWeeks, currentWeek } = periodProgress(settings, today);
  const counts = new Array(settings.period_weeks).fill(0);
  let outsidePeriod = 0;
  for (const date of logDates) {
    const idx = weekIndex(date, settings.period_start);
    if (idx >= 0 && idx < settings.period_weeks) counts[idx] += 1;
    else outsidePeriod += 1;
  }

  const weeks = weeksOf(settings).map((w, i) => {
    let state;
    if (i < completedWeeks) state = counts[i] >= minPerWeek ? 'terpenuhi' : 'kurang';
    else if (currentWeek === i + 1) state = counts[i] >= minPerWeek ? 'terpenuhi' : 'berjalan';
    else state = 'akan-datang';
    return { ...w, count: counts[i], state };
  });

  const weeksMet = weeks.slice(0, completedWeeks).filter((w) => w.state === 'terpenuhi').length;
  const percent = completedWeeks > 0 ? Math.round((weeksMet / completedWeeks) * 100) : null;
  return { weeks, weeksMet, completedWeeks, currentWeek, percent, outsidePeriod, total: logDates.length };
}

function completenessLevel(percent) {
  if (percent === null) return { key: 'na', label: 'Belum dinilai' };
  if (percent >= 80) return { key: 'baik', label: 'Lengkap' };
  if (percent >= 50) return { key: 'sedang', label: 'Kurang' };
  return { key: 'rendah', label: 'Tertinggal' };
}

module.exports = {
  isValidDate,
  todayStr,
  weekIndex,
  weeksOf,
  periodProgress,
  completeness,
  completenessLevel,
};
