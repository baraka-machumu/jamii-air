// A stubbed API for screen tests: every fetch goes to `handler`, and each request is recorded.
export interface StubRequest {
  url: string;
  path: string;
  method: string;
  body: Record<string, unknown>;
}

export const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const apiError = (status: number, code: string, details?: object) =>
  json(status, { error: { code, message: code, details } });

export function stubApi(handler: (req: StubRequest) => Response | Promise<Response>): StubRequest[] {
  const requests: StubRequest[] = [];
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const req = {
      url,
      path: url.replace(/^https?:\/\/[^/]+/, '').split('?')[0]!,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {},
    };
    requests.push(req);
    return handler(req);
  }) as unknown as typeof fetch;
  return requests;
}

export const me = {
  id: 'u1', username: 'amina', email: 'amina@example.com', displayName: 'Amina', bio: 'Mama Lishe, Arusha',
  avatarMediaId: null, avatarUrl: null, avatarLargeUrl: null, locale: 'en' as const,
  postCount: 12, followerCount: 1250, followingCount: 80,
};
