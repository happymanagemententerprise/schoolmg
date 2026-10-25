# Manual Supabase backup recovery runbook

## Backup artifact checked

- File: `%USERPROFILE%\Downloads\happyman-academy-backup.dump`
- Last modified: 24 Oct 2026, 04:16 local time; size: 787,594 bytes.
- The owner confirms the backup came from production project `happyman-academy` (`erlhyrswcqpqpqzbgmgb`) and reports keeping a copy on the laptop and copying it to an external hard drive. The source is owner-confirmed (not encoded in archive metadata); the external drive location and copy integrity have not been independently checked.
- `C:\Program Files\PostgreSQL\17\bin\pg_restore.exe --list` succeeded on 24 Oct (exit code 0): custom-format archive, source PostgreSQL 17.6, created by `pg_dump` 17.11, **1,355 TOC entries**. Full stream extraction to a discarded output stream also exited 0.
- The archive directory lists 58 `public` base tables and 58 table-data entries, 16 public functions, 3 public views, and 180 public policies. These counts match the latest read-only production catalog inventory. Name/count parity does not prove every object definition or row is current. No `auth`, `storage`, or `private` application schema objects are listed.
- A local PostgreSQL 17.11 restore rehearsal completed for the older Oct 22 archive, using a local-only `auth` schema/users stub and synthetic IDs. A restore rehearsal for the Oct 24 archive was attempted, but the Codex Windows sandbox could not launch PostgreSQL (`pg_ctl` restricted-token error); the temporary cluster was removed. The new archive passed listing and full-stream integrity checks, but still needs a restore rehearsal on a local PostgreSQL 17 installation outside this restricted environment. The earlier rehearsal did not restore real Auth identities or other Supabase-managed services.
- The newer archive includes the platform-owner and subscription objects missing from the older dump. See [BACKUP-ARCHIVE-OBJECTS.txt](BACKUP-ARCHIVE-OBJECTS.txt) for the updated inventory.

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

Do not run the restore template until an isolated target is selected and confirmed. The Oct 22 archive had a local restore rehearsal; the newer Oct 24 archive still needs one outside this restricted environment.

## Access prerequisites

- PostgreSQL 17 client tools (`pg_restore`).
- A verified, unmodified backup file and adequate free disk space.
- An explicitly selected empty restore target and its connection details/password.
- Authorized access to the target Supabase dashboard and database.
- A separate plan for Supabase Auth, Storage, Edge Functions, Realtime, secrets, and project configuration if those are required for full service recovery.
