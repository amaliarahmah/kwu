const session = require('express-session');

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

// Penyimpanan sesi di SQLite agar login tidak hilang saat server di-restart.
class SqliteSessionStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
    this.pruneTimer = setInterval(() => this.prune(), 15 * 60 * 1000);
    this.pruneTimer.unref();
  }

  expiresOf(sess) {
    const expires = sess?.cookie?.expires;
    return expires ? new Date(expires).getTime() : Date.now() + DEFAULT_TTL_MS;
  }

  get(sid, cb) {
    try {
      const row = this.db.prepare('SELECT sess, expires FROM sessions WHERE sid = ?').get(sid);
      if (!row || row.expires < Date.now()) return cb(null, null);
      cb(null, JSON.parse(row.sess));
    } catch (err) {
      cb(err);
    }
  }

  set(sid, sess, cb) {
    try {
      this.db
        .prepare(
          `INSERT INTO sessions (sid, sess, expires) VALUES (?, ?, ?)
           ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires`
        )
        .run(sid, JSON.stringify(sess), this.expiresOf(sess));
      cb?.(null);
    } catch (err) {
      cb?.(err);
    }
  }

  touch(sid, sess, cb) {
    try {
      this.db.prepare('UPDATE sessions SET expires = ? WHERE sid = ?').run(this.expiresOf(sess), sid);
      cb?.(null);
    } catch (err) {
      cb?.(err);
    }
  }

  destroy(sid, cb) {
    try {
      this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      cb?.(null);
    } catch (err) {
      cb?.(err);
    }
  }

  prune() {
    this.db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
  }
}

module.exports = SqliteSessionStore;
