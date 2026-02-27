"use client";

import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { QueryClient } from "@tanstack/react-query";
import { queryPersister } from "@/lib/query-persist";
import { useState } from "react";

export function DashboardQueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            gcTime: 24 * 60 * 60 * 1000,
            staleTime: 5 * 60 * 1000,
            networkMode: "offlineFirst",
          },
        },
      }),
  );

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: queryPersister, maxAge: 24 * 60 * 60 * 1000 }}
      onSuccess={() => queryClient.resumePausedMutations()}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
