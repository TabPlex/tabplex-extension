-- TabPlex OSS subscription access policies
--
-- Goals:
-- 1) Users with historical purchases can still sign in and read cloud data.
-- 2) Cloud write operations require an active write-eligible subscription.
-- 3) Entitlement checks are authenticated and self-only. Caller-supplied email
--    addresses are forbidden; the verified email comes from auth.jwt().
--
-- Write-eligible statuses: active, pending_cancel, trialing.

begin;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.tabplex_cloud_write_allowed(
  target_user_id uuid
)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  request_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if request_user_id is null
    or target_user_id is distinct from request_user_id
    or request_email = '' then
    return false;
  end if;

  return exists (
    select 1
    from public.subscription s
    inner join public."user" u on u.id = s.user_id
    where u.id = request_user_id
      and lower(trim(u.email)) = request_email
      and lower(trim(s.status)) in ('active', 'pending_cancel', 'trialing')
  );
end;
$$;

revoke all on function public.tabplex_cloud_write_allowed(uuid)
  from public, anon, authenticated;
grant execute on function public.tabplex_cloud_write_allowed(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Authenticated access status RPC (read + diagnostics)
-- ---------------------------------------------------------------------------
create or replace function public.tabplex_get_cloud_sync_access()
returns table(
  has_purchase boolean,
  can_write boolean,
  status text,
  plan text,
  expires_at text
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  request_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if request_user_id is null or request_email = '' then
    return query select false, false, null::text, null::text, null::text;
    return;
  end if;

  return query
    with matched as (
      select
        lower(trim(s.status)) as status,
        to_jsonb(s) ->> 'plan' as plan,
        coalesce(
          to_jsonb(s) ->> 'expires_at',
          to_jsonb(s) ->> 'current_period_end'
        ) as expires_at
      from public.subscription s
      inner join public."user" u on u.id = s.user_id
      where u.id = request_user_id
        and lower(trim(u.email)) = request_email
    )
    select
      exists (select 1 from matched),
      public.tabplex_cloud_write_allowed(request_user_id),
      (
        select m.status
        from matched m
        order by
          case when m.status in ('active', 'pending_cancel', 'trialing') then 0 else 1 end,
          m.expires_at desc nulls last
        limit 1
      ),
      (
        select m.plan
        from matched m
        order by
          case when m.status in ('active', 'pending_cancel', 'trialing') then 0 else 1 end,
          m.expires_at desc nulls last
        limit 1
      ),
      (
        select m.expires_at
        from matched m
        order by
          case when m.status in ('active', 'pending_cancel', 'trialing') then 0 else 1 end,
          m.expires_at desc nulls last
        limit 1
      );
end;
$$;

revoke all on function public.tabplex_get_cloud_sync_access()
  from public, anon, authenticated;
grant execute on function public.tabplex_get_cloud_sync_access() to authenticated;

-- ---------------------------------------------------------------------------
-- Tighten write policies (read remains unchanged)
-- ---------------------------------------------------------------------------

-- workspaces

drop policy if exists "tabplex_workspaces_insert_own" on public.workspaces;
create policy "tabplex_workspaces_insert_own"
on public.workspaces
for insert
with check (
  (select auth.uid()) = user_id
  and public.tabplex_cloud_write_allowed((select auth.uid()))
);

drop policy if exists "tabplex_workspaces_update_own" on public.workspaces;
create policy "tabplex_workspaces_update_own"
on public.workspaces
for update
using (
  (select auth.uid()) = user_id
  and public.tabplex_cloud_write_allowed((select auth.uid()))
)
with check (
  (select auth.uid()) = user_id
  and public.tabplex_cloud_write_allowed((select auth.uid()))
);

drop policy if exists "tabplex_workspaces_delete_own" on public.workspaces;
create policy "tabplex_workspaces_delete_own"
on public.workspaces
for delete
using (
  (select auth.uid()) = user_id
  and public.tabplex_cloud_write_allowed((select auth.uid()))
);

-- user_settings

drop policy if exists "tabplex_user_settings_insert_own" on public.user_settings;
create policy "tabplex_user_settings_insert_own"
on public.user_settings
for insert
with check (
  (select auth.uid()) = user_id
  and public.tabplex_cloud_write_allowed((select auth.uid()))
);

drop policy if exists "tabplex_user_settings_update_own" on public.user_settings;
create policy "tabplex_user_settings_update_own"
on public.user_settings
for update
using (
  (select auth.uid()) = user_id
  and public.tabplex_cloud_write_allowed((select auth.uid()))
)
with check (
  (select auth.uid()) = user_id
  and public.tabplex_cloud_write_allowed((select auth.uid()))
);

drop policy if exists "tabplex_user_settings_delete_own" on public.user_settings;
create policy "tabplex_user_settings_delete_own"
on public.user_settings
for delete
using (
  (select auth.uid()) = user_id
  and public.tabplex_cloud_write_allowed((select auth.uid()))
);

-- storage.objects (workspace-snapshots)

drop policy if exists "tabplex_snapshots_insert_own" on storage.objects;
create policy "tabplex_snapshots_insert_own"
on storage.objects
for insert
with check (
  bucket_id = 'workspace-snapshots'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.tabplex_cloud_write_allowed((select auth.uid()))
);

drop policy if exists "tabplex_snapshots_update_own" on storage.objects;
create policy "tabplex_snapshots_update_own"
on storage.objects
for update
using (
  bucket_id = 'workspace-snapshots'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.tabplex_cloud_write_allowed((select auth.uid()))
)
with check (
  bucket_id = 'workspace-snapshots'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.tabplex_cloud_write_allowed((select auth.uid()))
);

drop policy if exists "tabplex_snapshots_delete_own" on storage.objects;
create policy "tabplex_snapshots_delete_own"
on storage.objects
for delete
using (
  bucket_id = 'workspace-snapshots'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.tabplex_cloud_write_allowed((select auth.uid()))
);

commit;
