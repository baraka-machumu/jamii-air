// Rendering a route the way the app does: one query client per test (no state shared between
// them) and a memory router, so tests can start on any path.
import { QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { createQueryClient } from '@/api/queryClient';

export function renderAt(ui: ReactNode, path = '/'): RenderResult {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}
