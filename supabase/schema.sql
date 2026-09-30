-- =====================================================================
-- Logbook KWU — skema database Supabase
-- Jalankan di Supabase: Dashboard → SQL Editor → New query → tempel seluruh isi file ini → Run.
-- Aman dijalankan ulang (misalnya bila percobaan pertama gagal di tengah jalan); data yang sudah ada tidak dihapus.
-- Keamanan data dijaga oleh Row Level Security (RLS): setiap baris hanya bisa dibaca/diubah
-- oleh pengguna yang berhak, walaupun kunci "anon" aplikasi bersifat publik.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Tabel
-- ---------------------------------------------------------------------

create table if not exists public.settings (
  id                         int primary key default 1 check (id = 1),
  program_name               text not null default 'Program Kewirausahaan Mahasiswa' check (length(program_name) <= 150),
  period_start               date not null default current_date,
  period_weeks               int  not null default 14 check (period_weeks between 1 and 52),
  min_personal_logs_per_week int  not null default 1 check (min_personal_logs_per_week between 1 and 14),
  min_group_logs_per_week    int  not null default 1 check (min_group_logs_per_week between 1 and 14)
);
insert into public.settings default values on conflict (id) do nothing;

create table if not exists public.groups (
  id            bigint generated always as identity primary key,
  name          text not null unique check (length(name) between 1 and 100),
  business_name text check (length(business_name) <= 200),
  business_desc text check (length(business_desc) <= 2000),
  mentor_id     uuid,
  created_at    timestamptz not null default now()
);

-- Satu baris per akun yang sudah aktif (terhubung ke auth.users).
create table if not exists public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  nim                  text not null unique,
  name                 text not null check (length(name) between 1 and 100),
  role                 text not null check (role in ('mahasiswa', 'dosen')),
  prodi                text check (length(prodi) <= 100),
  group_id             bigint references public.groups (id) on delete set null,
  must_change_password boolean not null default false,
  created_at           timestamptz not null default now()
);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'groups_mentor_id_fkey') then
    alter table public.groups
      add constraint groups_mentor_id_fkey foreign key (mentor_id) references public.profiles (id) on delete set null;
  end if;
end $$;

-- Daftar peserta yang boleh mendaftar. Dosen mengisi daftar ini; mahasiswa mengaktifkan akun
-- dengan NIM + kode aktivasi. Kode dihapus setelah dipakai.
create or replace function public.gen_activation_code() returns text
language sql volatile security definer set search_path = '' as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (get_byte(b, i) % 32) + 1, 1), '')
    from (select extensions.gen_random_bytes(8) as b) r, generate_series(0, 7) as i;
$$;

create table if not exists public.roster (
  nim             text primary key check (nim ~ '^[A-Za-z0-9._-]{3,30}$'),
  name            text not null check (length(name) between 1 and 100),
  role            text not null default 'mahasiswa' check (role in ('mahasiswa', 'dosen')),
  prodi           text check (length(prodi) <= 100),
  group_id        bigint references public.groups (id) on delete set null,
  activation_code text default public.gen_activation_code(),
  claimed_by      uuid references public.profiles (id) on delete set null,
  claimed_at      timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists public.personal_logs (
  id             bigint generated always as identity primary key,
  user_id        uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  log_date       date not null,
  activity       text not null check (length(activity) between 1 and 200),
  description    text check (length(description) <= 5000),
  outcome        text check (length(outcome) <= 5000),
  duration_hours numeric(4, 1) check (duration_hours between 0 and 24),
  status         text not null default 'menunggu' check (status in ('menunggu', 'disetujui', 'revisi')),
  feedback       text check (length(feedback) <= 2000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists personal_logs_user_idx on public.personal_logs (user_id, log_date);

create table if not exists public.group_logs (
  id             bigint generated always as identity primary key,
  group_id       bigint not null references public.groups (id) on delete cascade,
  author_id      uuid default auth.uid() references public.profiles (id) on delete set null,
  log_date       date not null,
  activity       text not null check (length(activity) between 1 and 200),
  description    text check (length(description) <= 5000),
  outcome        text check (length(outcome) <= 5000),
  attendees      text check (length(attendees) <= 500),
  duration_hours numeric(4, 1) check (duration_hours between 0 and 24),
  status         text not null default 'menunggu' check (status in ('menunggu', 'disetujui', 'revisi')),
  feedback       text check (length(feedback) <= 2000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists group_logs_group_idx on public.group_logs (group_id, log_date);

-- Dokumen disimpan sebagai tautan (Google Drive, OneDrive, dll.), bukan file.
create table if not exists public.documents (
  id          bigint generated always as identity primary key,
  owner_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  group_id    bigint references public.groups (id) on delete cascade,
  scope       text not null check (scope in ('pribadi', 'kelompok')),
  category    text not null check (length(category) between 1 and 100),
  title       text not null check (length(title) between 1 and 200),
  description text check (length(description) <= 2000),
  url         text not null check (url ~* '^https?://[^\s]+$' and length(url) <= 2000),
  created_at  timestamptz not null default now(),
  check ((scope = 'pribadi' and group_id is null) or (scope = 'kelompok' and group_id is not null))
);

create table if not exists public.topics (
  id          bigint generated always as identity primary key,
  title       text not null check (length(title) between 1 and 200),
  description text check (length(description) <= 3000),
  week_no     int check (week_no between 1 and 52),
  created_at  timestamptz not null default now()
);

create table if not exists public.materials (
  id             bigint generated always as identity primary key,
  topic_id       bigint not null references public.topics (id) on delete cascade,
  title          text not null check (length(title) between 1 and 200),
  content        text check (length(content) <= 50000),
  link_url       text check (link_url ~* '^https?://[^\s]+$' and length(link_url) <= 2000),
  attachment_url text check (attachment_url ~* '^https?://[^\s]+$' and length(attachment_url) <= 2000),
  created_at     timestamptz not null default now(),
  check (coalesce(content, '') <> '' or link_url is not null or attachment_url is not null)
);

create table if not exists public.material_progress (
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  material_id  bigint not null references public.materials (id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, material_id)
);

-- ---------------------------------------------------------------------
-- Fungsi bantu untuk aturan akses
-- ---------------------------------------------------------------------

create or replace function public.is_dosen() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'dosen');
$$;

create or replace function public.my_group() returns bigint
language sql stable security definer set search_path = '' as $$
  select group_id from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- Pendaftaran akun: hanya NIM yang ada di roster + kode aktivasi yang benar.
-- ---------------------------------------------------------------------

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_nim  text := new.raw_user_meta_data ->> 'nim';
  v_code text := upper(trim(coalesce(new.raw_user_meta_data ->> 'activation_code', '')));
  r      public.roster;
begin
  select * into r from public.roster where nim = v_nim for update;
  if not found or r.claimed_by is not null or r.activation_code is null or r.activation_code <> v_code then
    raise exception 'NIM atau kode aktivasi tidak valid.' using errcode = 'P0001';
  end if;
  insert into public.profiles (id, nim, name, role, prodi, group_id)
  values (new.id, r.nim, r.name, r.role, r.prodi, r.group_id);
  update public.roster set claimed_by = new.id, claimed_at = now(), activation_code = null where nim = r.nim;
  return new;
end;
$$;

-- Trigger di auth.users hanya dibuat bila belum ada (peran SQL Editor tidak boleh menghapusnya).
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'on_auth_user_created' and tgrelid = 'auth.users'::regclass) then
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_user();
  end if;
end $$;

-- Dipakai halaman aktivasi untuk memeriksa NIM + kode sebelum mendaftar. Mengembalikan nama bila valid.
create or replace function public.check_activation(p_nim text, p_code text) returns text
language sql stable security definer set search_path = '' as $$
  select name from public.roster
   where nim = p_nim and claimed_by is null and activation_code is not null
     and activation_code = upper(trim(p_code));
$$;

-- ---------------------------------------------------------------------
-- Penjaga status log: mahasiswa tidak dapat menyetujui lognya sendiri,
-- dan log yang sudah disetujui dosen terkunci.
-- ---------------------------------------------------------------------

create or replace function public.guard_personal_log() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.user_id := old.user_id;
    new.created_at := old.created_at;
  end if;
  if public.is_dosen() then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'disetujui' then
    raise exception 'Log yang sudah disetujui dosen tidak dapat diubah.' using errcode = 'P0001';
  end if;
  new.status := 'menunggu';
  new.feedback := case when tg_op = 'UPDATE' then old.feedback end;
  return new;
end;
$$;

drop trigger if exists personal_logs_guard on public.personal_logs;
create trigger personal_logs_guard
  before insert or update on public.personal_logs
  for each row execute function public.guard_personal_log();

create or replace function public.guard_group_log() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.group_id := old.group_id;
    new.author_id := old.author_id;
    new.created_at := old.created_at;
  end if;
  if public.is_dosen() then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'disetujui' then
    raise exception 'Log yang sudah disetujui dosen tidak dapat diubah.' using errcode = 'P0001';
  end if;
  new.status := 'menunggu';
  new.feedback := case when tg_op = 'UPDATE' then old.feedback end;
  return new;
end;
$$;

drop trigger if exists group_logs_guard on public.group_logs;
create trigger group_logs_guard
  before insert or update on public.group_logs
  for each row execute function public.guard_group_log();

-- ---------------------------------------------------------------------
-- Fungsi untuk dosen
-- ---------------------------------------------------------------------

-- Impor mahasiswa dari daftar JSON: [{"nim","name","group","prodi"}]. Kelompok baru dibuat otomatis.
create or replace function public.import_roster(p_rows jsonb)
returns table (nim text, name text, activation_code text, status text)
language plpgsql security definer set search_path = '' as $$
declare
  item    jsonb;
  v_nim   text;
  v_name  text;
  v_group text;
  v_gid   bigint;
  v_code  text;
begin
  if not public.is_dosen() then
    raise exception 'Hanya dosen yang dapat mengimpor mahasiswa.' using errcode = '42501';
  end if;
  for item in select * from jsonb_array_elements(p_rows) loop
    v_nim := trim(item ->> 'nim');
    v_name := trim(item ->> 'name');
    v_group := nullif(trim(coalesce(item ->> 'group', '')), '');
    nim := v_nim; name := v_name; activation_code := null;
    if v_nim is null or v_nim !~ '^[A-Za-z0-9._-]{3,30}$' then
      status := 'NIM tidak valid'; return next; continue;
    end if;
    if coalesce(v_name, '') = '' then
      status := 'Nama kosong'; return next; continue;
    end if;
    if exists (select 1 from public.roster r where r.nim = v_nim) then
      status := 'NIM sudah terdaftar'; return next; continue;
    end if;
    v_gid := null;
    if v_group is not null then
      select g.id into v_gid from public.groups g where g.name = v_group;
      if v_gid is null then
        insert into public.groups (name) values (v_group) returning id into v_gid;
      end if;
    end if;
    insert into public.roster (nim, name, prodi, group_id)
    values (v_nim, left(v_name, 100), nullif(trim(coalesce(item ->> 'prodi', '')), ''), v_gid)
    returning roster.activation_code into v_code;
    activation_code := v_code; status := 'ok';
    return next;
  end loop;
end;
$$;

-- Buat kata sandi sementara untuk mahasiswa yang lupa kata sandi.
create or replace function public.reset_student_password(p_user uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_password text := public.gen_activation_code() || public.gen_activation_code();
begin
  if not public.is_dosen() then
    raise exception 'Hanya dosen yang dapat mereset kata sandi.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_user and role = 'mahasiswa') then
    raise exception 'Mahasiswa tidak ditemukan.' using errcode = 'P0002';
  end if;
  v_password := lower(left(v_password, 10));
  update auth.users
     set encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')), updated_at = now()
   where id = p_user;
  delete from auth.sessions where user_id = p_user;
  update public.profiles set must_change_password = true where id = p_user;
  return v_password;
end;
$$;

-- Hapus akun mahasiswa beserta seluruh log & dokumennya.
create or replace function public.delete_student(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_dosen() then
    raise exception 'Hanya dosen yang dapat menghapus akun.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_user and role = 'mahasiswa') then
    raise exception 'Mahasiswa tidak ditemukan.' using errcode = 'P0002';
  end if;
  delete from public.roster where claimed_by = p_user;
  delete from auth.users where id = p_user;
end;
$$;

-- Dipanggil setelah pengguna mengganti kata sandi sementara.
create or replace function public.password_changed() returns void
language sql security definer set search_path = '' as $$
  update public.profiles set must_change_password = false where id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

-- Hapus aturan lama (bila skrip dijalankan ulang) agar bisa dibuat ulang tanpa error.
do $$
declare
  p record;
begin
  for p in
    select policyname, tablename from pg_policies
     where schemaname = 'public'
       and tablename in ('settings', 'groups', 'profiles', 'roster', 'personal_logs', 'group_logs',
                         'documents', 'topics', 'materials', 'material_progress')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

alter table public.settings          enable row level security;
alter table public.groups            enable row level security;
alter table public.profiles          enable row level security;
alter table public.roster            enable row level security;
alter table public.personal_logs     enable row level security;
alter table public.group_logs        enable row level security;
alter table public.documents         enable row level security;
alter table public.topics            enable row level security;
alter table public.materials         enable row level security;
alter table public.material_progress enable row level security;

create policy "settings: semua pengguna membaca" on public.settings for select to authenticated using (true);
create policy "settings: dosen mengubah" on public.settings for update to authenticated
  using (public.is_dosen()) with check (public.is_dosen());

create policy "groups: semua pengguna membaca" on public.groups for select to authenticated using (true);
create policy "groups: dosen menambah" on public.groups for insert to authenticated with check (public.is_dosen());
create policy "groups: dosen mengubah" on public.groups for update to authenticated
  using (public.is_dosen()) with check (public.is_dosen());
create policy "groups: dosen menghapus" on public.groups for delete to authenticated using (public.is_dosen());

create policy "profiles: diri sendiri, dosen, atau sekelompok" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_dosen() or role = 'dosen' or (group_id is not null and group_id = public.my_group()));
create policy "profiles: dosen mengubah" on public.profiles for update to authenticated
  using (public.is_dosen()) with check (public.is_dosen());

create policy "roster: hanya dosen" on public.roster for all to authenticated
  using (public.is_dosen()) with check (public.is_dosen());

create policy "personal_logs: pemilik atau dosen membaca" on public.personal_logs for select to authenticated
  using (user_id = auth.uid() or public.is_dosen());
create policy "personal_logs: pemilik menambah" on public.personal_logs for insert to authenticated
  with check (user_id = auth.uid());
create policy "personal_logs: pemilik atau dosen mengubah" on public.personal_logs for update to authenticated
  using (user_id = auth.uid() or public.is_dosen());
create policy "personal_logs: pemilik menghapus sebelum disetujui" on public.personal_logs for delete to authenticated
  using (user_id = auth.uid() and status <> 'disetujui');

create policy "group_logs: anggota atau dosen membaca" on public.group_logs for select to authenticated
  using (public.is_dosen() or group_id = public.my_group());
create policy "group_logs: anggota menambah" on public.group_logs for insert to authenticated
  with check (author_id = auth.uid() and group_id = public.my_group());
create policy "group_logs: penulis atau dosen mengubah" on public.group_logs for update to authenticated
  using (author_id = auth.uid() or public.is_dosen());
create policy "group_logs: penulis menghapus sebelum disetujui" on public.group_logs for delete to authenticated
  using (author_id = auth.uid() and status <> 'disetujui');

create policy "documents: pemilik, kelompok, atau dosen membaca" on public.documents for select to authenticated
  using (owner_id = auth.uid() or public.is_dosen() or (scope = 'kelompok' and group_id = public.my_group()));
create policy "documents: pemilik menambah" on public.documents for insert to authenticated
  with check (owner_id = auth.uid() and (group_id is null or group_id = public.my_group()));
create policy "documents: pemilik menghapus" on public.documents for delete to authenticated
  using (owner_id = auth.uid());

create policy "topics: semua pengguna membaca" on public.topics for select to authenticated using (true);
create policy "topics: dosen mengelola" on public.topics for all to authenticated
  using (public.is_dosen()) with check (public.is_dosen());

create policy "materials: semua pengguna membaca" on public.materials for select to authenticated using (true);
create policy "materials: dosen mengelola" on public.materials for all to authenticated
  using (public.is_dosen()) with check (public.is_dosen());

create policy "material_progress: pemilik atau dosen membaca" on public.material_progress for select to authenticated
  using (user_id = auth.uid() or public.is_dosen());
create policy "material_progress: pemilik menandai" on public.material_progress for insert to authenticated
  with check (user_id = auth.uid());
create policy "material_progress: pemilik membatalkan" on public.material_progress for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Hak akses: pengunjung anonim tidak dapat membaca tabel apa pun.
-- ---------------------------------------------------------------------

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.check_activation(text, text) to anon;
