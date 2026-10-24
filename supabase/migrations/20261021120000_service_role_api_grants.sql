-- The project has automatic Data API exposure/grants disabled. Grant only
-- the access required by the staging Auth provisioning script: read demo
-- profile rows and link each profile to its Auth identity. Do not use a broad
-- ALL TABLES grant here; this avoids widening backend privileges by default.

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT ON public.users TO service_role;
GRANT UPDATE (auth_user_id) ON public.users TO service_role;
