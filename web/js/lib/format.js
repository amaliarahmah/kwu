const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function formatDate(value) {
  if (!value) return '-';
  const [datePart] = String(value).split(/[ T]/);
  const [y, m, d] = datePart.split('-').map(Number);
  if (!y || !m || !d) return String(value);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function formatHours(hours) {
  if (hours === null || hours === undefined || hours === '') return '-';
  return `${Number(hours).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jam`;
}

export const STATUS_LABELS = { menunggu: 'Menunggu', disetujui: 'Disetujui', revisi: 'Perlu revisi' };

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Cegah formula injection saat CSV dibuka di spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  return /[",\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(header, rows) {
  return '﻿' + [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

// Validasi tautan http(s). Mengembalikan URL yang dinormalisasi atau null.
export function normalizeUrl(value) {
  const s = String(value ?? '').trim();
  if (!s) return null;
  try {
    const url = new URL(s);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

// Baris impor "NIM;Nama;Kelompok;Prodi" (atau dipisah tab dari Excel).
export function parseRoster(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.split(/[;\t]/).map((c) => c.trim()))
    .filter((cols) => cols.some(Boolean))
    .map(([nim = '', name = '', group = '', prodi = '']) => ({ nim, name, group, prodi }));
}
