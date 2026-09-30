const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function formatDate(value) {
  if (!value) return '-';
  const [datePart] = String(value).split(/[ T]/);
  const [y, m, d] = datePart.split('-').map(Number);
  if (!y || !m || !d) return String(value);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatHours(hours) {
  if (hours === null || hours === undefined || hours === '') return '-';
  return `${Number(hours).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jam`;
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Cegah CSV/formula injection ketika dibuka di spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  return /[",\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function toCsv(header, rows) {
  const lines = [header, ...rows].map((row) => row.map(csvEscape).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

module.exports = { formatDate, formatSize, formatHours, toCsv };
