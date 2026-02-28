import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

export const queryPersister = createSyncStoragePersister({
  storage: typeof window !== "undefined" ? window.localStorage : undefined,
});
