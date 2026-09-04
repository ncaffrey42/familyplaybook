-- Pin search_path on the last 7 SECURITY DEFINER functions that lack it.
--
-- A SECURITY DEFINER function runs with its owner's privileges. If it does
-- not pin search_path, the CALLER controls schema resolution: a caller who
-- can create objects in a schema earlier on their search_path can shadow an
-- unqualified name the body relies on (a table, or an operator) and have it
-- executed as the definer. That is the standard Postgres privilege-
-- escalation shape, and it is why the other 31 definer functions in this
-- repo already carry `SET search_path = public`.
--
-- These 7 were defined in schema.sql before the convention existed and were
-- never revisited, so they are the stragglers rather than a new mistake.
-- Three of them are the ones worth caring about most:
--   handle_new_user / handle_new_user_subscription / handle_new_subscription_usage
--     run as triggers on signup — attacker-adjacent by definition
--   increment_usage         is billing-adjacent (entitlement counters)
--   reset_user_account      is destructive
--
-- ALTER FUNCTION rather than CREATE OR REPLACE: pinning the setting does not
-- require restating the body, so this migration cannot silently change
-- behaviour or drift from whatever schema.sql currently says.
--
-- Idempotent: ALTER ... SET is a no-op if the value is already set, and each
-- statement is guarded so a missing function does not abort the migration
-- (the host-vertical functions may not exist on every environment).

DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'public.get_pack_guide_counts(uuid)',
    'public.handle_new_subscription_usage()',
    'public.handle_new_user()',
    'public.handle_new_user_subscription()',
    'public.increment_usage(uuid, text, bigint)',
    'public.recalculate_usage_stats(uuid)',
    'public.reset_user_account()'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public', fn);
      RAISE NOTICE 'pinned search_path on %', fn;
    EXCEPTION
      WHEN undefined_function THEN
        RAISE NOTICE 'skipped (not present in this database): %', fn;
    END;
  END LOOP;
END $$;
