# Legacy Supabase assets (inactive)

The current extension does **not** ship a Supabase client, Auth/OTP flow,
entitlement consumer, or cloud-sync runtime. Files in `supabase/oss` are retained
only as inactive schema history and are not a production setup guide.

## Entitlement security contract

`005_subscription_gate.sql` is retired. Its former
`tabplex_check_subscription_eligibility(target_email text)` function accepted a
caller-supplied email before login and granted `EXECUTE` to `anon`; that trust
boundary is forbidden.

Any future OTP implementation must satisfy all of these rules:

1. Require an authenticated Supabase JWT and a non-null `auth.uid()`.
2. Derive the current email only from `auth.jwt() ->> 'email'`.
3. Expose only a zero-argument, self-only entitlement status RPC.
4. Reject caller-supplied email and cross-user identifiers.
5. Revoke function execution from `public` and `anon`; grant only the minimum
   function to `authenticated`.
6. Keep `SECURITY DEFINER` functions on an empty `search_path` and fully qualify
   referenced objects.

For a database that previously ran the legacy scripts, apply
`007_retire_unsafe_entitlement_rpc.sql`. It removes the email-parameter RPC and
its rate-limit table, then revokes every legacy entitlement helper from
`public`, `anon`, and `authenticated`. A future cloud implementation must add a
new migration rather than re-enabling these legacy entry points.

Verify the deployed database after cleanup:

```sql
select
  to_regprocedure(
    'public.tabplex_check_subscription_eligibility(text)'
  ) is null as legacy_email_rpc_removed;

select coalesce(
  has_function_privilege(
    'anon',
    to_regprocedure('public.tabplex_cloud_write_allowed(uuid)'),
    'EXECUTE'
  ),
  false
) as anon_can_execute_write_helper;

select coalesce(
  has_function_privilege(
    'anon',
    to_regprocedure('public.tabplex_get_cloud_sync_access()'),
    'EXECUTE'
  ),
  false
) as anon_can_execute_access_rpc;

select coalesce(
  has_function_privilege(
    'authenticated',
    to_regprocedure('public.tabplex_get_cloud_sync_access()'),
    'EXECUTE'
  ),
  false
) as authenticated_can_execute_legacy_access_rpc;
```

Expected results: `legacy_email_rpc_removed = true`; all execute checks are
`false`.
