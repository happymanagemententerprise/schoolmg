# Campus API Edge Function

This function keeps the existing `/api/*` paths used by the frontend, validates each user access
token with Supabase Auth, and loads the user's school role from `public.users`. The service key is
used only inside the function.

## Deploy

From the repository root, after installing and linking the Supabase CLI:

```sh
supabase functions deploy campus-api --project-ref erlhyrswcqpqpqzbgmgb
```

In Supabase Dashboard → Edge Functions → Secrets, set `FRONTEND_ORIGINS` to the exact Cloudflare
Pages origin, `SCHOOL_TIMEZONE=Africa/Lagos`, and a long random `CAMPUS_SCHEDULER_SECRET`. Set
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` to enable push. Set
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` only if parent SMS is enabled.
Supabase supplies the project URL and service-role key to hosted Edge Functions. Never add private
values to Cloudflare Pages build variables.

Set the Cloudflare Pages build variable `VITE_CAMPUS_API_URL` to
`https://<project-ref>.supabase.co/functions/v1/campus-api`.

## Scheduler

Run [`supabase/scheduler_setup.sql`](../../scheduler_setup.sql) in the Supabase SQL Editor after
enabling `pg_cron`, `pg_net`, and Vault. Store `campus_scheduler_url` and
`CAMPUS_SCHEDULER_SECRET` in Vault; the latter must match the Edge Function secret exactly. The SQL
installs an idempotent once-per-minute Cron job that POSTs to
`/functions/v1/campus-api/internal/scheduler/tick`. Keep the token in Supabase's server-side
settings; do not put it in Pages.

The function-level JWT gateway check is disabled in `supabase/config.toml` because this handler
validates end-user JWTs itself and the scheduler uses its own secret. Every protected `/api/*`
route still validates the Supabase session and checks the database role.
