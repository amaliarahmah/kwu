const path = require('node:path');
const express = require('express');
const session = require('express-session');

const { openDb } = require('./db');
const SqliteSessionStore = require('./session-store');
const { loadUser, enforcePasswordChange, csrf } = require('./middleware');
const { createUploader } = require('./upload');
const { formatDate, formatSize, formatHours } = require('./lib/format');
const { completenessLevel } = require('./lib/period');

function createApp(options = {}) {
  const dataDir = options.dataDir ?? process.env.DATA_DIR ?? path.join(__dirname, '..', 'data');
  const db = options.db ?? openDb(path.join(dataDir, 'kwu.sqlite'));
  const uploadDir = path.join(dataDir, 'uploads');
  const sessionSecret = options.sessionSecret ?? process.env.SESSION_SECRET;
  if (!sessionSecret) throw new Error('SESSION_SECRET wajib diisi (environment variable).');

  const ctx = { db, uploadDir, upload: createUploader(uploadDir) };

  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.set('trust proxy', options.trustProxy ?? process.env.TRUST_PROXY === '1');
  app.disable('x-powered-by');

  app.locals.formatDate = formatDate;
  app.locals.formatSize = formatSize;
  app.locals.formatHours = formatHours;
  app.locals.completenessLevel = completenessLevel;
  app.locals.statusLabels = { menunggu: 'Menunggu', disetujui: 'Disetujui', revisi: 'Perlu revisi' };

  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'same-origin');
    next();
  });
  app.use('/static', express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));
  app.use(express.urlencoded({ extended: false, limit: '200kb' }));
  app.use(
    session({
      name: 'kwu.sid',
      secret: sessionSecret,
      store: new SqliteSessionStore(db),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: options.secureCookie ?? process.env.COOKIE_SECURE === '1',
        maxAge: 8 * 60 * 60 * 1000,
      },
    })
  );
  app.use(loadUser(db));
  app.use(csrf);
  app.use(enforcePasswordChange);

  app.use(require('./routes/auth')(ctx));
  app.use(require('./routes/files')(ctx));
  app.use('/mahasiswa', require('./routes/mahasiswa')(ctx));
  app.use('/dosen', require('./routes/dosen')(ctx));

  app.use((req, res) => {
    res.status(404).render('error', { title: 'Tidak ditemukan', message: 'Halaman yang Anda cari tidak ada.' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).render('error', { title: 'Terjadi kesalahan', message: 'Terjadi kesalahan pada server.' });
  });

  app.locals.db = db;
  return app;
}

module.exports = { createApp };
