const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

// Unduhan file dengan pemeriksaan hak akses. File selalu dikirim sebagai attachment
// agar file HTML/SVG yang diunggah tidak dijalankan di domain aplikasi.
module.exports = ({ db, uploadDir }) => {
  const router = express.Router();

  function send(res, file) {
    const fullPath = path.join(uploadDir, path.basename(file.stored_name));
    if (!fs.existsSync(fullPath)) {
      return res.status(404).render('error', { title: 'File tidak ditemukan', message: 'File sudah tidak tersedia di server.' });
    }
    res.download(fullPath, file.original_name);
  }

  function canAccessDocument(user, doc) {
    if (user.role === 'dosen') return true;
    if (doc.owner_id === user.id) return true;
    return doc.scope === 'kelompok' && doc.group_id !== null && doc.group_id === user.group_id;
  }

  router.get('/unduh/dokumen/:id', (req, res) => {
    if (!req.user) return res.redirect('/login');
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(Number(req.params.id));
    if (!doc || !canAccessDocument(req.user, doc)) {
      return res.status(404).render('error', { title: 'Tidak ditemukan', message: 'Dokumen tidak ditemukan.' });
    }
    send(res, doc);
  });

  router.get('/unduh/materi/:id', (req, res) => {
    if (!req.user) return res.redirect('/login');
    const material = db.prepare('SELECT * FROM materials WHERE id = ? AND stored_name IS NOT NULL').get(Number(req.params.id));
    if (!material) return res.status(404).render('error', { title: 'Tidak ditemukan', message: 'Lampiran materi tidak ditemukan.' });
    send(res, material);
  });

  return router;
};
