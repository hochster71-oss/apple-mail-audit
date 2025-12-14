export async function register() {
  // Disabled for development - scheduler causes worker thread errors in Next.js dev mode
  // Use Docker container for production scheduling, or run demo:ingest script manually
  // if (process.env.NEXT_RUNTIME === "nodejs") {
  //   const { startIcloudSyncScheduler } = await import("./lib/icloudSyncScheduler");
  //   startIcloudSyncScheduler();
  // }
}
