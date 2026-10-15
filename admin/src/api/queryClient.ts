// Server state (Plan 4.1). The portal reads moderation data that changes while an admin works, so
// queries are short-lived and refetched when the tab regains focus; a failed request is not
// retried, because the client already refreshes a dead session and retries that request once.
import { QueryClient } from '@tanstack/react-query';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: false,
      },
      mutations: { retry: false },
    },
  });
}

export const queryClient = createQueryClient();
