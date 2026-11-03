-- ============================================================
--  Happy Man Academy — Schedule the edge-function dispatchers
--
--  Schedules the email-digest (daily) and push-dispatch (every minute) edge
--  functions via pg_cron + pg_net. The DB-side jobs (birthday_digest and
--  preclass_push_scan) are already scheduled in 20261026000001; these two
--  call the edge functions that perform the actual send.
--
--  BEFORE RUNNING, replace the placeholders:
--    <YOUR_FUNCTIONS_BASE_URL>  e.g. https://abcdefgh.functions.supabase.co
--    <YOUR_EMAIL_DISPATCH_SECRET>   the EMAIL_DIGEST_SECRET value
--    <YOUR_PUSH_DISPATCH_SECRET>    the PUSH_DISPATCH_SECRET value
--
--  Best-effort: no-ops (with a NOTICE) if pg_cron / pg_net are not installed.
--  Alternatively, configure these via Supabase Dashboard → Cron → Invoke Edge
--  Function, which needs no SQL secrets.
-- ============================================================

DO $schedule$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  CREATE EXTENSION IF NOT EXISTS pg_net;

  PERFORM cron.schedule('hma-email-digest', '5 6 * * *', $job$
    SELECT net.http_post(
      url := 'https://erlhyrswcqpqpqzbgmgb.functions.supabase.co/email-digest',
      headers := '{"Authorization":"Bearer <YOUR_EMAIL_DISPATCH_SECRET>","Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb
    );
  $job$);

  PERFORM cron.schedule('hma-push-dispatch', '* * * * *', $job$
    SELECT net.http_post(
      url := 'https://erlhyrswcqpqpqzbgmgb.functions.supabase.co/push-dispatch',
      headers := '{"Authorization":"Bearer df8fab484cbc4e97bacdec40647cdd19","Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb
    );
  $job$);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'dispatch scheduling skipped: %', SQLERRM;
END;
$schedule$;
