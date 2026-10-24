# Manual Supabase backup recovery runbook

## Backup artifact checked

- File: `%USERPROFILE%\Downloads\happyman-academy-backup.dump`
- Last modified: 22 Oct 2026, 03:22 local time; size: 283,750 bytes.
- The owner confirms the backup came from production project `happyman-academy` (`erlhyrswcqpqpqzbgmgb`) and reports keeping a copy on the laptop and copying it to an external hard drive. The source is owner-confirmed (not encoded in archive metadata); the external drive location and copy integrity have not been independently checked.
- `C:\Program Files\PostgreSQL\17\bin\pg_restore.exe --list` succeeded (exit code 0): custom-format archive, source PostgreSQL 17.6, created by `pg_dump` 17.11, **668 archive entries** (latest inspection; supersedes the earlier 662 count). Full stream extraction to a discarded output stream also exited 0.
- The archive directory lists 53 `public` base tables and 53 table-data entries, 15 public functions, 1 public view (`class_subjects`), 123 public policies, and 47 public sequence values. No `auth`, `storage`, or `private` application schema objects are listed.
- The owner confirms the backup came from production. The shared live production inventory also records 53 public tables, 15 routines, and 123 policies, and identifies the `class_subjects` view. These counts and the known view name align. However, that shared inventory contains aggregate counts, not full table/function/policy name sets; an exact name-by-name comparison remains pending. The archive's exact names are in [BACKUP-ARCHIVE-OBJECTS.txt](BACKUP-ARCHIVE-OBJECTS.txt).

## Safe restore rehearsal

1. Keep the source backup unchanged and make a second copy before any restore attempt.
2. Use a separate, empty, disposable Supabase project or an isolated local PostgreSQL instance. Do not use the production project, and do not restore over a staging project that contains data you need.
3. Confirm the target PostgreSQL major version is compatible (the archive was made from PostgreSQL 17.6) and configure any required extensions before restoring.
4. From the target project's **Connect** panel, use its database connection details. Keep the password out of commands, source files, screenshots, and chat; let `pg_restore --password` prompt for it.
5. First inspect the archive again with `pg_restore --list`. Then restore only to the confirmed isolated target, with `--no-owner --no-acl`. Do not add `--clean` or `--if-exists` to a non-empty database.
6. Capture the restore output and resolve errors before relying on the copy. Verify expected public tables, row counts, sequences, functions, and policies; then test application login and role-scoped reads in the isolated environment.
7. Remember the inspected artifact contains public-schema objects only. It does not demonstrate recovery of Auth identities, Storage objects, Edge Functions, project settings, or other Supabase-managed services. Back those up or recreate them separately as needed.

Example read-only archive inspection in PowerShell:

```powershell
$dump = Join-Path $env:USERPROFILE 'Downloads\happyman-academy-backup.dump'
& 'C:\Program Files\PostgreSQL\17\bin\pg_restore.exe' --list $dump
```

Restore command template for an empty, isolated PostgreSQL 17 target (replace `<TARGET_HOST>` only with the host shown by that target project's Connect panel):

```powershell
$dump = Join-Path $env:USERPROFILE 'Downloads\happyman-academy-backup.dump'
& 'C:\Program Files\PostgreSQL\17\bin\pg_restore.exe' `
  --verbose --no-owner --no-acl `
  --dbname "host=<TARGET_HOST> port=5432 dbname=postgres user=postgres sslmode=require" `
  --password $dump
```

Do not run the restore template until an isolated target is selected and confirmed. This runbook records a safe rehearsal plan; no restore has been performed.

## Access prerequisites

- PostgreSQL 17 client tools (`pg_restore`).
- A verified, unmodified backup file and adequate free disk space.
- An explicitly selected empty restore target and its connection details/password.
- Authorized access to the target Supabase dashboard and database.
- A separate plan for Supabase Auth, Storage, Edge Functions, Realtime, secrets, and project configuration if those are required for full service recovery.
