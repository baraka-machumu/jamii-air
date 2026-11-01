// Minimal static landing page for shared links (TRD SH-02): shown when the app is not installed.
// It never shows post or profile content (R1 has nothing public): only an "Open in app" link and
// the store links. English and Swahili side by side; no scripts.

export interface LandingLinks {
  /** jamiiair:// fallback for phones where App Links / Universal Links did not open the app. */
  appUrl: string;
  playStoreUrl: string | null;
  appStoreUrl: string | null;
}

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function landingPage(links: LandingLinks): string {
  const store = [
    links.playStoreUrl && `<a class="store" href="${escape(links.playStoreUrl)}">Google Play</a>`,
    links.appStoreUrl && `<a class="store" href="${escape(links.appStoreUrl)}">App Store</a>`,
  ].filter(Boolean).join('\n      ');
  const install = store
    ? `<p>Don't have the app? · Huna programu?</p>\n      ${store}`
    : `<p>Kidili is in a private pilot. Ask the person who shared this link for an invite.<br>
      Kidili iko katika majaribio ya faragha. Omba mwaliko kwa aliyekutumia kiungo hiki.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Kidili</title>
  <style>
    /* Kidili colours (Design Brief §15.3): cream and purple; the button text flips in dark mode. */
    :root { color-scheme: light dark; --bg: #faf7f2; --fg: #1e1a16; --muted: #6b6259; --accent: #5b2ebf; --on-accent: #ffffff; }
    @media (prefers-color-scheme: dark) { :root { --bg: #14121a; --fg: #f3efe9; --muted: #a9a1b3; --accent: #c9b8f5; --on-accent: #14121a; } }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--fg);
           font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    main { max-width: 360px; padding: 32px 16px; text-align: center; }
    h1 { margin: 0 0 8px; font-size: 28px; font-weight: 900; letter-spacing: 0.5px; color: var(--accent); }
    .mark { width: 56px; height: 56px; }
    p { color: var(--muted); }
    a { display: block; margin: 12px 0; padding: 12px 16px; border-radius: 10px; text-decoration: none; font-weight: 600; }
    .open { background: var(--accent); color: var(--on-accent); }
    .store { border: 1px solid var(--muted); color: var(--fg); }
  </style>
</head>
<body>
  <main>
    <svg class="mark" viewBox="0 0 40 40" aria-hidden="true"><path d="M8 3h24a6 6 0 0 1 6 6v17a6 6 0 0 1-6 6H19l-8 6v-6H8a6 6 0 0 1-6-6V9a6 6 0 0 1 6-6z" fill="#5b2ebf"/><path d="M15 10.5v15M15 19l9-8.5M18.2 16 25 25.5" stroke="#ffffff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
    <h1>KIDILI</h1>
    <p>Someone shared this with you on Kidili.<br>Mtu amekushirikisha hiki kwenye Kidili.</p>
    <a class="open" href="${escape(links.appUrl)}">Open in the app · Fungua kwenye programu</a>
    ${install}
  </main>
</body>
</html>
`;
}
