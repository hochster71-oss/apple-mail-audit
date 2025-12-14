import { env } from "./env";
import { log } from "./log";
import { runIcloudSyncIfEnabled } from "./icloudSync";

const logger = log.child({ module: "icloud-sync-scheduler" });

let started = false;

export function startIcloudSyncScheduler() {
  if (started) return;
  started = true;

  const intervalMs = Math.max(env.ICLOUD_SYNC_INTERVAL_MINUTES, 5) * 60 * 1000;

  // Kick once on boot after a short delay to let the app warm up.
  setTimeout(() => {
    logger.info("icloud_sync_initial_run_starting");
    runIcloudSyncIfEnabled()
      .then(() => logger.info("icloud_sync_initial_run_complete"))
      .catch((e) => logger.warn({ err: e?.message ?? String(e) }, "icloud_sync_initial_fail"));
  }, 5_000);

  setInterval(() => {
    logger.info("icloud_sync_interval_run_starting");
    runIcloudSyncIfEnabled()
      .then(() => logger.info("icloud_sync_interval_run_complete"))
      .catch((e) => logger.warn({ err: e?.message ?? String(e) }, "icloud_sync_interval_fail"));
  }, intervalMs);

  logger.info({ intervalMs }, "icloud_sync_scheduler_started");
}
