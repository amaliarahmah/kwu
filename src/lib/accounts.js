const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');

const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Kata sandi sementara tanpa karakter yang mudah tertukar (0/O, 1/l/I).
function temporaryPassword(length = 10) {
  return Array.from(crypto.randomBytes(length), (b) => ALPHABET[b % ALPHABET.length]).join('');
}

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

module.exports = { temporaryPassword, hashPassword };
