import { startIcloudSyncScheduler } from "./lib/icloudSyncScheduler";

export async function register() {
  startIcloudSyncScheduler();
}
