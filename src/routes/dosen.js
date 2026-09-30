const express = require('express');
const { requireRole, flash, verifyCsrf } = require('../middleware');
const { getSettings, saveSettings, transaction } = require('../db');
const { str, validUrl } = require('../validate');
const { completeness, completenessLevel, periodProgress, isValidDate } = require('../lib/period');
const { toCsv } = require('../lib/format');
const { temporaryPassword, hashPassword } = require('../lib/accounts');
const { removeFile } = require('../upload');
const { LOG_STATUSES } = require('../constants');

const notFound = (res, message = 'Data tidak ditemukan.') =>
  res.status(404).render('error', { title: 'Tidak ditemukan', message });

// Hanya izinkan redirect ke halaman internal dosen.
const backTo = (req, fallback) => {
  const target = typeof req.body.back === 'string' ? req.body.back : '';
  return target.startsWith('/dosen') && !target.startsWith('//') ? target : fallback;
};

module.exports = ({ db, upload, uploadDir }) => {
  const router = express.Router();
  router.use(requireRole('dosen'));

  const q = {
    groups: db.prepare(
      `SELECT g.*, d.name AS mentor_name,
              (SELECT COUNT(*) FROM users u WHERE u.group_id = g.id AND u.role = 'mahasiswa') AS member_count
         FROM groups g LEFT JOIN users d ON d.id = g.mentor_id ORDER BY g.name`
    ),
    group: db.prepare('SELECT g.*, d.name AS mentor_name FROM groups g LEFT JOIN users d ON d.id = g.mentor_id WHERE g.id = ?'),
    students: db.prepare(
      `SELECT u.id, u.username, u.name, u.prodi, u.group_id, g.name AS group_name, g.mentor_id
         FROM users u LEFT JOIN groups g ON g.id = u.group_id
        WHERE u.role = 'mahasiswa' ORDER BY g.name IS NULL, g.name, u.name`
    ),
    student: db.prepare(
      `SELECT u.*, g.name AS group_name FROM users u LEFT JOIN groups g ON g.id = u.group_id
        WHERE u.id = ? AND u.role = 'mahasiswa'`
    ),
    lecturers: db.prepare("SELECT id, username, name FROM users WHERE role = 'dosen' ORDER BY name"),
    personalLogs: db.prepare('SELECT * FROM personal_logs WHERE user_id = ? ORDER BY log_date DESC, id DESC'),
    groupLogs: db.prepare(
      `SELECT gl.*, u.name AS author_name FROM group_logs gl LEFT JOIN users u ON u.id = gl.author_id
        WHERE gl.group_id = ? ORDER BY gl.log_date DESC, gl.id DESC`
    ),
    topics: db.prepare('SELECT * FROM topics ORDER BY COALESCE(week_no, 999), id'),
  };

  // ---------- Dashboard kelengkapan ----------
  function buildDashboard(req) {
    const settings = getSettings(db);
    const scope = req.query.lingkup === 'bimbingan' ? 'bimbingan' : 'semua';
    const groupFilter = Number(req.query.kelompok) || null;
    const inScope = (mentorId, groupId) =>
      (scope === 'semua' || mentorId === req.user.id) && (!groupFilter || groupId === groupFilter);

    const byKey = (rows, key) => {
      const map = new Map();
      for (const row of rows) {
        if (!map.has(row[key])) map.set(row[key], []);
        map.get(row[key]).push(row);
      }
      return map;
    };
    const personalByUser = byKey(db.prepare('SELECT user_id, log_date, status FROM personal_logs').all(), 'user_id');
    const groupByGroup = byKey(db.prepare('SELECT group_id, log_date, status FROM group_logs').all(), 'group_id');
    const docsByOwner = byKey(db.prepare('SELECT owner_id FROM documents').all(), 'owner_id');
    const docsByGroup = byKey(db.prepare("SELECT group_id FROM documents WHERE scope = 'kelompok'").all(), 'group_id');
    const materialDone = byKey(db.prepare('SELECT user_id FROM material_progress').all(), 'user_id');
    const materialTotal = db.prepare('SELECT COUNT(*) AS n FROM materials').get().n;

    const summarize = (logs, minPerWeek) => {
      const stats = completeness(logs.map((l) => l.log_date), settings, minPerWeek);
      return {
        ...stats,
        level: completenessLevel(stats.percent),
        pending: logs.filter((l) => l.status === 'menunggu').length,
        lastDate: logs.reduce((max, l) => (l.log_date > max ? l.log_date : max), ''),
      };
    };

    const students = q.students
      .all()
      .filter((s) => inScope(s.mentor_id, s.group_id))
      .map((s) => ({
        ...s,
        stats: summarize(personalByUser.get(s.id) ?? [], settings.min_personal_logs_per_week),
        documents: docsByOwner.get(s.id)?.length ?? 0,
        materialsDone: materialDone.get(s.id)?.length ?? 0,
      }));

    const groups = q.groups
      .all()
      .filter((g) => inScope(g.mentor_id, g.id))
      .map((g) => ({
        ...g,
        stats: summarize(groupByGroup.get(g.id) ?? [], settings.min_group_logs_per_week),
        documents: docsByGroup.get(g.id)?.length ?? 0,
      }));

    const levelCount = (list) =>
      list.reduce((acc, item) => ({ ...acc, [item.stats.level.key]: (acc[item.stats.level.key] ?? 0) + 1 }), {});

    return {
      settings,
      progress: periodProgress(settings),
      scope,
      groupFilter,
      allGroups: q.groups.all(),
      students,
      groups,
      materialTotal,
      studentLevels: levelCount(students),
      groupLevels: levelCount(groups),
      pendingTotal:
        students.reduce((a, s) => a + s.stats.pending, 0) + groups.reduce((a, g) => a + g.stats.pending, 0),
    };
  }

  router.get('/', (req, res) => {
    res.render('dosen/dashboard', { title: 'Dashboard Kelengkapan', ...buildDashboard(req) });
  });

  router.get('/dashboard.csv', (req, res) => {
    const data = buildDashboard(req);
    const pct = (p) => (p === null ? '' : p);
    const rows = [
      ...data.students.map((s) => [
        'Individu', s.username, s.name, s.group_name ?? '', s.stats.total, s.stats.weeksMet, s.stats.completedWeeks,
        pct(s.stats.percent), s.stats.level.label, s.stats.pending, s.documents, s.stats.lastDate,
      ]),
      ...data.groups.map((g) => [
        'Kelompok', '', g.name, g.business_name ?? '', g.stats.total, g.stats.weeksMet, g.stats.completedWeeks,
        pct(g.stats.percent), g.stats.level.label, g.stats.pending, g.documents, g.stats.lastDate,
      ]),
    ];
    res.attachment('kelengkapan-log.csv');
    res.type('text/csv; charset=utf-8');
    res.send(
      toCsv(
        ['Jenis', 'NIM', 'Nama', 'Kelompok/Usaha', 'Jumlah log', 'Minggu terpenuhi', 'Minggu dinilai',
          'Kelengkapan (%)', 'Status', 'Menunggu review', 'Dokumen', 'Log terakhir'],
        rows
      )
    );
  });

  // ---------- Antrian pemeriksaan ----------
  router.get('/antrian', (req, res) => {
    const personal = db
      .prepare(
        `SELECT pl.*, u.name AS student_name, u.username, g.name AS group_name
           FROM personal_logs pl JOIN users u ON u.id = pl.user_id LEFT JOIN groups g ON g.id = u.group_id
          WHERE pl.status = 'menunggu' ORDER BY pl.log_date, pl.id LIMIT 200`
      )
      .all();
    const group = db
      .prepare(
        `SELECT gl.*, g.name AS group_name, u.name AS author_name
           FROM group_logs gl JOIN groups g ON g.id = gl.group_id LEFT JOIN users u ON u.id = gl.author_id
          WHERE gl.status = 'menunggu' ORDER BY gl.log_date, gl.id LIMIT 200`
      )
      .all();
    res.render('dosen/antrian', { title: 'Antrian Pemeriksaan Log', personal, group });
  });

  // ---------- Detail mahasiswa & kelompok ----------
  router.get('/mahasiswa/:id', (req, res) => {
    const student = q.student.get(Number(req.params.id));
    if (!student) return notFound(res, 'Mahasiswa tidak ditemukan.');
    const settings = getSettings(db);
    const logs = q.personalLogs.all(student.id);
    const stats = completeness(logs.map((l) => l.log_date), settings, settings.min_personal_logs_per_week);
    const documents = db
      .prepare('SELECT * FROM documents WHERE owner_id = ? ORDER BY created_at DESC, id DESC')
      .all(student.id);
    const materials = db
      .prepare(
        `SELECT m.id, m.title, t.title AS topic_title, mp.completed_at FROM materials m
           JOIN topics t ON t.id = m.topic_id
           LEFT JOIN material_progress mp ON mp.material_id = m.id AND mp.user_id = ?
          ORDER BY COALESCE(t.week_no, 999), t.id, m.id`
      )
      .all(student.id);
    res.render('dosen/mahasiswa-detail', {
      title: student.name,
      student,
      logs,
      stats: { ...stats, level: completenessLevel(stats.percent) },
      documents,
      materials,
    });
  });

  router.get('/kelompok/:id', (req, res) => {
    const group = q.group.get(Number(req.params.id));
    if (!group) return notFound(res, 'Kelompok tidak ditemukan.');
    const settings = getSettings(db);
    const logs = q.groupLogs.all(group.id);
    const stats = completeness(logs.map((l) => l.log_date), settings, settings.min_group_logs_per_week);
    const members = q.students.all().filter((s) => s.group_id === group.id);
    const documents = db
      .prepare(
        `SELECT d.*, u.name AS owner_name FROM documents d JOIN users u ON u.id = d.owner_id
          WHERE d.scope = 'kelompok' AND d.group_id = ? ORDER BY d.created_at DESC, d.id DESC`
      )
      .all(group.id);
    res.render('dosen/kelompok-detail', {
      title: group.name,
      group,
      logs,
      stats: { ...stats, level: completenessLevel(stats.percent) },
      members,
      documents,
    });
  });

  function reviewHandler(table, fallback) {
    return (req, res) => {
      const status = LOG_STATUSES.includes(req.body.status) ? req.body.status : null;
      const feedback = str(req.body.feedback, 2000) || null;
      if (!status) {
        flash(req, 'error', 'Status tidak valid.');
        return res.redirect(backTo(req, fallback));
      }
      if (status === 'revisi' && !feedback) {
        flash(req, 'error', 'Berikan catatan agar mahasiswa tahu apa yang perlu direvisi.');
        return res.redirect(backTo(req, fallback));
      }
      const result = db
        .prepare(`UPDATE ${table} SET status = ?, feedback = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(status, feedback, Number(req.params.id));
      flash(req, result.changes ? 'success' : 'error', result.changes ? 'Pemeriksaan log tersimpan.' : 'Log tidak ditemukan.');
      res.redirect(backTo(req, fallback));
    };
  }

  router.post('/log-pribadi/:id/review', reviewHandler('personal_logs', '/dosen/antrian'));
  router.post('/log-kelompok/:id/review', reviewHandler('group_logs', '/dosen/antrian'));

  // ---------- Topik & materi ----------
  router.get('/materi', (req, res) => {
    const materials = db
      .prepare(
        `SELECT m.*, (SELECT COUNT(*) FROM material_progress mp WHERE mp.material_id = m.id) AS done_count
           FROM materials m ORDER BY m.id`
      )
      .all();
    const studentCount = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'mahasiswa'").get().n;
    const topics = q.topics.all().map((t) => ({ ...t, materials: materials.filter((m) => m.topic_id === t.id) }));
    res.render('dosen/materi', { title: 'Materi Pembelajaran', topics, studentCount });
  });

  function topicValues(body) {
    const title = str(body.title, 200);
    const week = body.week_no === '' || body.week_no === undefined ? null : Number(body.week_no);
    const errors = [];
    if (!title) errors.push('Judul topik wajib diisi.');
    if (week !== null && (!Number.isInteger(week) || week < 1 || week > 52)) errors.push('Minggu ke- harus 1–52.');
    return { values: { title, description: str(body.description, 3000), week_no: week }, errors };
  }

  router.post('/topik', (req, res) => {
    const { values, errors } = topicValues(req.body);
    if (errors.length) flash(req, 'error', errors.join(' '));
    else {
      db.prepare('INSERT INTO topics (title, description, week_no, created_by) VALUES (?, ?, ?, ?)').run(
        values.title, values.description, values.week_no, req.user.id
      );
      flash(req, 'success', 'Topik ditambahkan.');
    }
    res.redirect('/dosen/materi');
  });

  router.post('/topik/:id', (req, res) => {
    const { values, errors } = topicValues(req.body);
    if (errors.length) flash(req, 'error', errors.join(' '));
    else {
      db.prepare('UPDATE topics SET title = ?, description = ?, week_no = ? WHERE id = ?').run(
        values.title, values.description, values.week_no, Number(req.params.id)
      );
      flash(req, 'success', 'Topik diperbarui.');
    }
    res.redirect('/dosen/materi');
  });

  router.post('/topik/:id/hapus', (req, res) => {
    const id = Number(req.params.id);
    const files = db.prepare('SELECT stored_name FROM materials WHERE topic_id = ? AND stored_name IS NOT NULL').all(id);
    db.prepare('DELETE FROM topics WHERE id = ?').run(id);
    files.forEach((f) => removeFile(uploadDir, f.stored_name));
    flash(req, 'success', 'Topik beserta materinya dihapus.');
    res.redirect('/dosen/materi');
  });

  function renderMaterialForm(res, { material, errors = [], status = 200 }) {
    res.status(status).render('dosen/materi-form', {
      title: material.id ? 'Ubah Materi' : 'Tambah Materi',
      material,
      topics: q.topics.all(),
      errors,
    });
  }

  router.get('/materi/baru', (req, res) => {
    if (!q.topics.all().length) {
      flash(req, 'error', 'Buat topik terlebih dahulu sebelum menambahkan materi.');
      return res.redirect('/dosen/materi');
    }
    renderMaterialForm(res, { material: { topic_id: Number(req.query.topik) || null } });
  });

  router.get('/materi/:id/ubah', (req, res) => {
    const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(Number(req.params.id));
    if (!material) return notFound(res, 'Materi tidak ditemukan.');
    renderMaterialForm(res, { material });
  });

  function materialValues(req) {
    const errors = [];
    const link = validUrl(req.body.link_url);
    const values = {
      topic_id: Number(req.body.topic_id),
      title: str(req.body.title, 200),
      content: str(req.body.content, 50000),
      link_url: link.value ?? null,
    };
    if (req.uploadError) errors.push(req.uploadError);
    if (!values.title) errors.push('Judul materi wajib diisi.');
    if (!db.prepare('SELECT 1 FROM topics WHERE id = ?').get(values.topic_id)) errors.push('Pilih topik yang valid.');
    if (link.error) errors.push(link.error);
    return { values, errors };
  }

  router.post('/materi', upload('file'), verifyCsrf, (req, res) => {
    const { values, errors } = materialValues(req);
    if (!errors.length && !values.content && !values.link_url && !req.file) {
      errors.push('Isi materi, tautan, atau lampiran — minimal salah satu.');
    }
    if (errors.length) {
      if (req.file) removeFile(uploadDir, req.file.filename);
      return renderMaterialForm(res, { material: values, errors, status: 400 });
    }
    db.prepare(
      `INSERT INTO materials (topic_id, title, content, link_url, stored_name, original_name, mime, size, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      values.topic_id, values.title, values.content, values.link_url, req.file?.filename ?? null,
      req.file?.originalname ?? null, req.file?.mimetype ?? null, req.file?.size ?? null, req.user.id
    );
    flash(req, 'success', 'Materi ditambahkan.');
    res.redirect('/dosen/materi');
  });

  router.post('/materi/:id', upload('file'), verifyCsrf, (req, res) => {
    const existing = db.prepare('SELECT * FROM materials WHERE id = ?').get(Number(req.params.id));
    if (!existing) {
      if (req.file) removeFile(uploadDir, req.file.filename);
      return notFound(res, 'Materi tidak ditemukan.');
    }
    const { values, errors } = materialValues(req);
    if (errors.length) {
      if (req.file) removeFile(uploadDir, req.file.filename);
      return renderMaterialForm(res, { material: { ...existing, ...values }, errors, status: 400 });
    }
    const removeAttachment = req.body.remove_file === '1';
    let file = {
      stored_name: existing.stored_name, original_name: existing.original_name, mime: existing.mime, size: existing.size,
    };
    if (req.file || removeAttachment) {
      removeFile(uploadDir, existing.stored_name);
      file = req.file
        ? { stored_name: req.file.filename, original_name: req.file.originalname, mime: req.file.mimetype, size: req.file.size }
        : { stored_name: null, original_name: null, mime: null, size: null };
    }
    db.prepare(
      `UPDATE materials SET topic_id = ?, title = ?, content = ?, link_url = ?,
              stored_name = ?, original_name = ?, mime = ?, size = ? WHERE id = ?`
    ).run(
      values.topic_id, values.title, values.content, values.link_url,
      file.stored_name, file.original_name, file.mime, file.size, existing.id
    );
    flash(req, 'success', 'Materi diperbarui.');
    res.redirect('/dosen/materi');
  });

  router.post('/materi/:id/hapus', (req, res) => {
    const material = db.prepare('SELECT stored_name FROM materials WHERE id = ?').get(Number(req.params.id));
    if (material) {
      db.prepare('DELETE FROM materials WHERE id = ?').run(Number(req.params.id));
      removeFile(uploadDir, material.stored_name);
    }
    flash(req, 'success', 'Materi dihapus.');
    res.redirect('/dosen/materi');
  });

  // ---------- Kelola kelompok, mahasiswa, & pengaturan ----------
  function renderManage(req, res, { credentials = null, status = 200 } = {}) {
    res.status(status).render('dosen/kelola', {
      title: 'Kelola Data',
      groups: q.groups.all(),
      students: q.students.all(),
      lecturers: q.lecturers.all(),
      settings: getSettings(db),
      credentials,
    });
  }

  router.get('/kelola', (req, res) => renderManage(req, res));

  const groupIdOrNull = (value) => {
    const id = Number(value);
    return id && db.prepare('SELECT 1 FROM groups WHERE id = ?').get(id) ? id : null;
  };
  const lecturerIdOrNull = (value) => {
    const id = Number(value);
    return id && db.prepare("SELECT 1 FROM users WHERE id = ? AND role = 'dosen'").get(id) ? id : null;
  };

  router.post('/kelompok', (req, res) => {
    const name = str(req.body.name, 100);
    if (!name) flash(req, 'error', 'Nama kelompok wajib diisi.');
    else if (db.prepare('SELECT 1 FROM groups WHERE name = ?').get(name)) flash(req, 'error', 'Nama kelompok sudah dipakai.');
    else {
      db.prepare('INSERT INTO groups (name, business_name, business_desc, mentor_id) VALUES (?, ?, ?, ?)').run(
        name, str(req.body.business_name, 200), str(req.body.business_desc, 2000), lecturerIdOrNull(req.body.mentor_id)
      );
      flash(req, 'success', `Kelompok "${name}" dibuat.`);
    }
    res.redirect('/dosen/kelola#kelompok');
  });

  router.post('/kelompok/:id', (req, res) => {
    const id = Number(req.params.id);
    const name = str(req.body.name, 100);
    if (!name) flash(req, 'error', 'Nama kelompok wajib diisi.');
    else if (db.prepare('SELECT 1 FROM groups WHERE name = ? AND id != ?').get(name, id)) {
      flash(req, 'error', 'Nama kelompok sudah dipakai.');
    } else {
      db.prepare('UPDATE groups SET name = ?, business_name = ?, business_desc = ?, mentor_id = ? WHERE id = ?').run(
        name, str(req.body.business_name, 200), str(req.body.business_desc, 2000), lecturerIdOrNull(req.body.mentor_id), id
      );
      flash(req, 'success', 'Kelompok diperbarui.');
    }
    res.redirect(backTo(req, '/dosen/kelola#kelompok'));
  });

  router.post('/kelompok/:id/hapus', (req, res) => {
    const id = Number(req.params.id);
    const files = db.prepare('SELECT stored_name FROM documents WHERE group_id = ?').all(id);
    db.prepare('DELETE FROM groups WHERE id = ?').run(id);
    files.forEach((f) => removeFile(uploadDir, f.stored_name));
    flash(req, 'success', 'Kelompok dihapus. Anggotanya kini tanpa kelompok.');
    res.redirect('/dosen/kelola#kelompok');
  });

  // Tambah mahasiswa satu per satu atau impor massal (baris: NIM;Nama;Kelompok;Prodi).
  router.post('/mahasiswa', (req, res) => {
    const lines = String(req.body.bulk ?? '').trim()
      ? String(req.body.bulk).split(/\r?\n/).map((l) => l.split(/[;\t]/).map((c) => c.trim()))
      : [[str(req.body.username, 30), str(req.body.name, 100), null, str(req.body.prodi, 100), Number(req.body.group_id)]];

    const findGroupByName = db.prepare('SELECT id FROM groups WHERE name = ?');
    const credentials = [];
    const problems = [];
    transaction(db, () => {
      lines.forEach(([username, name, groupName, prodi, groupId], i) => {
        if (!username && !name) return;
        const label = `Baris ${i + 1}`;
        if (!/^[A-Za-z0-9._-]{3,30}$/.test(username ?? '')) return problems.push(`${label}: NIM tidak valid.`);
        if (!name) return problems.push(`${label}: nama kosong.`);
        if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
          return problems.push(`${label}: NIM ${username} sudah terdaftar.`);
        }
        let group = groupIdOrNull(groupId);
        if (!group && groupName) {
          group = findGroupByName.get(groupName)?.id ?? null;
          if (!group) group = Number(db.prepare('INSERT INTO groups (name) VALUES (?)').run(groupName).lastInsertRowid);
        }
        const password = temporaryPassword();
        db.prepare(
          `INSERT INTO users (username, name, password_hash, role, prodi, group_id, must_change_password)
           VALUES (?, ?, ?, 'mahasiswa', ?, ?, 1)`
        ).run(username, name.slice(0, 100), hashPassword(password), prodi || null, group);
        credentials.push({ username, name, password });
      });
    });

    if (problems.length) flash(req, 'error', problems.slice(0, 10).join(' '));
    else if (!credentials.length) flash(req, 'error', 'Tidak ada data mahasiswa yang diproses.');
    if (!credentials.length) return res.redirect('/dosen/kelola#mahasiswa');
    renderManage(req, res, { credentials });
  });

  router.post('/mahasiswa/:id', (req, res) => {
    const student = q.student.get(Number(req.params.id));
    if (!student) return notFound(res, 'Mahasiswa tidak ditemukan.');
    const name = str(req.body.name, 100) || student.name;
    db.prepare('UPDATE users SET name = ?, prodi = ?, group_id = ? WHERE id = ?').run(
      name, str(req.body.prodi, 100) || null, groupIdOrNull(req.body.group_id), student.id
    );
    flash(req, 'success', `Data ${name} diperbarui.`);
    res.redirect(backTo(req, '/dosen/kelola#mahasiswa'));
  });

  router.post('/mahasiswa/:id/reset-password', (req, res) => {
    const student = q.student.get(Number(req.params.id));
    if (!student) return notFound(res, 'Mahasiswa tidak ditemukan.');
    const password = temporaryPassword();
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(hashPassword(password), student.id);
    db.prepare("DELETE FROM sessions WHERE json_extract(sess, '$.userId') = ?").run(student.id);
    renderManage(req, res, { credentials: [{ username: student.username, name: student.name, password }] });
  });

  router.post('/mahasiswa/:id/hapus', (req, res) => {
    const student = q.student.get(Number(req.params.id));
    if (!student) return notFound(res, 'Mahasiswa tidak ditemukan.');
    const files = db.prepare('SELECT stored_name FROM documents WHERE owner_id = ?').all(student.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(student.id);
    db.prepare("DELETE FROM sessions WHERE json_extract(sess, '$.userId') = ?").run(student.id);
    files.forEach((f) => removeFile(uploadDir, f.stored_name));
    flash(req, 'success', `Akun ${student.name} beserta seluruh log dan dokumennya dihapus.`);
    res.redirect('/dosen/kelola#mahasiswa');
  });

  router.post('/pengaturan', (req, res) => {
    const weeks = Number(req.body.period_weeks);
    const minPersonal = Number(req.body.min_personal_logs_per_week);
    const minGroup = Number(req.body.min_group_logs_per_week);
    const errors = [];
    if (!isValidDate(req.body.period_start)) errors.push('Tanggal mulai tidak valid.');
    if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) errors.push('Jumlah minggu harus 1–52.');
    if (![minPersonal, minGroup].every((n) => Number.isInteger(n) && n >= 1 && n <= 14)) {
      errors.push('Minimal log per minggu harus 1–14.');
    }
    if (errors.length) flash(req, 'error', errors.join(' '));
    else {
      saveSettings(db, {
        program_name: str(req.body.program_name, 150) || 'Program Kewirausahaan Mahasiswa',
        period_start: req.body.period_start,
        period_weeks: weeks,
        min_personal_logs_per_week: minPersonal,
        min_group_logs_per_week: minGroup,
      });
      flash(req, 'success', 'Pengaturan periode disimpan.');
    }
    res.redirect('/dosen/kelola#pengaturan');
  });

  return router;
};
