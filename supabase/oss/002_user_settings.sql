-- Table: public.user_settings
-- Stores user preferences and global settings
create table if not exists public.user_settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  
  -- The settings JSON blob
  data jsonb not null default '{}'::jsonb,
  
  -- Logical clock for conflict resolution
  version integer not null default 0,
  
  -- Client timestamp
  client_updated_at_ms bigint null,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  primary key (user_id)
);

-- Trigger for updated_at
drop trigger if exists tabplex_user_settings_set_updated_at on public.user_settings;
create trigger tabplex_user_settings_set_updated_at
before update on public.user_settings
for each row
execute function public.tabplex_set_updated_at();

-- RLS
alter table public.user_settings enable row level security;

drop policy if exists "tabplex_user_settings_select_own" on public.user_settings;
create policy "tabplex_user_settings_select_own"
on public.user_settings
for select
using ((select auth.uid()) = user_id);

drop policy if exists "tabplex_user_settings_insert_own" on public.user_settings;
create policy "tabplex_user_settings_insert_own"
on public.user_settings
for insert
with check ((select auth.uid()) = user_id);

drop policy if exists "tabplex_user_settings_update_own" on public.user_settings;
create policy "tabplex_user_settings_update_own"
on public.user_settings
for update
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "tabplex_user_settings_delete_own" on public.user_settings;
create policy "tabplex_user_settings_delete_own"
on public.user_settings
for delete
using ((select auth.uid()) = user_id);
