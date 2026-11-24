import { QueryClient } from '@tanstack/react-query';

// 前回の表示は残したまま裏で取り直す（gcTime を長めに）。
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 20_000, gcTime: 24 * 60 * 60 * 1000, retry: 1 },
  },
});
