const crypto = require('node:crypto');
const fs = require('node:fs');

function loadUser(db) {
  const findUser = db.prepare(
    `SELECT u.id, u.username, u.name, u.role, u.prodi, u.group_id, u.must_change_password, g.name AS group_name
       FROM users u LEFT JOIN groups g ON g.id = u.group_id
      WHERE u.id = ?`
  );
  return (req, res, next) => {
    req.user = req.session.userId ? findUser.get(req.session.userId) ?? null : null;
    res.locals.user = req.user;
    res.locals.currentPath = req.path;
    res.locals.flash = req.session.flash ?? null;
    delete req.session.flash;
    next();
  };
}

// Akun dengan kata sandi sementara wajib menggantinya sebelum memakai aplikasi.
function enforcePasswordChange(req, res, next) {
  const allowed = ['/akun/password', '/logout'];
  if (req.user?.must_change_password && !allowed.includes(req.path) && !req.path.startsWith('/static')) {
    return res.redirect('/akun/password');
  }
  next();
}

function flash(req, type, message) {
  req.session.flash = { type, message };
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.redirect('/login');
    if (req.user.role !== role) {
      return res.status(403).render('error', {
        title: 'Akses ditolak',
        message: 'Halaman ini tidak tersedia untuk peran akun Anda.',
      });
    }
    next();
  };
}

function tokenMatches(req) {
  const expected = req.session.csrfToken;
  const given = req.body?._csrf ?? req.get('x-csrf-token');
  if (!expected || typeof given !== 'string' || given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

function rejectCsrf(req, res) {
  if (req.file) fs.rm(req.file.path, { force: true }, () => {});
  res.status(403).render('error', {
    title: 'Sesi kedaluwarsa',
    message: 'Formulir tidak valid atau sesi sudah berakhir. Muat ulang halaman lalu coba lagi.',
  });
}

// Token CSRF per sesi. Form multipart diverifikasi setelah multer mem-parsing body (lihat verifyCsrf).
function csrf(req, res, next) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  res.locals.csrfToken = req.session.csrfToken;
  if (req.method === 'POST' && !req.is('multipart/form-data') && !tokenMatches(req)) {
    return rejectCsrf(req, res);
  }
  next();
}

function verifyCsrf(req, res, next) {
  if (!tokenMatches(req)) return rejectCsrf(req, res);
  next();
}

module.exports = { loadUser, enforcePasswordChange, flash, requireRole, csrf, verifyCsrf };
