import { sb, q, fetchAll, UserError } from '../../api.js';
import { completeness, completenessLevel } from '../../lib/period.js';

export const topicsQuery = () => sb.from('topics').select('*').order('week_no', { ascending: true, nullsFirst: false }).order('id');

export async function allGroups() {
  return q(sb.from('groups').select('*, mentor:profiles!groups_mentor_id_fkey(id, name)').order('name'));
}

export const lecturers = () => q(sb.from('profiles').select('id, name').eq('role', 'dosen').order('name'));

export const students = () =>
  fetchAll(() => sb.from('profiles').select('*').eq('role', 'mahasiswa').order('name'));

export function summarize(logs, settings, minPerWeek) {
  const stats = completeness(logs.map((l) => l.log_date), settings, minPerWeek);
  return {
    ...stats,
    level: completenessLevel(stats.percent),
    pending: logs.filter((l) => l.status === 'menunggu').length,
    lastDate: logs.reduce((max, l) => (l.log_date > max ? l.log_date : max), ''),
  };
}

export function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row[key])) map.set(row[key], []);
    map.get(row[key]).push(row);
  }
  return map;
}

// Simpan hasil pemeriksaan log (setujui / minta revisi / batalkan).
export async function reviewLog(table, values) {
  const status = ['menunggu', 'disetujui', 'revisi'].includes(values.status) ? values.status : null;
  const feedback = String(values.feedback ?? '').trim().slice(0, 2000) || null;
  if (!status) throw new UserError('Status tidak valid.');
  if (status === 'revisi' && !feedback) throw new UserError('Beri catatan agar mahasiswa tahu apa yang perlu direvisi.');
  const updated = await q(sb.from(table).update({ status, feedback }).eq('id', values.id).select('id'));
  if (!updated.length) throw new UserError('Log tidak ditemukan.');
  return { flash: 'Pemeriksaan log tersimpan.' };
}
