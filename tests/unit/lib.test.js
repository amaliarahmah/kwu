import { test } from 'node:test';
import assert from 'node:assert/strict';
import { html, raw } from '../../web/js/lib/html.js';
import { toCsv, normalizeUrl, parseRoster, formatDate } from '../../web/js/lib/format.js';
import { readLog, readDocument, readMaterial, readSettings } from '../../web/js/lib/validate.js';

test('html`` meng-escape isian dan tetap menyisipkan html`` lain apa adanya', () => {
  const evil = '<img src=x onerror="alert(1)">';
  const out = html`<p title="${evil}">${evil}${html`<b>ok</b>`}${[1, '<i>']}${null}${raw('<br>')}</p>`.toString();
  assert.equal(out, '<p title="&lt;img src=x onerror=&quot;alert(1)&quot;&gt;">&lt;img src=x onerror=&quot;alert(1)&quot;&gt;<b>ok</b>1&lt;i&gt;<br></p>');
});

test('toCsv mencegah formula injection dan meng-escape tanda kutip', () => {
  const csv = toCsv(['a', 'b'], [['=SUM(A1)', 'kata "kutip", koma']]);
  assert.equal(csv, '﻿a,b\r\n\'=SUM(A1),"kata ""kutip"", koma"\r\n');
});

test('normalizeUrl hanya menerima http(s)', () => {
  assert.equal(normalizeUrl(''), null);
  assert.equal(normalizeUrl('javascript:alert(1)'), undefined);
  assert.equal(normalizeUrl('bukan url'), undefined);
  assert.equal(normalizeUrl(' https://drive.google.com/x '), 'https://drive.google.com/x');
});

test('parseRoster membaca titik koma dan tab dari Excel', () => {
  assert.deepEqual(parseRoster('2301001;Ani;K-01;Manajemen\n\n2301002\tBudi\tK-02'), [
    { nim: '2301001', name: 'Ani', group: 'K-01', prodi: 'Manajemen' },
    { nim: '2301002', name: 'Budi', group: 'K-02', prodi: '' },
  ]);
});

test('formatDate memakai nama bulan Indonesia', () => {
  assert.equal(formatDate('2026-08-17'), '17 Agu 2026');
  assert.equal(formatDate('2026-10-01T03:00:00Z'), '1 Okt 2026');
});

test('validasi isian', () => {
  assert.deepEqual(readLog({ log_date: '2026-02-30', activity: ' ', duration_hours: '30' }).errors.length, 3);
  assert.equal(readLog({ log_date: '2026-02-01', activity: 'x', duration_hours: '2,5' }).row.duration_hours, 2.5);
  const doc = readDocument({ title: 'a', category: 'Lainnya', scope: 'kelompok', url: 'ftp://x' }, { categories: ['Lainnya'], hasGroup: false });
  assert.equal(doc.errors.length, 2);
  assert.equal(readMaterial({ topic_id: '1', title: 'x' }).errors.length, 1);
  assert.equal(readSettings({ period_start: '2026-09-01', period_weeks: '14', min_personal_logs_per_week: '0', min_group_logs_per_week: '1' }).errors.length, 1);
});
