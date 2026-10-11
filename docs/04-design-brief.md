# Jamii Air — Design Brief

| | |
|---|---|
| **Document** | 04 — Design Brief |
| **Version** | 1.2 (designs delivered and approved on a Claude design canvas, §12) |
| **Status** | **Approved** — 2026-10-11 |
| **Date** | 2026-10-09 |
| **For** | Whoever produces the designs (the engineer with Claude Code until a designer joins — D-11), mobile and web engineers |
| **Related** | [01 BRS](01-business-requirements-specification.md) · [03 App Flow](03-app-flow-document.md) |

---

## 1. Project summary

Jamii Air is a mobile app for sharing photos (and, from Release 2, short videos) with friends and community. The app is for adults (18+). The pilot is 10 invited users in East Africa; the design must already feel like a finished, trustworthy product and scale to thousands of users without a redesign.

**The design job:** create a brand identity and a mobile UI system (plus light-touch wireframes for the separate admin web portal, §13) that makes Jamii Air feel *warm, local and light* — while being as fast and familiar to use as the social apps people already know.

## 2. Brand

### 2.1 Name & meaning

- **Jamii** — Swahili for *community*. The product is about people, not content for its own sake.
- **Air** — lightness, openness, being "on air"; also a promise of a *light* app that respects data bundles and older phones.

### 2.2 Personality

| We are | We are not |
|---|---|
| Warm, friendly, communal | Corporate, cold |
| Light, fast, uncluttered | Heavy, busy, ad-like |
| Proudly East African, quietly so | Stereotyped "safari" or flag-colour clichés |
| Expressive through *people's photos* | Expressive through loud chrome that competes with photos |
| Safe and respectful | Edgy or provocative |

### 2.3 Brand line (working)

*"Your people, on air."* / *"Jamii yako, hewani."* — to be validated with pilot users.

## 3. Design principles

1. **Content first.** Photos are the hero. UI chrome is neutral and recedes; brand colour is used sparingly for actions and moments of delight.
2. **Familiar over novel.** Use patterns users already know (bottom tabs, double-tap to like, pull-to-refresh). Innovate in tone and warmth, not in navigation.
3. **Light on data, light on device.** No decorative images, video backgrounds or heavy custom fonts. Every asset must justify its bytes.
4. **Calm feedback.** Every action responds instantly (optimistic UI) with subtle motion; errors are gentle and always offer a next step.
5. **Bilingual by design.** Every layout must work in English *and* Swahili (Swahili strings are often 20–40 % longer).
6. **Accessible by default.** Contrast, touch targets and font scaling are requirements, not polish.

## 4. Visual direction

### 4.1 Colour

Inspired by East African sunset light: a warm terracotta-orange primary, a deep evening indigo, and a lake-teal accent — on clean neutrals so photos stay true.

All text/background pairs below have been checked for **WCAG 2.1 AA (≥ 4.5 : 1)**.

| Token | Light mode | Dark mode | Use | Contrast |
|---|---|---|---|---|
| `color.bg` | `#FFFFFF` | `#0E0E12` | Screen background | — |
| `color.surface` | `#F3F4F6` | `#18181F` | Cards, inputs, sheets | — |
| `color.text` | `#111827` | `#F3F4F6` | Primary text | 17.7 / 17.5 |
| `color.textMuted` | `#6B7280` | `#9CA3AF` | Timestamps, secondary | 4.8 / 7.6 |
| `color.primary` | `#C2410C` *(Jamii Terracotta)* | `#FF7A45` | Primary buttons, links, active tab | white on light 5.2 · dark text on dark 7.5 |
| `color.onPrimary` | `#FFFFFF` | `#0E0E12` | Text on primary | — |
| `color.brandDeep` | `#1E1B4B` *(Evening Indigo)* | `#1E1B4B` | Splash, logo, onboarding headers | white on it 16.0 |
| `color.accent` | `#0F766E` *(Lake Teal)* | `#2DD4BF` | "Following" state, success highlights | 5.5 / 10.4 |
| `color.like` | `#E11D48` | `#FB7185` | Liked heart only | 4.7 / 7.2 |
| `color.danger` | `#B91C1C` | `#F87171` | Destructive actions, errors | 6.5 / 7.0 |
| `color.success` | `#15803D` | `#4ADE80` | Confirmations | 5.0 / 11.1 |
| `color.border` | `#E5E7EB` | `#2A2A33` | Dividers, input borders | non-text |

Rules: brand orange is **never** used as a large background behind photos; the like-red is reserved for the like state; no gradients on core UI (a brand gradient Indigo → Terracotta is allowed on splash/onboarding only).

### 4.2 Typography

- **UI:** platform system fonts — Roboto (Android), SF Pro (iOS). Zero download cost, best rendering, best Dynamic Type support.
- **Brand display (logo & onboarding headlines only):** one geometric, rounded display face with full Latin coverage (designer to propose, e.g. a rounded sans). Must be licensed for app embedding; ≤ 1 weight.

| Token | Size / line height | Weight | Use |
|---|---|---|---|
| `type.display` | 28 / 34 | Bold | Onboarding titles |
| `type.title` | 20 / 26 | Semibold | Screen titles, profile name |
| `type.body` | 15 / 21 | Regular | Captions, comments |
| `type.bodyStrong` | 15 / 21 | Semibold | Usernames |
| `type.caption` | 13 / 18 | Regular | Timestamps, counts, helper text |
| `type.button` | 15 / 20 | Semibold | Buttons |

All sizes scale with OS font settings up to 200 % without truncating critical actions.

### 4.3 Spacing, shape, elevation

- 4-pt base grid; common steps 4 · 8 · 12 · 16 · 24 · 32. Screen side padding 16.
- Radius: 8 (inputs, small cards) · 12 (sheets, dialogs) · full (avatars, pills). **Photos in the feed are full-bleed with 0 radius**; grid thumbnails 0 radius with 2-pt gaps.
- Elevation: flat UI; separation by surface colour and hairline borders. Shadows only on bottom sheets and toasts.

### 4.4 Iconography

Outline icon set at 24 pt with 1.75–2 pt stroke (e.g. Lucide or Phosphor — open-source, consistent). Filled variant only for active states (active tab, liked heart). Custom icons limited to the logo and the like animation.

### 4.5 Logo

Deliver: app icon (Android adaptive + iOS), monochrome notification icon (Android requires a white silhouette), wordmark, splash. Idea space: a speech/air bubble formed by people or a circle of connected dots ("community"), using Indigo + Terracotta. Must be recognisable at 24 px and in monochrome.

### 4.6 Imagery & illustration

Empty states and onboarding use a small set of simple, flat, warm illustrations featuring diverse East African people — vector (SVG), each < 15 KB. No stock photography in the UI.

## 5. Motion

| Moment | Motion | Duration |
|---|---|---|
| Like (double-tap) | Heart scales 0 → 1.2 → 1 over photo, fades out | 600 ms |
| Like (button) | Heart bounce + fill colour change | 250 ms |
| Follow → Following | Button morph + colour change to accent | 200 ms |
| Screen transitions | Platform-native stack transitions | native |
| Skeleton shimmer | Subtle, low-contrast | 1.2 s loop |
| Toasts | Slide/fade from top | 200 ms |

All animations run on the UI thread (Reanimated) and respect the OS "Reduce motion" setting (replace with fades).

## 6. Component inventory (R1)

Designer to deliver each in light/dark, default/pressed/disabled/loading/error states where relevant.

| Group | Components |
|---|---|
| Foundations | Colour tokens, type scale, spacing, icons, elevation |
| Inputs | Text field (with error/helper), password field (show/hide), search field, multiline caption/comment input with counter, checkbox |
| Buttons | Primary, secondary (outline), tertiary (text), destructive, icon button, Follow/Following toggle |
| Identity | Avatar (24/32/40/56/88 pt, with placeholder initials), username + display name block |
| Content | **Post card** (header, media with blurhash placeholder, action bar, counts, caption, comments link, time), grid thumbnail, comment row, notification row (like/comment/follow variants), user list row |
| Feedback | Skeletons (post card, grid, list row), toast, inline error, empty state, offline banner, upload-progress card ("Posting… / Processing… / Couldn't post · Retry") |
| Overlays | Bottom action sheet (⋯ menu), report reason sheet, confirm dialog, full-screen image viewer |
| Navigation | Bottom tab bar with badge, header bar, back button |

## 7. Screen list (R1)

Flows and states are specified in the [App Flow Document](03-app-flow-document.md); designs must cover the loading, empty, error and offline states listed there.

1. Splash · 2. Welcome · 3. Sign up · 4. Log in · 5. Forgot password · 6. Onboarding ×3 · 7. Home feed · 8. Post detail · 9. Comments · 10. Create: picker, crop, caption · 11. Search · 12. User profile · 13. My profile · 14. Edit profile · 15. Followers/Following · 16. Activity · 17. Settings · 18. Blocked accounts · 19. Delete account · 20. Report sheet · 21. Update-required screen · 22. Share landing web page (single simple responsive page).

Sign-up includes a **date-of-birth** field (native date picker) with an inline under-18 message. Admin portal screens are listed separately in §13.

**R2 preview (concept only, not for R1 delivery):** Reels full-screen player, Reels create/trim.

## 8. Layout specifics

- **Feed photo aspect ratios:** supported 1:1, 4:5 (portrait, preferred) and 1.91:1 (landscape). Taller images are centre-cropped to 4:5 in the feed. Space is reserved from known dimensions — no layout shift.
- **Profile grid:** 3 columns, square thumbnails, 2-pt gutters.
- **Touch targets:** ≥ 44 × 44 pt, even for small icons (padding counts).
- **Safe areas & notches:** respected on all screens; full-bleed photos may extend under status bar only on the image viewer.
- **Small screens:** must work at 360 × 640 dp (common budget Android) without horizontal scrolling or clipped buttons.

## 9. Localisation

- All copy written in English and Swahili by native speakers (not machine translation for final copy).
- Avoid text in images. Allow ~40 % text expansion in buttons and tabs; tab labels must fit or switch to icon-only + accessibility label.
- Dates/times relative ("2 h" / "saa 2") via the i18n library; numbers abbreviated (1.2K / elfu 1.2) consistently.
- Tone: friendly, short, second person ("You're all caught up" / "Umeona kila kitu").

## 10. Accessibility requirements

- WCAG 2.1 AA contrast (palette above is pre-checked).
- Every icon button has an accessibility label; images have descriptive labels ("Photo by amina"); optional user alt-text field is an R1.1 candidate.
- Screen-reader order follows visual order; post card actions reachable without double-tap gestures (double-tap like always has a button equivalent).
- Never rely on colour alone (liked = filled icon *and* colour).
- Support Dynamic Type / font scaling and Reduce Motion.

## 11. Performance constraints on design

| Constraint | Reason |
|---|---|
| No custom fonts in body UI | Startup time, app size |
| Illustrations SVG ≤ 15 KB each; total UI assets ≤ 500 KB | App size, data cost |
| No auto-playing video in R1 | Data, battery |
| Avoid blur/transparency effects over scrolling content | Frame drops on mid-range Android |
| Skeletons instead of spinners for content | Perceived speed |

## 12. Deliverables & sequencing

| Deliverable | Format | Needed before |
|---|---|---|
| Brand concepts (2–3 directions) + logo | Figma | Plan Phase 3 (mobile) |
| Chosen direction: tokens + core components | Figma library (variables for light/dark) | Plan task 3.1 (theme tokens) |
| Auth, onboarding, feed, create, profile screens (all states) | Figma, clickable prototype | Plan tasks 3.4–3.8 |
| Remaining R1 mobile screens | Figma | Plan tasks 3.9–3.11 |
| Admin portal wireframes (§13) | Figma (low/mid fidelity) | Plan Phase 4 (admin portal) |
| App icon set, splash, notification icon, store screenshots | PNG/SVG exports | Plan task 5.7 (store assets) |
| Copy deck EN/SW | Spreadsheet keyed by string ID | Plan task 3.4 (grows with each screen; final review in 5.6) |

Design tokens must be exportable (Figma variables → JSON) so engineering consumes them directly in `mobile/src/theme/`.

**As delivered (2026-10-11):** the brand, components, all R1 mobile screens (clickable), the share landing page and the admin portal wireframes were produced on a Claude design canvas instead of Figma and approved ([Phase 3 tracker](backlog/phase-3-mobile.md)). The tokens are code in `mobile/src/theme/tokens.ts`, with a test that every text colour pair meets WCAG AA.

## 13. Admin portal (web)

The admin portal is a separate desktop web app used by 1–3 team members (App Flow §15). It is a **tool, not a brand showcase**: clarity, density and safety over visual expression.

| Topic | Direction |
|---|---|
| Base | Tailwind CSS + shadcn/ui components with Jamii tokens (primary, danger, neutrals) mapped in — no bespoke component design needed. |
| Layout | Left sidebar navigation, top bar (admin name, role, log out), content max-width 1440 px; data tables with sticky headers, filters above, detail in a page or right-side panel. |
| Density | Compact tables (40 px rows), 14 px body text; system font stack. |
| Content previews | Reported photos shown at feed size with a **blur-until-click** toggle for potentially graphic content (protects moderator wellbeing). |
| Destructive actions | Danger colour, confirmation dialog with a required reason note, clear consequence text ("Logs the user out and hides all their posts"). |
| Status pills | Report: Open (amber), Reviewing (blue), Resolved (green), Dismissed (grey). User: Active, Suspended, Pending deletion. |
| Modes | Light mode required; dark mode optional. English only. |
| Accessibility | WCAG 2.1 AA contrast; full keyboard navigation for the reports queue (j/k to move, Enter to open). |

**Screens:** Login · 2FA setup · 2FA code · Dashboard · Reports queue · Report detail · Users list · User detail · Post/comment view · Invite codes · Audit log · Admins (super-admin) · Session-expired / no-access states.

**Design effort:** low-to-medium fidelity wireframes are sufficient; engineers build from shadcn/ui.

## 14. Success criteria for the design

- Pilot users describe the app as "easy" and "fast" in feedback interviews.
- First-time users complete sign-up → first follow without help.
- No accessibility contrast failures in an automated audit.
- Engineering can build every screen from the component library without one-off styles.
