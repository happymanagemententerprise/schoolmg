-- Run in the Supabase SQL Editor after enabling pg_cron, pg_net, and Vault.
-- Create/update these Vault secrets first:
--   campus_scheduler_url    = https://erlhyrswcqpqpqzbgmgb.supabase.co
--   CAMPUS_SCHEDULER_SECRET = the same value configured as the Edge Function secret

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'campus_scheduler_url') then
    raise exception 'Missing Vault secret: campus_scheduler_url';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'CAMPUS_SCHEDULER_SECRET') then
    raise exception 'Missing Vault secret: CAMPUS_SCHEDULER_SECRET';
  end if;
end;
$$;

select cron.unschedule(jobid)
from cron.job
where jobname = 'campus-scheduler-tick';

select cron.schedule(
  'campus-scheduler-tick',
  '* * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'campus_scheduler_url')
        || '/functions/v1/campus-api/internal/scheduler/tick',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'CAMPUS_SCHEDULER_SECRET')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    );
  $$
);
