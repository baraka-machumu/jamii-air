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
    : `<p>Jamii Air is in a private pilot. Ask the person who shared this link for an invite.<br>
      Jamii Air iko katika majaribio ya faragha. Omba mwaliko kwa aliyekutumia kiungo hiki.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Jamii Air</title>
  <style>
    :root { color-scheme: light dark; --bg: #ffffff; --fg: #1a1a1a; --muted: #666666; --accent: #0b7a5a; }
    @media (prefers-color-scheme: dark) { :root { --bg: #111111; --fg: #f2f2f2; --muted: #a0a0a0; --accent: #3fc79a; } }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--fg);
           font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    main { max-width: 360px; padding: 32px 16px; text-align: center; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    p { color: var(--muted); }
    a { display: block; margin: 12px 0; padding: 12px 16px; border-radius: 10px; text-decoration: none; font-weight: 600; }
    .open { background: var(--accent); color: #ffffff; }
    .store { border: 1px solid var(--muted); color: var(--fg); }
  </style>
</head>
<body>
  <main>
    <h1>Jamii Air</h1>
    <p>Someone shared this with you on Jamii Air.<br>Mtu amekushirikisha hiki kwenye Jamii Air.</p>
    <a class="open" href="${escape(links.appUrl)}">Open in the app · Fungua kwenye programu</a>
    ${install}
  </main>
</body>
</html>
`;
}
