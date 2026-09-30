// Membuat (atau mereset) akun dosen.
// Pemakaian: npm run create-dosen -- <NIDN> "<Nama Lengkap>"
const path = require('node:path');
const { openDb } = require('../src/db');
const { temporaryPassword, hashPassword } = require('../src/lib/accounts');

const [username, name] = process.argv.slice(2);
if (!username || !name) {
  console.error('Pemakaian: npm run create-dosen -- <NIDN> "<Nama Lengkap>"');
  process.exit(1);
}

const dataDir = process.env.DATA_DIR ?? path.join(__dirname, '..', 'data');
const db = openDb(path.join(dataDir, 'kwu.sqlite'));
const password = temporaryPassword(12);
const existing = db.prepare('SELECT id, role FROM users WHERE username = ?').get(username);

if (existing && existing.role !== 'dosen') {
  console.error(`Username ${username} sudah dipakai akun mahasiswa.`);
  process.exit(1);
}
if (existing) {
  db.prepare('UPDATE users SET name = ?, password_hash = ?, must_change_password = 1 WHERE id = ?').run(
    name, hashPassword(password), existing.id
  );
  console.log(`Akun dosen ${username} diperbarui.`);
} else {
  db.prepare(
    "INSERT INTO users (username, name, password_hash, role, must_change_password) VALUES (?, ?, ?, 'dosen', 1)"
  ).run(username, name, hashPassword(password));
  console.log(`Akun dosen ${username} dibuat.`);
}
console.log(`Kata sandi sementara: ${password}  (wajib diganti saat login pertama)`);
