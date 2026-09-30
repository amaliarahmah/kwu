// Koneksi ke Supabase dan fungsi bantu pengambilan data.
const config = window.KWU_CONFIG ?? {};

export const isConfigured = Boolean(
  config.supabaseUrl && config.supabaseAnonKey && !config.supabaseUrl.includes('ISI_')
);

export const sb = isConfigured
  ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

// Supabase Auth memakai email; akun di aplikasi ini memakai NIM/NIDN yang dipetakan ke email internal.
export const nimToEmail = (nim) => `${String(nim).trim().toLowerCase()}@${config.emailDomain || 'logbook-kwu.local'}`;

export class UserError extends Error {
  constructor(messages) {
    const list = Array.isArray(messages) ? messages : [messages];
    super(list.join(' '));
    this.messages = list;
  }
}

function translate(error) {
  const msg = error?.message ?? String(error);
  if (/Invalid login credentials/i.test(msg)) return 'NIM/NIDN atau kata sandi salah.';
  if (/row-level security|permission denied/i.test(msg)) return 'Anda tidak memiliki izin untuk tindakan ini.';
  if (/Database error saving new user/i.test(msg)) return 'NIM atau kode aktivasi tidak valid.';
  if (/User already registered/i.test(msg)) return 'Akun dengan NIM ini sudah aktif. Silakan masuk.';
  if (/Password should be at least/i.test(msg)) return 'Kata sandi terlalu pendek (minimal 8 karakter).';
  if (/violates check constraint/i.test(msg)) return 'Ada isian yang tidak valid atau terlalu panjang.';
  if (/duplicate key/i.test(msg)) return 'Data yang sama sudah ada.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Tidak dapat terhubung ke server. Periksa koneksi internet.';
  if (/rate limit|too many/i.test(msg)) return 'Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.';
  return msg;
}

export const toUserError = (error) => (error instanceof UserError ? error : new UserError(translate(error)));

// Jalankan query Supabase dan lempar UserError bila gagal.
export async function q(query) {
  const { data, error } = await query;
  if (error) throw toUserError(error);
  return data;
}

// Supabase membatasi 1000 baris per permintaan; ambil semua halaman.
export async function fetchAll(buildQuery, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const page = await q(buildQuery().range(from, from + pageSize - 1));
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export async function getSettings() {
  return q(sb.from('settings').select('*').eq('id', 1).single());
}
