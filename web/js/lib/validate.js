import { isValidDate } from './period.js';
import { normalizeUrl } from './format.js';

const str = (v, max = 5000) => String(v ?? '').trim().slice(0, max);

function optionalHours(value) {
  const s = String(value ?? '').trim();
  if (!s) return { value: null };
  const n = Number(s.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 24) return { error: 'Durasi harus angka antara 0–24 jam.' };
  return { value: Math.round(n * 10) / 10 };
}

// Isian log pribadi/kelompok → { row, errors }.
export function readLog(values, { withAttendees = false } = {}) {
  const errors = [];
  const row = {
    log_date: str(values.log_date, 10),
    activity: str(values.activity, 200),
    description: str(values.description) || null,
    outcome: str(values.outcome) || null,
  };
  if (!isValidDate(row.log_date)) errors.push('Tanggal kegiatan tidak valid.');
  if (!row.activity) errors.push('Nama kegiatan wajib diisi.');
  const hours = optionalHours(values.duration_hours);
  if (hours.error) errors.push(hours.error);
  row.duration_hours = hours.value ?? null;
  if (withAttendees) row.attendees = str(values.attendees, 500) || null;
  return { row, errors };
}

export function readDocument(values, { categories, hasGroup }) {
  const errors = [];
  const url = normalizeUrl(values.url);
  const row = {
    title: str(values.title, 200),
    category: str(values.category, 100),
    scope: values.scope === 'kelompok' ? 'kelompok' : 'pribadi',
    description: str(values.description, 2000) || null,
    url,
  };
  if (!row.title) errors.push('Judul dokumen wajib diisi.');
  if (!categories.includes(row.category)) errors.push('Kategori dokumen tidak valid.');
  if (url === null) errors.push('Tautan dokumen wajib diisi.');
  if (url === undefined) errors.push('Tautan harus diawali http:// atau https://');
  if (row.scope === 'kelompok' && !hasGroup) errors.push('Anda belum terdaftar dalam kelompok.');
  return { row, errors };
}

export function readMaterial(values) {
  const errors = [];
  const link = normalizeUrl(values.link_url);
  const attachment = normalizeUrl(values.attachment_url);
  const row = {
    topic_id: Number(values.topic_id) || null,
    title: str(values.title, 200),
    content: str(values.content, 50000) || null,
    link_url: link ?? null,
    attachment_url: attachment ?? null,
  };
  if (!row.topic_id) errors.push('Pilih topik.');
  if (!row.title) errors.push('Judul materi wajib diisi.');
  if (link === undefined || attachment === undefined) errors.push('Tautan harus diawali http:// atau https://');
  if (!row.content && !row.link_url && !row.attachment_url) errors.push('Isi materi atau tautan — minimal salah satu.');
  return { row, errors };
}

export function readTopic(values) {
  const errors = [];
  const week = String(values.week_no ?? '').trim();
  const row = { title: str(values.title, 200), description: str(values.description, 3000) || null, week_no: week ? Number(week) : null };
  if (!row.title) errors.push('Judul topik wajib diisi.');
  if (row.week_no !== null && (!Number.isInteger(row.week_no) || row.week_no < 1 || row.week_no > 52)) {
    errors.push('Minggu ke- harus 1–52.');
  }
  return { row, errors };
}

export function readSettings(values) {
  const errors = [];
  const row = {
    program_name: str(values.program_name, 150) || 'Program Kewirausahaan Mahasiswa',
    period_start: str(values.period_start, 10),
    period_weeks: Number(values.period_weeks),
    min_personal_logs_per_week: Number(values.min_personal_logs_per_week),
    min_group_logs_per_week: Number(values.min_group_logs_per_week),
  };
  if (!isValidDate(row.period_start)) errors.push('Tanggal mulai tidak valid.');
  if (!Number.isInteger(row.period_weeks) || row.period_weeks < 1 || row.period_weeks > 52) errors.push('Jumlah minggu harus 1–52.');
  if (![row.min_personal_logs_per_week, row.min_group_logs_per_week].every((n) => Number.isInteger(n) && n >= 1 && n <= 14)) {
    errors.push('Minimal log per minggu harus 1–14.');
  }
  return { row, errors };
}
