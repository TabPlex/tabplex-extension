-- RETIRED: unsafe pre-login subscription gate
--
-- The extension currently has no Supabase Auth, OTP, entitlement consumer, or
-- cloud-sync runtime. The previous version of this file created a
-- SECURITY DEFINER RPC that accepted an arbitrary email address and granted
-- EXECUTE to anon. That design allowed account/entitlement probing before
-- authentication and must not be restored.
--
-- This tombstone is intentionally safe to run on both a clean database and a
-- database where the legacy function was installed. Existing installations
-- should also run 007_retire_unsafe_entitlement_rpc.sql as the forward cleanup.
--
-- Future OTP contract:
-- - require an authenticated Supabase JWT;
-- - derive the email only from auth.jwt() ->> 'email';
-- - expose a zero-argument self-only entitlement RPC;
-- - never accept an email address supplied by the caller;
-- - never grant entitlement RPC execution to anon.

begin;

do $$
begin
  if to_regprocedure(
    'public.tabplex_check_subscription_eligibility(text)'
  ) is not null then
    execute $revoke$
      revoke all on function
        public.tabplex_check_subscription_eligibility(text)
      from public, anon, authenticated
    $revoke$;
  end if;
end
$$;

drop function if exists public.tabplex_check_subscription_eligibility(text);
drop table if exists public.subscription_gate_log;

commit;
