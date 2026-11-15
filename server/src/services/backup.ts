// Database backups are handled by the managed PostgreSQL server (scheduled
// dumps / point-in-time recovery by IT), so the application no longer takes its
// own snapshots. This module keeps the previous `backupDatabase` signature so
// callers don't need to change; it is now a no-op that simply logs intent.
export async function backupDatabase(reason: string): Promise<void> {
  console.log(
    `[backup] skipped (${reason}); PostgreSQL backups are managed by the database server.`
  );
}
