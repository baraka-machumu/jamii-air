// KPI events (TRD PA-01, task 3.12.b). Ten events, nothing else:
//   app_open · signup · login · post_created · like · comment · follow · profile_view
//   · share_tapped · upload_failed
//
// They go straight to PostHog's capture endpoint over HTTPS. There is no PostHog SDK here on
// purpose: the SDK needs three native modules for things this app does not use (session replay,
// device properties, autocapture), and the whole of PA-01 is one POST of a JSON batch.
//
// Off unless EXPO_PUBLIC_POSTHOG_KEY is set, which it is not in development (same as Sentry,
// task 2.16): track() then costs nothing and nothing leaves the phone. The KPIs the pilot is
// judged on are computed in the database anyway (fn_maint_compute_daily_metrics, PA-02); these
// events are the product-side cross-check (Plan 5.5).
//
// Identity: the signed-in user's id, else this installation's id (made on the phone, task 3.10).
// No other person-level data is ever attached - no email, no username, no photo, no caption text
// (PA-01: "User ID only, no other PII").
import { getInstallationId } from '@/notifications/installation';

export type KpiEvent =
  | 'app_open' | 'signup' | 'login' | 'post_created' | 'like'
  | 'comment' | 'follow' | 'profile_view' | 'share_tapped' | 'upload_failed';

/** Only these keys may travel: counts and codes, never anything that identifies a person. */
export interface KpiProps {
  /** For upload_failed: the API error code or the step that failed. */
  reason?: string;
  /** For share_tapped: where the share came from. */
  from?: 'post' | 'profile';
  /** For post_created: what was posted (BR-CT-07/09), to see how the pilot uses carousels and video. */
  kind?: 'photo' | 'video';
  /** For post_created: how many files the post holds (1 for a video). */
  media?: number;
}

const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const HOST = (process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com').replace(/\/+$/, '');

/** Events wait this long for company, so a burst of likes is one request. */
export const FLUSH_AFTER_MS = 5_000;
const MAX_BATCH = 20;

interface Captured {
  event: KpiEvent;
  /** null until flush fills in this installation's id: nobody was signed in when it happened. */
  distinct_id: string | null;
  properties: KpiProps;
  timestamp: string;
}

let queue: Captured[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let userId: string | null = null;

/** The signed-in user's id; null again on sign-out, which also drops anything not yet sent. */
export function identify(id: string | null): void {
  if (id === userId) return;
  userId = id;
  if (!id) {
    queue = [];
    if (timer) { clearTimeout(timer); timer = null; }
  }
}

/**
 * Queue an event. Synchronous on purpose: reading the installation id is a promise, and awaiting it
 * here would mean an event fired just before a flush (or just before the app is backgrounded)
 * landed in the queue after the batch had gone. Events with nobody signed in carry no id yet;
 * flush fills them in, once, just before sending.
 */
export function track(event: KpiEvent, properties: KpiProps = {}): void {
  if (!KEY) return;
  queue.push({ event, distinct_id: userId, properties, timestamp: new Date().toISOString() });
  if (queue.length >= MAX_BATCH) { void flush(); return; }
  timer ??= setTimeout(() => { void flush(); }, FLUSH_AFTER_MS);
}

/** Send what is queued. Failures are dropped, never retried: a KPI event is not worth a retry
 * loop on a phone paying for data, and the database holds the numbers that matter. */
export async function flush(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!KEY || queue.length === 0) return;
  const batch = queue;
  queue = [];
  const installation = batch.some((e) => !e.distinct_id)
    ? await getInstallationId().catch(() => null) ?? 'unknown'
    : '';
  for (const event of batch) event.distinct_id ??= installation;
  try {
    await fetch(`${HOST}/batch/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: KEY, batch }),
    });
  } catch {
    // offline, or PostHog unreachable
  }
}

/** Test helper. */
export function resetAnalytics(): void {
  queue = [];
  userId = null;
  if (timer) { clearTimeout(timer); timer = null; }
}

export const analyticsEnabled = !!KEY;
