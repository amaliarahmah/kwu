const express = require('express');
const { requireRole, flash, verifyCsrf } = require('../middleware');
const { getSettings } = require('../db');
const { validateLog, str } = require('../validate');
const { completeness, todayStr } = require('../lib/period');
const { toCsv } = require('../lib/format');
const { removeFile } = require('../upload');
const { DOCUMENT_CATEGORIES } = require('../constants');

module.exports = ({ db, upload, uploadDir }) => {
  const router = express.Router();
  router.use(requireRole('mahasiswa'));

  const q = {
    personalLogs: db.prepare('SELECT * FROM personal_logs WHERE user_id = ? ORDER BY log_date DESC, id DESC'),
    personalLog: db.prepare('SELECT * FROM personal_logs WHERE id = ? AND user_id = ?'),
    groupLogs: db.prepare(
      `SELECT gl.*, u.name AS author_name FROM group_logs gl LEFT JOIN users u ON u.id = gl.author_id
        WHERE gl.group_id = ? ORDER BY gl.log_date DESC, gl.id DESC`
    ),
    groupLog: db.prepare('SELECT * FROM group_logs WHERE id = ? AND group_id = ?'),
    group: db.prepare(
      `SELECT g.*, d.name AS mentor_name FROM groups g LEFT JOIN users d ON d.id = g.mentor_id WHERE g.id = ?`
    ),
    groupMembers: db.prepare("SELECT id, username, name FROM users WHERE group_id = ? AND role = 'mahasiswa' ORDER BY name"),
    documents: db.prepare(
      `SELECT d.*, u.name AS owner_name FROM documents d JOIN users u ON u.id = d.owner_id
        WHERE d.owner_id = ? OR (d.scope = 'kelompok' AND d.group_id = ?)
        ORDER BY d.created_at DESC, d.id DESC`
    ),
    topics: db.prepare('SELECT * FROM topics ORDER BY COALESCE(week_no, 999), id'),
    materialsWithProgress: db.prepare(
      `SELECT m.id, m.topic_id, m.title, m.link_url, m.original_name, mp.completed_at
         FROM materials m LEFT JOIN material_progress mp ON mp.material_id = m.id AND mp.user_id = ?
        ORDER BY m.id`
    ),
  };

  const groupOf = (user) => (user.group_id ? q.group.get(user.group_id) : null);

  // ---------- Beranda ----------
  router.get('/', (req, res) => {
    const settings = getSettings(db);
    const logs = q.personalLogs.all(req.user.id);
    const group = groupOf(req.user);
    const groupLogs = group ? q.groupLogs.all(group.id) : [];
    const materials = q.materialsWithProgress.all(req.user.id);
    const recentFeedback = [
      ...logs.filter((l) => l.feedback).map((l) => ({ ...l, kind: 'Log pribadi', link: '/mahasiswa/log-pribadi' })),
      ...groupLogs.filter((l) => l.feedback).map((l) => ({ ...l, kind: 'Log kelompok', link: '/mahasiswa/log-kelompok' })),
    ]
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 5);

    res.render('mahasiswa/beranda', {
      title: 'Beranda',
      settings,
      group,
      personal: completeness(logs.map((l) => l.log_date), settings, settings.min_personal_logs_per_week),
      groupStats: group
        ? completeness(groupLogs.map((l) => l.log_date), settings, settings.min_group_logs_per_week)
        : null,
      materialsDone: materials.filter((m) => m.completed_at).length,
      materialsTotal: materials.length,
      revisionCount: logs.filter((l) => l.status === 'revisi').length + groupLogs.filter((l) => l.status === 'revisi').length,
      recentFeedback,
    });
  });

  // ---------- Log pribadi ----------
  function renderPersonal(req, res, { form = null, errors = [], status = 200, editId = req.query.edit } = {}) {
    const logs = q.personalLogs.all(req.user.id);
    let editing = null;
    if (editId) {
      editing = q.personalLog.get(Number(editId), req.user.id) ?? null;
      if (editing?.status === 'disetujui') editing = null;
    }
    res.status(status).render('mahasiswa/log-pribadi', {
      title: 'Log Pribadi',
      logs,
      editing,
      form: form ?? editing ?? { log_date: todayStr() },
      errors,
    });
  }

  router.get('/log-pribadi', (req, res) => renderPersonal(req, res));

  router.post('/log-pribadi', (req, res) => {
    const { values, errors } = validateLog(req.body);
    if (errors.length) return renderPersonal(req, res, { form: values, errors, status: 400 });
    db.prepare(
      `INSERT INTO personal_logs (user_id, log_date, activity, description, outcome, duration_hours)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(req.user.id, values.log_date, values.activity, values.description, values.outcome, values.duration_hours);
    flash(req, 'success', 'Log pribadi tersimpan.');
    res.redirect('/mahasiswa/log-pribadi');
  });

  router.post('/log-pribadi/:id', (req, res) => {
    const log = q.personalLog.get(Number(req.params.id), req.user.id);
    if (!log) return res.status(404).render('error', { title: 'Tidak ditemukan', message: 'Log tidak ditemukan.' });
    if (log.status === 'disetujui') {
      flash(req, 'error', 'Log yang sudah disetujui dosen tidak dapat diubah.');
      return res.redirect('/mahasiswa/log-pribadi');
    }
    const { values, errors } = validateLog(req.body);
    if (errors.length) {
      return renderPersonal(req, res, { form: { ...values, id: log.id }, errors, status: 400, editId: log.id });
    }
    db.prepare(
      `UPDATE personal_logs
          SET log_date = ?, activity = ?, description = ?, outcome = ?, duration_hours = ?,
              status = 'menunggu', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`
    ).run(values.log_date, values.activity, values.description, values.outcome, values.duration_hours, log.id);
    flash(req, 'success', 'Log pribadi diperbarui dan menunggu pemeriksaan dosen.');
    res.redirect('/mahasiswa/log-pribadi');
  });

  router.post('/log-pribadi/:id/hapus', (req, res) => {
    const result = db
      .prepare("DELETE FROM personal_logs WHERE id = ? AND user_id = ? AND status != 'disetujui'")
      .run(Number(req.params.id), req.user.id);
    flash(req, result.changes ? 'success' : 'error', result.changes ? 'Log dihapus.' : 'Log tidak dapat dihapus.');
    res.redirect('/mahasiswa/log-pribadi');
  });

  // ---------- Log kelompok ----------
  function renderGroup(req, res, { form = null, errors = [], status = 200, editId = req.query.edit } = {}) {
    const group = groupOf(req.user);
    const logs = group ? q.groupLogs.all(group.id) : [];
    let editing = null;
    if (group && editId) {
      editing = q.groupLog.get(Number(editId), group.id) ?? null;
      if (editing && (editing.status === 'disetujui' || editing.author_id !== req.user.id)) editing = null;
    }
    res.status(status).render('mahasiswa/log-kelompok', {
      title: 'Log Kelompok',
      group,
      members: group ? q.groupMembers.all(group.id) : [],
      logs,
      editing,
      form: form ?? editing ?? { log_date: todayStr() },
      errors,
    });
  }

  function requireGroup(req, res, next) {
    if (!req.user.group_id) {
      flash(req, 'error', 'Anda belum terdaftar dalam kelompok. Hubungi dosen pengampu.');
      return res.redirect('/mahasiswa/log-kelompok');
    }
    next();
  }

  router.get('/log-kelompok', (req, res) => renderGroup(req, res));

  router.post('/log-kelompok', requireGroup, (req, res) => {
    const { values, errors } = validateLog(req.body, { withAttendees: true });
    if (errors.length) return renderGroup(req, res, { form: values, errors, status: 400 });
    db.prepare(
      `INSERT INTO group_logs (group_id, author_id, log_date, activity, description, outcome, attendees, duration_hours)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      req.user.group_id, req.user.id, values.log_date, values.activity,
      values.description, values.outcome, values.attendees, values.duration_hours
    );
    flash(req, 'success', 'Log kelompok tersimpan.');
    res.redirect('/mahasiswa/log-kelompok');
  });

  router.post('/log-kelompok/:id', requireGroup, (req, res) => {
    const log = q.groupLog.get(Number(req.params.id), req.user.group_id);
    if (!log || log.author_id !== req.user.id || log.status === 'disetujui') {
      flash(req, 'error', 'Log hanya dapat diubah oleh penulisnya dan sebelum disetujui dosen.');
      return res.redirect('/mahasiswa/log-kelompok');
    }
    const { values, errors } = validateLog(req.body, { withAttendees: true });
    if (errors.length) {
      return renderGroup(req, res, { form: { ...values, id: log.id }, errors, status: 400, editId: log.id });
    }
    db.prepare(
      `UPDATE group_logs
          SET log_date = ?, activity = ?, description = ?, outcome = ?, attendees = ?, duration_hours = ?,
              status = 'menunggu', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`
    ).run(values.log_date, values.activity, values.description, values.outcome, values.attendees, values.duration_hours, log.id);
    flash(req, 'success', 'Log kelompok diperbarui.');
    res.redirect('/mahasiswa/log-kelompok');
  });

  router.post('/log-kelompok/:id/hapus', requireGroup, (req, res) => {
    const result = db
      .prepare("DELETE FROM group_logs WHERE id = ? AND group_id = ? AND author_id = ? AND status != 'disetujui'")
      .run(Number(req.params.id), req.user.group_id, req.user.id);
    flash(req, result.changes ? 'success' : 'error', result.changes ? 'Log dihapus.' : 'Log tidak dapat dihapus.');
    res.redirect('/mahasiswa/log-kelompok');
  });

  // ---------- Dokumen ----------
  function renderDocuments(req, res, { form = {}, errors = [], status = 200 } = {}) {
    res.status(status).render('mahasiswa/dokumen', {
      title: 'Dokumen',
      documents: q.documents.all(req.user.id, req.user.group_id ?? -1),
      categories: DOCUMENT_CATEGORIES,
      form,
      errors,
    });
  }

  router.get('/dokumen', (req, res) => renderDocuments(req, res));

  router.post('/dokumen', upload('file'), verifyCsrf, (req, res) => {
    const form = {
      title: str(req.body.title, 200),
      category: str(req.body.category, 100),
      scope: req.body.scope === 'kelompok' ? 'kelompok' : 'pribadi',
      description: str(req.body.description, 2000),
    };
    const errors = [];
    if (req.uploadError) errors.push(req.uploadError);
    else if (!req.file) errors.push('Pilih file yang akan diunggah.');
    if (!form.title) errors.push('Judul dokumen wajib diisi.');
    if (!DOCUMENT_CATEGORIES.includes(form.category)) errors.push('Kategori dokumen tidak valid.');
    if (form.scope === 'kelompok' && !req.user.group_id) errors.push('Anda belum terdaftar dalam kelompok.');
    if (errors.length) {
      if (req.file) removeFile(uploadDir, req.file.filename);
      return renderDocuments(req, res, { form, errors, status: 400 });
    }
    db.prepare(
      `INSERT INTO documents (owner_id, group_id, scope, category, title, description, stored_name, original_name, mime, size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      req.user.id, form.scope === 'kelompok' ? req.user.group_id : null, form.scope, form.category, form.title,
      form.description, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size
    );
    flash(req, 'success', 'Dokumen berhasil diunggah.');
    res.redirect('/mahasiswa/dokumen');
  });

  router.post('/dokumen/:id/hapus', (req, res) => {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND owner_id = ?').get(Number(req.params.id), req.user.id);
    if (!doc) {
      flash(req, 'error', 'Dokumen hanya dapat dihapus oleh pengunggahnya.');
      return res.redirect('/mahasiswa/dokumen');
    }
    db.prepare('DELETE FROM documents WHERE id = ?').run(doc.id);
    removeFile(uploadDir, doc.stored_name);
    flash(req, 'success', 'Dokumen dihapus.');
    res.redirect('/mahasiswa/dokumen');
  });

  // ---------- Materi pembelajaran ----------
  router.get('/materi', (req, res) => {
    const materials = q.materialsWithProgress.all(req.user.id);
    const topics = q.topics.all().map((t) => ({ ...t, materials: materials.filter((m) => m.topic_id === t.id) }));
    res.render('mahasiswa/materi', {
      title: 'Topik & Materi',
      topics,
      done: materials.filter((m) => m.completed_at).length,
      total: materials.length,
    });
  });

  router.get('/materi/:id', (req, res) => {
    const material = db
      .prepare(
        `SELECT m.*, t.title AS topic_title, t.week_no, mp.completed_at
           FROM materials m JOIN topics t ON t.id = m.topic_id
           LEFT JOIN material_progress mp ON mp.material_id = m.id AND mp.user_id = ?
          WHERE m.id = ?`
      )
      .get(req.user.id, Number(req.params.id));
    if (!material) return res.status(404).render('error', { title: 'Tidak ditemukan', message: 'Materi tidak ditemukan.' });
    res.render('mahasiswa/materi-detail', { title: material.title, material });
  });

  router.post('/materi/:id/selesai', (req, res) => {
    const id = Number(req.params.id);
    if (!db.prepare('SELECT 1 FROM materials WHERE id = ?').get(id)) return res.redirect('/mahasiswa/materi');
    if (req.body.done === '1') {
      db.prepare('INSERT OR IGNORE INTO material_progress (user_id, material_id) VALUES (?, ?)').run(req.user.id, id);
    } else {
      db.prepare('DELETE FROM material_progress WHERE user_id = ? AND material_id = ?').run(req.user.id, id);
    }
    res.redirect(`/mahasiswa/materi/${id}`);
  });

  // ---------- Rekapitulasi ----------
  function rekapData(user) {
    const settings = getSettings(db);
    const logs = q.personalLogs.all(user.id);
    const group = groupOf(user);
    const groupLogs = group ? q.groupLogs.all(group.id) : [];
    const personal = completeness(logs.map((l) => l.log_date), settings, settings.min_personal_logs_per_week);
    const groupStats = completeness(groupLogs.map((l) => l.log_date), settings, settings.min_group_logs_per_week);
    const sumHours = (list) => list.reduce((acc, l) => acc + (l.duration_hours ?? 0), 0);
    const countStatus = (list, s) => list.filter((l) => l.status === s).length;
    return {
      settings,
      group,
      logs,
      groupLogs,
      personal,
      groupStats: group ? groupStats : null,
      weeks: personal.weeks.map((w, i) => ({ ...w, groupCount: groupStats.weeks[i].count, groupState: groupStats.weeks[i].state })),
      summary: {
        personalHours: sumHours(logs),
        groupHours: sumHours(groupLogs),
        personalApproved: countStatus(logs, 'disetujui'),
        personalRevision: countStatus(logs, 'revisi'),
        groupApproved: countStatus(groupLogs, 'disetujui'),
        documents: q.documents.all(user.id, user.group_id ?? -1).length,
      },
    };
  }

  router.get('/rekap', (req, res) => {
    res.render('mahasiswa/rekap', { title: 'Rekapitulasi', ...rekapData(req.user) });
  });

  router.get('/rekap.csv', (req, res) => {
    const { logs, groupLogs } = rekapData(req.user);
    const rows = [
      ...logs.map((l) => ['Pribadi', l.log_date, l.activity, l.description, l.outcome, l.duration_hours, l.status, l.feedback]),
      ...groupLogs.map((l) => ['Kelompok', l.log_date, l.activity, l.description, l.outcome, l.duration_hours, l.status, l.feedback]),
    ].sort((a, b) => a[1].localeCompare(b[1]));
    res.attachment(`rekap-log-${req.user.username}.csv`);
    res.type('text/csv; charset=utf-8');
    res.send(toCsv(['Jenis', 'Tanggal', 'Kegiatan', 'Uraian', 'Hasil', 'Durasi (jam)', 'Status', 'Catatan dosen'], rows));
  });

  return router;
};
