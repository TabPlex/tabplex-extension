-- TabPlex OSS sync hardening
-- Adds defensive constraints for snapshot path integrity and crypto row consistency.
--
-- IMPORTANT:
-- 1) Run preflight queries from supabase/README.md first.
-- 2) This migration adds constraints as NOT VALID to avoid blocking on existing data.
-- 3) Validate constraints after data cleanup.

-- ---------------------------------------------------------------------------
-- workspaces constraints
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tabplex_workspaces_snapshot_path_user_chk'
      and conrelid = 'public.workspaces'::regclass
  ) then
    alter table public.workspaces
      add constraint tabplex_workspaces_snapshot_path_user_chk
      check (split_part(snapshot_path, '/', 1) = user_id::text)
      not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tabplex_workspaces_snapshot_path_workspace_chk'
      and conrelid = 'public.workspaces'::regclass
  ) then
    alter table public.workspaces
      add constraint tabplex_workspaces_snapshot_path_workspace_chk
      check (split_part(snapshot_path, '/', 2) = workspace_id::text)
      not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tabplex_workspaces_version_non_negative_chk'
      and conrelid = 'public.workspaces'::regclass
  ) then
    alter table public.workspaces
      add constraint tabplex_workspaces_version_non_negative_chk
      check (version >= 0)
      not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tabplex_workspaces_snapshot_size_non_negative_chk'
      and conrelid = 'public.workspaces'::regclass
  ) then
    alter table public.workspaces
      add constraint tabplex_workspaces_snapshot_size_non_negative_chk
      check (snapshot_size is null or snapshot_size >= 0)
      not valid;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- user_crypto_v2 constraints
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tabplex_user_crypto_v2_key_version_chk'
      and conrelid = 'public.user_crypto_v2'::regclass
  ) then
    alter table public.user_crypto_v2
      add constraint tabplex_user_crypto_v2_key_version_chk
      check (key_version >= 1)
      not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tabplex_user_crypto_v2_cloud_mode_dek_chk'
      and conrelid = 'public.user_crypto_v2'::regclass
  ) then
    alter table public.user_crypto_v2
      add constraint tabplex_user_crypto_v2_cloud_mode_dek_chk
      check ((mode <> 'cloud-managed') or dek_b64 is not null)
      not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tabplex_user_crypto_v2_local_mode_material_chk'
      and conrelid = 'public.user_crypto_v2'::regclass
  ) then
    alter table public.user_crypto_v2
      add constraint tabplex_user_crypto_v2_local_mode_material_chk
      check (
        (mode <> 'local-passphrase')
        or (dek_b64 is null and key_check_b64 is not null)
      )
      not valid;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Validation (run only after preflight counts are 0)
-- ---------------------------------------------------------------------------
-- alter table public.workspaces validate constraint tabplex_workspaces_snapshot_path_user_chk;
-- alter table public.workspaces validate constraint tabplex_workspaces_snapshot_path_workspace_chk;
-- alter table public.workspaces validate constraint tabplex_workspaces_version_non_negative_chk;
-- alter table public.workspaces validate constraint tabplex_workspaces_snapshot_size_non_negative_chk;
-- alter table public.user_crypto_v2 validate constraint tabplex_user_crypto_v2_key_version_chk;
-- alter table public.user_crypto_v2 validate constraint tabplex_user_crypto_v2_cloud_mode_dek_chk;
-- alter table public.user_crypto_v2 validate constraint tabplex_user_crypto_v2_local_mode_material_chk;
