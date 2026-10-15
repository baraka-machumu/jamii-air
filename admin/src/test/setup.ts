import { configure } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Testing Library waits one second by default. These tests render whole routes behind a stubbed
// API, and several files run in parallel, so a slow machine (or CI) can exceed that and fail a
// test that is merely slow. Five seconds still fails fast when something is actually broken.
configure({ asyncUtilTimeout: 5_000 });
