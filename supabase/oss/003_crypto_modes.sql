-- Table: public.user_crypto_v2
-- Stores per-user key metadata for cloud-managed key mode and local-passphrase mode.

create table if not exists public.user_crypto_v2 (
  user_id uuid not null references auth.users(id) on delete cascade,

  mode text not null check (mode in ('cloud-managed', 'local-passphrase')),
  key_version integer not null default 1,

  -- cloud-managed mode only (NOT true E2EE)
  dek_b64 text null,

  -- local-passphrase mode metadata (true E2EE)
  kdf text null,
  kdf_salt_b64 text null,
  kdf_iterations integer null,
  key_check_b64 text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id)
);

drop trigger if exists tabplex_user_crypto_v2_set_updated_at on public.user_crypto_v2;
create trigger tabplex_user_crypto_v2_set_updated_at
before update on public.user_crypto_v2
for each row
execute function public.tabplex_set_updated_at();

alter table public.user_crypto_v2 enable row level security;

drop policy if exists "tabplex_user_crypto_v2_select_own" on public.user_crypto_v2;
create policy "tabplex_user_crypto_v2_select_own"
on public.user_crypto_v2
for select
using ((select auth.uid()) = user_id);

drop policy if exists "tabplex_user_crypto_v2_insert_own" on public.user_crypto_v2;
create policy "tabplex_user_crypto_v2_insert_own"
on public.user_crypto_v2
for insert
with check ((select auth.uid()) = user_id);

drop policy if exists "tabplex_user_crypto_v2_update_own" on public.user_crypto_v2;
create policy "tabplex_user_crypto_v2_update_own"
on public.user_crypto_v2
for update
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "tabplex_user_crypto_v2_delete_own" on public.user_crypto_v2;
create policy "tabplex_user_crypto_v2_delete_own"
on public.user_crypto_v2
for delete
using ((select auth.uid()) = user_id);
