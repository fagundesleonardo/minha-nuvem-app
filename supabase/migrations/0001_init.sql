-- Minha Nuvem (own app) — initial schema
-- Runs in its own "cloudapp" schema so it never collides with Nextcloud's
-- tables (which live in "public", prefixed oc_) in the same Postgres project.

create schema if not exists cloudapp;

-- ---------------------------------------------------------------------
-- Plans (mirrors what the old meucloud admin panel had: name/quota/price)
-- ---------------------------------------------------------------------
create table if not exists cloudapp.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  quota_bytes bigint not null,
  price_cents integer,
  description text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Profiles — one row per auth.users row, created via trigger on signup
-- ---------------------------------------------------------------------
create table if not exists cloudapp.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'user' check (role in ('user','admin')),
  status text not null default 'active' check (status in ('active','suspended')),
  plan_id uuid references cloudapp.plans(id) on delete set null,
  quota_bytes bigint not null default 5368709120, -- 5 GB default until a plan is assigned
  used_bytes bigint not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on cloudapp.profiles(role);

-- ---------------------------------------------------------------------
-- Folders — self-referencing tree, root = parent_id is null
-- ---------------------------------------------------------------------
create table if not exists cloudapp.folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references cloudapp.profiles(id) on delete cascade,
  parent_id uuid references cloudapp.folders(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, parent_id, name)
);

create index if not exists folders_owner_parent_idx on cloudapp.folders(owner_id, parent_id);

-- ---------------------------------------------------------------------
-- Files — metadata only; bytes live in Cloudflare R2 at r2_key
-- ---------------------------------------------------------------------
create table if not exists cloudapp.files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references cloudapp.profiles(id) on delete cascade,
  folder_id uuid references cloudapp.folders(id) on delete cascade,
  name text not null,
  size_bytes bigint not null default 0,
  mime_type text,
  r2_key text not null unique,
  status text not null default 'ready' check (status in ('pending','ready')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, folder_id, name)
);

create index if not exists files_owner_folder_idx on cloudapp.files(owner_id, folder_id);

-- ---------------------------------------------------------------------
-- Shares — public links to a single file or an entire folder
-- ---------------------------------------------------------------------
create table if not exists cloudapp.shares (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  file_id uuid references cloudapp.files(id) on delete cascade,
  folder_id uuid references cloudapp.folders(id) on delete cascade,
  created_by uuid not null references cloudapp.profiles(id) on delete cascade,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (file_id is not null and folder_id is null) or
    (file_id is null and folder_id is not null)
  )
);

create index if not exists shares_token_idx on cloudapp.shares(token);

-- ---------------------------------------------------------------------
-- Phone photo/video backup — mirrors the old "Fotos do Celular" flow,
-- but now first-class: a device-granted item can be browsed/viewed, not
-- just uploaded blind into a folder.
-- ---------------------------------------------------------------------
create table if not exists cloudapp.device_media (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references cloudapp.profiles(id) on delete cascade,
  file_id uuid not null references cloudapp.files(id) on delete cascade,
  media_type text not null check (media_type in ('photo','video')),
  captured_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists device_media_owner_idx on cloudapp.device_media(owner_id, created_at desc);

-- ---------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------
create or replace function cloudapp.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on cloudapp.profiles;
create trigger set_updated_at before update on cloudapp.profiles
  for each row execute function cloudapp.set_updated_at();

drop trigger if exists set_updated_at on cloudapp.folders;
create trigger set_updated_at before update on cloudapp.folders
  for each row execute function cloudapp.set_updated_at();

drop trigger if exists set_updated_at on cloudapp.files;
create trigger set_updated_at before update on cloudapp.files
  for each row execute function cloudapp.set_updated_at();

-- ---------------------------------------------------------------------
-- Auto-create a profile row whenever someone signs up via Supabase Auth
-- ---------------------------------------------------------------------
create or replace function cloudapp.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into cloudapp.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', new.email));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function cloudapp.handle_new_user();

-- ---------------------------------------------------------------------
-- used_bytes bookkeeping: keep profiles.used_bytes in sync with files
-- ---------------------------------------------------------------------
create or replace function cloudapp.adjust_used_bytes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update cloudapp.profiles set used_bytes = used_bytes + new.size_bytes where id = new.owner_id;
  elsif tg_op = 'DELETE' then
    update cloudapp.profiles set used_bytes = greatest(0, used_bytes - old.size_bytes) where id = old.owner_id;
  elsif tg_op = 'UPDATE' and new.size_bytes <> old.size_bytes then
    update cloudapp.profiles set used_bytes = greatest(0, used_bytes - old.size_bytes + new.size_bytes) where id = new.owner_id;
  end if;
  return null;
end;
$$;

drop trigger if exists adjust_used_bytes on cloudapp.files;
create trigger adjust_used_bytes
  after insert or update or delete on cloudapp.files
  for each row execute function cloudapp.adjust_used_bytes();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table cloudapp.profiles enable row level security;
alter table cloudapp.folders enable row level security;
alter table cloudapp.files enable row level security;
alter table cloudapp.shares enable row level security;
alter table cloudapp.device_media enable row level security;
alter table cloudapp.plans enable row level security;

create or replace function cloudapp.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from cloudapp.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- profiles: user sees/edits own row; admin sees/edits all
create policy profiles_select_own on cloudapp.profiles for select
  using (id = auth.uid() or cloudapp.is_admin());
create policy profiles_update_own on cloudapp.profiles for update
  using (id = auth.uid() or cloudapp.is_admin());
create policy profiles_update_admin on cloudapp.profiles for update
  using (cloudapp.is_admin());

-- plans: everyone signed in can read; only admin can write
create policy plans_select_all on cloudapp.plans for select using (auth.uid() is not null);
create policy plans_write_admin on cloudapp.plans for all using (cloudapp.is_admin()) with check (cloudapp.is_admin());

-- folders/files: owner or admin
create policy folders_owner on cloudapp.folders for all
  using (owner_id = auth.uid() or cloudapp.is_admin())
  with check (owner_id = auth.uid() or cloudapp.is_admin());

create policy files_owner on cloudapp.files for all
  using (owner_id = auth.uid() or cloudapp.is_admin())
  with check (owner_id = auth.uid() or cloudapp.is_admin());

create policy device_media_owner on cloudapp.device_media for all
  using (owner_id = auth.uid() or cloudapp.is_admin())
  with check (owner_id = auth.uid() or cloudapp.is_admin());

-- shares: owner (created_by) or admin can manage; the public "resolve a
-- token" read path goes through a server-side API route using the
-- service role key, not through this RLS policy.
create policy shares_owner on cloudapp.shares for all
  using (created_by = auth.uid() or cloudapp.is_admin())
  with check (created_by = auth.uid() or cloudapp.is_admin());
