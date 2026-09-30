const { test } = require('node:test');
const assert = require('node:assert/strict');
const { completeness, isValidDate, completenessLevel } = require('../src/lib/period');

const settings = { period_start: '2026-09-07', period_weeks: 4 };

test('isValidDate menolak tanggal yang tidak ada', () => {
  assert.ok(isValidDate('2024-02-29'));
  assert.ok(!isValidDate('2026-02-29'));
  assert.ok(!isValidDate('2026-9-1'));
});

test('kelengkapan hanya menilai minggu yang sudah selesai', () => {
  // Hari ini = minggu ke-3 (hari ke-15). Minggu 1 & 2 sudah selesai.
  const logs = ['2026-09-07', '2026-09-22', '2026-09-01'];
  const result = completeness(logs, settings, 1, '2026-09-22');
  assert.equal(result.completedWeeks, 2);
  assert.equal(result.weeksMet, 1);
  assert.equal(result.percent, 50);
  assert.equal(result.currentWeek, 3);
  assert.equal(result.outsidePeriod, 1);
  assert.deepEqual(result.weeks.map((w) => w.state), ['terpenuhi', 'kurang', 'terpenuhi', 'akan-datang']);
});

test('sebelum periode dimulai kelengkapan belum dinilai', () => {
  const result = completeness([], settings, 1, '2026-09-01');
  assert.equal(result.percent, null);
  assert.equal(completenessLevel(result.percent).key, 'na');
});

test('setelah periode berakhir semua minggu dinilai', () => {
  const result = completeness(['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'], settings, 1, '2026-12-01');
  assert.equal(result.completedWeeks, 4);
  assert.equal(result.percent, 100);
  assert.equal(result.currentWeek, null);
});
