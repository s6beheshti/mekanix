// Sync Engine — processes the offline queue when internet is available.
// Tries to send each queued action, removes on success, retries on failure.

import { getQueuedActions, dequeueAction, incrementRetry, getQueueSize } from "./offline-queue";

let syncing = false;

export async function syncQueue(): Promise<{ synced: number; failed: number; remaining: number }> {
  if (typeof window === "undefined") return { synced: 0, failed: 0, remaining: 0 };
  if (syncing) return { synced: 0, failed: 0, remaining: getQueueSize() };
  if (!navigator.onLine) return { synced: 0, failed: 0, remaining: getQueueSize() };

  syncing = true;
  let synced = 0;
  let failed = 0;
  const queue = getQueuedActions();

  for (const action of queue) {
    try {
      const res = await fetch(action.url, {
        method: action.method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: action.body ? JSON.stringify(action.body) : undefined,
      });

      if (res.ok) {
        dequeueAction(action.id);
        synced++;
      } else if (res.status >= 400 && res.status < 500) {
        // Client error — don't retry, just remove
        dequeueAction(action.id);
        failed++;
      } else {
        // Server error — retry
        const stillQueued = incrementRetry(action.id);
        if (!stillQueued) failed++;
      }
    } catch {
      // Network error — retry
      const stillQueued = incrementRetry(action.id);
      if (!stillQueued) failed++;
    }
  }

  syncing = false;
  return { synced, failed, remaining: getQueueSize() };
}

// Auto-sync when coming online
export function initAutoSync(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("online", () => {
    syncQueue();
  });
  // Also try syncing every 30 seconds if online
  setInterval(() => {
    if (navigator.onLine && getQueueSize() > 0) {
      syncQueue();
    }
  }, 30000);
}
