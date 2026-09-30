// Pengambilan data yang dipakai beberapa halaman mahasiswa.
import { sb, q, fetchAll } from '../../api.js';

export const ownLogs = (profile) =>
  fetchAll(() => sb.from('personal_logs').select('*').eq('user_id', profile.id).order('log_date', { ascending: false }).order('id', { ascending: false }));

export const groupLogs = (profile) =>
  profile.group_id
    ? fetchAll(() =>
        sb.from('group_logs')
          .select('*, author:profiles!group_logs_author_id_fkey(name)')
          .eq('group_id', profile.group_id)
          .order('log_date', { ascending: false })
          .order('id', { ascending: false })
      )
    : Promise.resolve([]);

export const visibleDocuments = () =>
  fetchAll(() => sb.from('documents').select('*, owner:profiles!documents_owner_id_fkey(name)').order('created_at', { ascending: false }));

export async function materialsWithProgress(profile) {
  const [materials, progress] = await Promise.all([
    q(sb.from('materials').select('id, topic_id, title, link_url, attachment_url').order('id')),
    q(sb.from('material_progress').select('material_id, completed_at').eq('user_id', profile.id)),
  ]);
  const done = new Map(progress.map((p) => [p.material_id, p.completed_at]));
  return materials.map((m) => ({ ...m, completed_at: done.get(m.id) ?? null }));
}

export async function groupInfo(profile) {
  if (!profile.group_id) return null;
  const [group, members] = await Promise.all([
    q(sb.from('groups').select('*, mentor:profiles!groups_mentor_id_fkey(name)').eq('id', profile.group_id).maybeSingle()),
    q(sb.from('profiles').select('id, nim, name').eq('group_id', profile.group_id).eq('role', 'mahasiswa').order('name')),
  ]);
  return group ? { ...group, members } : null;
}
