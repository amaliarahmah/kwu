import { html } from './lib/html.js';
import { sb, isConfigured, q, getSettings, UserError, toUserError } from './api.js';

import loginPage from './pages/login.js';
import activationPage from './pages/aktivasi.js';
import passwordPage from './pages/password.js';
import setupPage from './pages/setup.js';
import mBeranda from './pages/mahasiswa/beranda.js';
import mLogPribadi from './pages/mahasiswa/log-pribadi.js';
import mLogKelompok from './pages/mahasiswa/log-kelompok.js';
import mDokumen from './pages/mahasiswa/dokumen.js';
import mMateri from './pages/mahasiswa/materi.js';
import mMateriDetail from './pages/mahasiswa/materi-detail.js';
import mRekap from './pages/mahasiswa/rekap.js';
import dDashboard from './pages/dosen/dashboard.js';
import dAntrian from './pages/dosen/antrian.js';
import dMahasiswa from './pages/dosen/mahasiswa-detail.js';
import dKelompok from './pages/dosen/kelompok-detail.js';
import dMateri from './pages/dosen/materi.js';
import dMateriForm from './pages/dosen/materi-form.js';
import dKelola from './pages/dosen/kelola.js';

const ROUTES = [
  ['/login', loginPage, 'guest'],
  ['/aktivasi', activationPage, 'guest'],
  ['/akun/password', passwordPage, 'any'],
  ['/mahasiswa', mBeranda, 'mahasiswa'],
  ['/mahasiswa/log-pribadi', mLogPribadi, 'mahasiswa'],
  ['/mahasiswa/log-kelompok', mLogKelompok, 'mahasiswa'],
  ['/mahasiswa/dokumen', mDokumen, 'mahasiswa'],
  ['/mahasiswa/materi', mMateri, 'mahasiswa'],
  ['/mahasiswa/materi/:id', mMateriDetail, 'mahasiswa'],
  ['/mahasiswa/rekap', mRekap, 'mahasiswa'],
  ['/dosen', dDashboard, 'dosen'],
  ['/dosen/antrian', dAntrian, 'dosen'],
  ['/dosen/mahasiswa/:id', dMahasiswa, 'dosen'],
  ['/dosen/kelompok/:id', dKelompok, 'dosen'],
  ['/dosen/materi', dMateri, 'dosen'],
  ['/dosen/materi/baru', dMateriForm, 'dosen'],
  ['/dosen/materi/:id/ubah', dMateriForm, 'dosen'],
  ['/dosen/kelola', dKelola, 'dosen'],
].map(([pattern, page, access]) => ({
  page,
  access,
  regex: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'),
}));

const NAV = {
  dosen: [['/dosen', 'Dashboard'], ['/dosen/antrian', 'Pemeriksaan'], ['/dosen/materi', 'Materi'], ['/dosen/kelola', 'Kelola Data']],
  mahasiswa: [
    ['/mahasiswa', 'Beranda'], ['/mahasiswa/log-pribadi', 'Log Pribadi'], ['/mahasiswa/log-kelompok', 'Log Kelompok'],
    ['/mahasiswa/dokumen', 'Dokumen'], ['/mahasiswa/materi', 'Materi'], ['/mahasiswa/rekap', 'Rekap'],
  ],
};

const state = { profile: null, flash: null, current: null, renderId: 0 };
const headerEl = document.getElementById('topbar');
const mainEl = document.getElementById('main');

const homeFor = (profile) => (profile?.role === 'dosen' ? '/dosen' : '/mahasiswa');

function parseHash() {
  const [path, search = ''] = location.hash.replace(/^#/, '').split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(search)) };
}

export function navigate(path, flash) {
  if (flash) state.flash = flash;
  if (location.hash === `#${path}`) render();
  else location.hash = path;
}

async function loadProfile() {
  const { data } = await sb.auth.getSession();
  const user = data.session?.user;
  if (!user) {
    state.profile = null;
    return;
  }
  const profile = await q(sb.from('profiles').select('*').eq('id', user.id).maybeSingle());
  if (!profile) {
    await sb.auth.signOut();
    state.profile = null;
    state.flash = { type: 'error', message: 'Akun ini belum terdaftar sebagai peserta. Hubungi dosen pengampu.' };
    return;
  }
  profile.group = profile.group_id
    ? await q(sb.from('groups').select('id, name, business_name, mentor_id').eq('id', profile.group_id).maybeSingle())
    : null;
  state.profile = profile;
}

function renderHeader(path) {
  const p = state.profile;
  if (!p) {
    headerEl.hidden = true;
    headerEl.innerHTML = '';
    return;
  }
  const base = homeFor(p);
  headerEl.hidden = false;
  headerEl.innerHTML = html`
    <div class="topbar-inner">
      <a class="brand" href="#${base}">Logbook <strong>KWU</strong></a>
      <nav class="mainnav" aria-label="Menu utama">
        ${p.must_change_password
          ? ''
          : NAV[p.role].map(([href, label]) => {
              const active = href === base ? path === base : path.startsWith(href);
              return html`<a href="#${href}" class="${active ? 'active' : ''}">${label}</a>`;
            })}
      </nav>
      <details class="account">
        <summary>${p.name} <span class="role">${p.role === 'dosen' ? 'Dosen' : 'Mahasiswa'}</span></summary>
        <div class="account-menu">
          <span class="muted small">${p.nim}${p.group ? ` · ${p.group.name}` : ''}</span>
          <a href="#/akun/password">Ubah kata sandi</a>
          <button class="link-button" type="button" data-global="logout">Keluar</button>
        </div>
      </details>
    </div>`.toString();
}

function flashHtml() {
  const f = state.flash;
  state.flash = null;
  return f ? html`<div class="alert alert-${f.type}" role="status">${f.message}</div>` : '';
}

function applyEnhancements(root) {
  root.querySelectorAll('[data-width]').forEach((el) => {
    el.style.width = `${Math.max(0, Math.min(100, Number(el.dataset.width)))}%`;
  });
}

async function render() {
  const renderId = ++state.renderId;
  const { path, query } = parseHash();

  if (!isConfigured) {
    mainEl.innerHTML = setupPage.view().toString();
    return;
  }

  let match = null;
  for (const route of ROUTES) {
    const m = route.regex.exec(path);
    if (m) {
      match = { route, params: m.groups ?? {} };
      break;
    }
  }

  const p = state.profile;
  if (!match) return navigate(p ? homeFor(p) : '/login');
  const { route, params } = match;
  if (!p && route.access !== 'guest') return navigate('/login');
  if (p && route.access === 'guest') return navigate(homeFor(p));
  if (p?.must_change_password && route.page !== passwordPage) return navigate('/akun/password');
  if (p && route.access !== 'any' && route.access !== 'guest' && route.access !== p.role) return navigate(homeFor(p));

  renderHeader(path);
  const page = route.page;
  const ctx = { params, query, path, profile: p, navigate };
  state.current = { page, ctx };
  document.title = `${page.title ?? 'Logbook KWU'} · Logbook KWU`;
  if (!mainEl.firstElementChild) mainEl.innerHTML = '<p class="muted">Memuat…</p>';
  mainEl.setAttribute('aria-busy', 'true');

  try {
    if (p) ctx.settings = await getSettings();
    const data = page.load ? await page.load(ctx) : {};
    if (renderId !== state.renderId) return;
    if (data?.title) document.title = `${data.title} · Logbook KWU`;
    mainEl.innerHTML = html`${flashHtml()}${page.view(data, ctx)}`.toString();
    ctx.data = data;
    applyEnhancements(mainEl);
    page.mounted?.(mainEl, data, ctx);
  } catch (err) {
    if (renderId !== state.renderId) return;
    console.error(err);
    mainEl.innerHTML = html`<section class="card narrow"><h1>Gagal memuat halaman</h1>
      <p>${toUserError(err).message}</p><p><a class="btn" href="#${homeFor(p)}">Kembali</a></p></section>`.toString();
  } finally {
    mainEl.removeAttribute('aria-busy');
  }
  if (!location.hash.includes('#form')) window.scrollTo(0, 0);
}

function showErrors(container, err) {
  const messages = toUserError(err).messages;
  const target = container?.querySelector('.form-errors') ?? null;
  const markup = html`<div class="alert alert-error" role="alert"><ul>${messages.map((m) => html`<li>${m}</li>`)}</ul></div>`.toString();
  if (target) {
    target.innerHTML = markup;
    target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  } else {
    mainEl.insertAdjacentHTML('afterbegin', markup);
    window.scrollTo(0, 0);
  }
}

async function runAction(name, values, el, busyEl) {
  const current = state.current;
  const handler = current?.page.actions?.[name];
  if (!handler) return;
  if (el.dataset.confirm && !window.confirm(el.dataset.confirm)) return;
  busyEl?.setAttribute('disabled', '');
  el.querySelector?.('.form-errors')?.replaceChildren();
  try {
    const result = await handler(values, { ...current.ctx, el, reloadProfile: loadProfile });
    if (result?.flash) state.flash = { type: 'success', message: result.flash };
    if (result?.navigate) navigate(result.navigate);
    else if (!result?.stay) await render();
  } catch (err) {
    if (!(err instanceof UserError)) console.error(err);
    showErrors(el.tagName === 'FORM' ? el : null, err);
  } finally {
    busyEl?.removeAttribute('disabled');
  }
}

document.addEventListener('submit', (event) => {
  const form = event.target.closest('form[data-action]');
  if (!form) return;
  event.preventDefault();
  const data = new FormData(form, event.submitter ?? undefined);
  const values = {};
  for (const [key, value] of data.entries()) values[key] = typeof value === 'string' ? value : '';
  runAction(form.dataset.action, values, form, event.submitter ?? form.querySelector('[type=submit]'));
});

document.addEventListener('click', async (event) => {
  const logout = event.target.closest('[data-global="logout"]');
  if (logout) {
    await sb.auth.signOut();
    state.profile = null;
    navigate('/login');
    return;
  }
  const button = event.target.closest('button[data-action]:not([type=submit])');
  if (button) runAction(button.dataset.action, { ...button.dataset }, button, button);
  const print = event.target.closest('[data-global="print"]');
  if (print) window.print();
});

window.addEventListener('hashchange', render);

async function start() {
  if (isConfigured) {
    try {
      await loadProfile();
    } catch (err) {
      state.flash = { type: 'error', message: toUserError(err).message };
    }
    sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && state.profile) {
        state.profile = null;
        navigate('/login');
      }
    });
  }
  render();
}

export const session = { loadProfile, get profile() { return state.profile; } };

start();
