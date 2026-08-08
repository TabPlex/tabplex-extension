-- TabPlex OSS minimal sync (Storage-first, DB minimal metadata)
-- Applies:
-- - public.workspaces table (metadata + snapshot pointer)
-- - RLS policies
-- - storage bucket + policies for per-user objects

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.tabplex_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Table: public.workspaces
-- ---------------------------------------------------------------------------
create table if not exists public.workspaces (
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null,

  -- High-frequency metadata (read often, small)
  name text not null,
  emoji text null,
  color text null,
  tab_count integer not null default 0,

  -- Storage pointer to the latest snapshot object (no revision history)
  snapshot_path text not null,
  snapshot_sha256 text null,
  snapshot_size bigint null,

  -- Client-side timestamp for conflict avoidance (best-effort)
  client_updated_at_ms bigint null,

  -- Logical clock for conflict resolution
  version integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,

  primary key (user_id, workspace_id)
);

drop trigger if exists tabplex_workspaces_set_updated_at on public.workspaces;
create trigger tabplex_workspaces_set_updated_at
before update on public.workspaces
for each row
execute function public.tabplex_set_updated_at();

create index if not exists tabplex_workspaces_user_updated_at_idx
  on public.workspaces (user_id, updated_at desc);

create index if not exists tabplex_workspaces_user_deleted_at_idx
  on public.workspaces (user_id, deleted_at desc);

alter table public.workspaces enable row level security;

drop policy if exists "tabplex_workspaces_select_own" on public.workspaces;
create policy "tabplex_workspaces_select_own"
on public.workspaces
for select
using ((select auth.uid()) = user_id);

drop policy if exists "tabplex_workspaces_insert_own" on public.workspaces;
create policy "tabplex_workspaces_insert_own"
on public.workspaces
for insert
with check ((select auth.uid()) = user_id);

drop policy if exists "tabplex_workspaces_update_own" on public.workspaces;
create policy "tabplex_workspaces_update_own"
on public.workspaces
for update
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "tabplex_workspaces_delete_own" on public.workspaces;
create policy "tabplex_workspaces_delete_own"
on public.workspaces
for delete
using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Storage bucket + policies
-- Bucket name must match src/features/cloudSync/cloudSync.ts
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('workspace-snapshots', 'workspace-snapshots', false)
on conflict (id) do nothing;

-- NOTE: These policies assume object keys are prefixed with "{user_id}/...".
drop policy if exists "tabplex_snapshots_select_own" on storage.objects;
create policy "tabplex_snapshots_select_own"
on storage.objects
for select
using (
  bucket_id = 'workspace-snapshots'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "tabplex_snapshots_insert_own" on storage.objects;
create policy "tabplex_snapshots_insert_own"
on storage.objects
for insert
with check (
  bucket_id = 'workspace-snapshots'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "tabplex_snapshots_update_own" on storage.objects;
create policy "tabplex_snapshots_update_own"
on storage.objects
for update
using (
  bucket_id = 'workspace-snapshots'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'workspace-snapshots'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "tabplex_snapshots_delete_own" on storage.objects;
create policy "tabplex_snapshots_delete_own"
on storage.objects
for delete
using (
  bucket_id = 'workspace-snapshots'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
