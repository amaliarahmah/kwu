const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp',
  '.jpg', '.jpeg', '.png', '.webp', '.txt', '.csv', '.zip', '.mp4',
]);

function createUploader(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const upload = multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
    }),
    limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 20 },
    fileFilter: (req, file, cb) => {
      // Nama file multipart dikirim sebagai latin1; kembalikan ke UTF-8 agar nama asli tetap terbaca.
      file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const ext = path.extname(file.originalname).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) return cb(new Error(`Tipe file ${ext || '(tanpa ekstensi)'} tidak diizinkan.`));
      cb(null, true);
    },
  });

  // Error upload tidak langsung dilempar; route yang memutuskan pesan & redirect-nya.
  return (field) => (req, res, next) =>
    upload.single(field)(req, res, (err) => {
      if (err) {
        req.uploadError = err.code === 'LIMIT_FILE_SIZE' ? 'Ukuran file maksimal 10 MB.' : err.message;
      }
      next();
    });
}

function removeFile(dir, storedName) {
  if (storedName) fs.rm(path.join(dir, path.basename(storedName)), { force: true }, () => {});
}

module.exports = { createUploader, removeFile, ALLOWED_EXTENSIONS, MAX_FILE_SIZE };
