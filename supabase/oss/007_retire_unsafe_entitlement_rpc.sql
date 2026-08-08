-- Forward cleanup for databases that previously ran legacy entitlement SQL.
--
-- The current extension has no Auth, entitlement consumer, or cloud-sync
-- runtime. This migration therefore disables every legacy entitlement entry
-- point. It deliberately commits the privilege revocation before attempting
-- object deletion, so schema drift cannot roll the security fix back.

begin;

do $$
begin
  if to_regprocedure(
    'public.tabplex_check_subscription_eligibility(text)'
  ) is not null then
    execute $revoke_email_rpc$
      revoke all on function
        public.tabplex_check_subscription_eligibility(text)
      from public, anon, authenticated
    $revoke_email_rpc$;
  end if;

  if to_regprocedure('public.tabplex_cloud_write_allowed(uuid)') is not null then
    execute $revoke_write_helper$
      revoke all on function public.tabplex_cloud_write_allowed(uuid)
      from public, anon, authenticated
    $revoke_write_helper$;
  end if;

  if to_regprocedure('public.tabplex_get_cloud_sync_access()') is not null then
    execute $revoke_access_rpc$
      revoke all on function public.tabplex_get_cloud_sync_access()
      from public, anon, authenticated
    $revoke_access_rpc$;
  end if;
end
$$;

commit;

-- Cleanup is intentionally separate from revocation. If a deployed database
-- has an unexpected dependency, the functions remain inaccessible.
begin;
drop function if exists public.tabplex_check_subscription_eligibility(text);
commit;

begin;
drop table if exists public.subscription_gate_log;
commit;
