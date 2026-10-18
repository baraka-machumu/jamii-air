# Jamii Air — Business Requirements Specification (BRS)

| | |
|---|---|
| **Document** | 01 — Business Requirements Specification |
| **Version** | 1.2 (R1 scope widened by the owner on 2026-10-16: video posts, comment replies, hashtags, multi-photo carousel — see §6.1) |
| **Date** | 2026-10-09 |
| **Status** | **Signed off** — 2026-10-10; §6.1 scope change signed off 2026-10-16 |
| **Related** | [00 Index & Review](00-README.md) · [02 TRD](02-technical-requirements-document.md) · [06 Implementation Plan](06-implementation-plan.md) |

---

## 1. Purpose of this document

This document defines **what Jamii Air must achieve as a business and for its users**, independent of how it is built. It is the reference against which every technical decision, design choice and release is measured. If a feature cannot be traced to a requirement here, it is out of scope.

## 2. Background

"Jamii" means *community* in Swahili. Jamii Air is a mobile social platform where people share photos — and, in a later release, short videos ("Reels") — with the people they follow, and react through likes, comments and shares.

The product follows a familiar pattern (Instagram-style), so the business risk is **not** "will people understand it?" but:

1. Will a small group complete the core social loop and come back?
2. Can we serve users on mid-range Android phones and variable mobile networks with a fast, data-light experience?
3. Can the platform grow from 10 pilot users to ~10,000 active users **without a rewrite**?

## 3. Business objectives

| ID | Objective | Measure of success |
|---|---|---|
| BO-1 | Validate the core social loop with a private pilot. | ≥ 8 of 10 pilot users complete *register → follow → post → like/comment → receive notification* within their first week. |
| BO-2 | Demonstrate retention. | D7 retention ≥ 50 % and D30 ≥ 30 % in the pilot cohort. |
| BO-3 | Deliver a fast, data-light experience on typical local devices and networks. | Feed P95 API latency < 500 ms; a feed page of 20 posts costs < 2 MB of image data on first load; crash-free sessions > 99 %. |
| BO-4 | Build a foundation that scales to 10,000 active users cheaply and predictably. | Load test at 10× pilot load passes with no architectural change (TRD §13). |
| BO-5 | Keep the community safe from day one. | Block, report and admin moderation work end-to-end before the pilot; every report reviewed within 24 h during pilot. |
| BO-6 | Keep running costs proportional to usage. | Pilot infrastructure ≤ USD 50/month. |

## 4. Stakeholders

| Role | Interest | Involvement |
|---|---|---|
| Founder / Product owner | Product direction, priorities, sign-off | Approves BRS, releases |
| Engineering (backend, mobile) | Build, operate, scale | Owns TRD, schema, implementation |
| Designer | Brand, UX, UI | Owns Design Brief deliverables (the engineer with Claude Code until a designer joins — D-11) |
| Pilot users (10) | A useful, pleasant, safe app | Feedback, usage data |
| Moderator / Admin | Handle reports, enforce rules, manage pilot invites | Uses the **admin portal** (web) |
| Legal / compliance advisor | Data protection, app store rules | Reviews privacy policy, ToS |

## 5. Target users & personas

**Assumed primary market:** East Africa (Tanzania, Kenya), urban and peri-urban, aged 18–35 (**the platform is 18+ only**), Android-first (iOS supported), English and Swahili speakers, frequently on prepaid mobile data where **data cost matters**. *(Confirmed — decision D-7.)*

| Persona | Description | Needs |
|---|---|---|
| **Amina — the Sharer** (24, student) | Posts photos of daily life, events, outfits. Mid-range Android, prepaid data bundles. | Fast posting even on a weak signal; photos that look good; to see who liked them. |
| **Baraka — the Viewer** (29, works in town) | Mostly scrolls, likes and occasionally comments. | A feed that loads instantly and doesn't burn data; easy to find friends. |
| **Neema — the Small Creator** (31, runs a small business) | Posts products and behind-the-scenes. Later wants Reels. | Reach followers reliably; share posts to WhatsApp; know engagement. |
| **Admin / Moderator** | Pilot team member, works from a laptop. | A web portal to see reports in one place, hide content or suspend accounts quickly, manage invites, and see an audit trail. |

## 6. Release strategy

The product is delivered in releases. **Only Release 1 is committed in detail.** Later releases are directional and will be re-planned using pilot data.

| Release | Name | Audience | Headline scope |
|---|---|---|---|
| **R1** | **MVP — Private Pilot** | 10 invited users | Accounts, profiles, follow, **photo and video posts**, **multi-photo carousel**, chronological feed, likes, comments with **one level of replies**, **hashtags**, **share link**, notifications, block/report, **admin portal (web)**. |
| R1.1 | Public Launch | 100 – 1,000 users | Open sign-up, email verification, illegal-content hash matching, observability hardening, Android/iOS public store release. |
| **R2** | **Reels** | 1,000+ users | The Reels *surface*: a dedicated tab with a vertical swipe feed, autoplay, view counts and an adaptive (HLS) ladder. Video upload itself is R1 (§6.1). |
| R3 | Discovery | 1,000 – 10,000 | Explore page, @mentions, trending hashtags, improved search. AI/ML features (ranking, recommendations, ML moderation) to be scoped in a separate document. |
| R4 | Scale & Engage | 10,000+ | Stories, direct messages, creator insights, horizontal scaling. |

> **Decision D-1 (revised 2026-10-16):** R1 originally carried no video at all, because video multiplies
> storage, bandwidth, processing and moderation cost. The data model and media pipeline were built so that
> video could be added without restructuring (TRD §8, Schema §4), and that is what §6.1 now does. What stays
> in R2 is the *Reels surface* — the dedicated tab, the vertical swipe feed, view counts and adaptive
> streaming — not the ability to post a video.

### 6.1 Scope change — 2026-10-16

After the core loop was demonstrated on a real phone against UAT (Plan §1.1), the owner moved four
features into R1 rather than waiting for R1.1 or R2:

| Moved into R1 | Was | Requirements | Why it is affordable now |
|---|---|---|---|
| Video posts | R2 | BR-CT-07, BR-CT-08 | One 720p MP4 rendition plus a poster frame, capped at 60 s. No adaptive ladder, no Reels tab: the existing media pipeline, worker and post model take it as another media kind (TRD §9.1). |
| Multi-photo carousel | R1.1 | BR-CT-09 | `post_media` already carries an ordered position and the publish rule already waits for every item (Schema §4.3); only the one-photo guard and the mobile UI had to change. |
| Replies to comments | out of scope | BR-FD-08, BR-FD-09 | **One** level only — a reply cannot be replied to — so the comment table takes a self-reference and no recursive query is needed. |
| Hashtags | R3 | BR-FD-10, BR-FD-11 | Tags are parsed from the caption and stored; a tag opens a chronological list of posts. No trending, no ranking, no @mentions — those stay in R3. |

The same session raised one defect to a requirement: a post was not reliably on screen once it finished
publishing (BR-FD-12).

**What this costs.** Video is the only item with a real running cost: a 60 s 720p upload is roughly
8–15 MB stored after transcoding, against ~200 KB for a photo, and transcoding is CPU-bound on the host
that runs the worker. The pilot is ten users, so the pilot-scale cost is accepted; a public launch needs
the figure re-checked against NFR-07 before R1.1.

## 7. Scope — Release 1 (MVP)

### 7.1 In scope

Accounts & sessions · profiles · user search · follow/unfollow · post create/delete — **one photo, up to 10 photos as a carousel, or one video (≤ 60 s)** · chronological home feed · profile grid · post detail · like/unlike · comments (create, list, delete) with **one level of replies** · **hashtags in captions, and a chronological list of posts per tag** · share post link · in-app activity + push notifications · block/unblock · report · admin portal — a separate website for moderation (reports, hide content, suspend users), invite codes and audit log · account deletion · English & Swahili UI.

### 7.2 Out of scope (R1)

The **Reels surface** (a dedicated tab, vertical swipe feed, autoplay, view counts, adaptive/HLS streaming) · Stories · live streaming · direct messages · Explore/recommendations · **any AI/ML feature** (ranking, recommendations, ML moderation) · **@mentions** · **trending or ranked hashtags** · **replies to replies** (one level only) · private accounts · ads, payments, shopping · creator analytics · web app for end users · microservices, Kubernetes, Kafka, Elasticsearch, multi-region.

## 8. Business requirements

Priority: **M** = Must (release blocked without it) · **S** = Should (strongly desired, may slip to next release) · **C** = Could.

### 8.1 Accounts & access

| ID | Requirement | Priority |
|---|---|---|
| BR-AC-01 | A person can create an account with email, username and password. | M |
| BR-AC-02 | During the pilot, registration requires a valid invite code (switchable to open sign-up without a release). | M |
| BR-AC-03 | Usernames are unique regardless of letter case, 3–30 characters, letters/digits/`.`/`_`. | M |
| BR-AC-04 | A user stays signed in across app restarts until they log out or the session is revoked. | M |
| BR-AC-05 | A user can log out; logging out ends that device's session. | M |
| BR-AC-06 | A user must accept the Terms of Service and give their date of birth at sign-up. **Anyone under 18 cannot register**; the check is enforced on the server. Date of birth is never shown publicly. | M |
| BR-AC-07 | A user can reset a forgotten password via email. | S |
| BR-AC-08 | A user can delete their account from inside the app (App Store requirement). Content disappears immediately; data is permanently erased after a 30-day grace period. | M |

### 8.2 Profiles & social graph

| ID | Requirement | Priority |
|---|---|---|
| BR-PR-01 | A profile shows avatar, display name, username, bio, post count, follower count, following count and a grid of posts. | M |
| BR-PR-02 | A user can edit their avatar, display name, bio and username. | M |
| BR-PR-03 | A user can search for other users by username or display name. | M |
| BR-PR-04 | A user can follow and unfollow another user. All accounts are public in R1. | M |
| BR-PR-05 | A user can view follower and following lists of a profile. | S |

### 8.3 Content

| ID | Requirement | Priority |
|---|---|---|
| BR-CT-01 | A user can publish a post with an optional caption (≤ 2,200 chars) from camera or gallery. | M |
| BR-CT-02 | Photos are automatically optimised so the feed is fast and data-light; the original is never sent to the feed. | M |
| BR-CT-03 | A user sees upload progress and can retry a failed upload without re-selecting the photo. | M |
| BR-CT-04 | A user can delete their own post. | M |
| BR-CT-05 | A user can edit the caption of their own post. | C |
| BR-CT-06 | Location data embedded in photos is removed before anyone else can see the photo. The same applies to video metadata. | M |
| BR-CT-07 | A user can publish a post whose media is **one video of at most 60 seconds**, from the gallery or recorded in the app. A longer or unreadable file is refused with a reason, before the upload where the phone can tell. | M |
| BR-CT-08 | Video is re-encoded server-side to a single 720p MP4 and given a poster image, so it plays on a mid-range Android over a prepaid bundle. The original is never served. | M |
| BR-CT-09 | A user can publish **up to 10 photos in one post**, in a chosen order, shown as a swipeable carousel with a position indicator. The post appears only once every photo is ready. | M |
| BR-CT-10 | One post holds **either** photos **or** a single video, never a mix. | M |

### 8.4 Feed & engagement

| ID | Requirement | Priority |
|---|---|---|
| BR-FD-01 | The home feed shows posts from accounts the user follows, plus their own, newest first. | M |
| BR-FD-02 | The feed loads progressively as the user scrolls and supports pull-to-refresh. | M |
| BR-FD-03 | A user can like/unlike a post (button or double-tap) and the result appears instantly. | M |
| BR-FD-04 | A user can comment on a post and see comments, newest-loaded in pages. | M |
| BR-FD-05 | A user can delete their own comments; a post author can delete comments on their own post. | M |
| BR-FD-06 | A user can share a post link via the phone's share sheet (WhatsApp, SMS, etc.). Opening the link on a phone with the app installed opens that post. | M |
| BR-FD-07 | A user with no follows sees a helpful empty state with suggested next steps (search, invite). | M |
| BR-FD-08 | A user can reply to a comment. Replies sit under the comment they answer, newest-loaded in pages, and are counted on it. | M |
| BR-FD-09 | Replies go **one level deep**: a reply cannot itself be replied to. Replying from a reply answers its parent comment. | M |
| BR-FD-10 | A `#tag` written in a caption becomes a link. Tags are case-insensitive, 1–64 characters, letters, digits and `_`. | M |
| BR-FD-11 | Opening a tag shows the posts carrying it, newest first, under the same visibility rules as the feed (no hidden or blocked content). | M |
| BR-FD-12 | Once a post finishes publishing it is **on screen without the user doing anything** — at the top of the home feed and in their profile grid. While it is still processing, its place is held by a progress card. | M |

### 8.5 Notifications

| ID | Requirement | Priority |
|---|---|---|
| BR-NT-01 | A user is notified when someone follows them, likes their post, comments on their post, or **replies to their comment**. | M |
| BR-NT-02 | Notifications appear in an in-app Activity screen with unread indicator. | M |
| BR-NT-03 | Notifications are also delivered as push notifications when the user has granted permission. | M |
| BR-NT-04 | Users are never notified about their own actions, and repeated like/unlike does not produce repeated notifications. | M |
| BR-NT-05 | A user can turn push notifications off per category. | C |

### 8.6 Safety & moderation

| ID | Requirement | Priority |
|---|---|---|
| BR-SF-01 | A user can block another user. Blocked users cannot see each other's profile or posts, follow, like or comment on each other. Existing follows between them are removed. | M |
| BR-SF-02 | A user can report a user, post or comment with a reason. | M |
| BR-SF-03 | Admins work in a **separate web admin portal** (not inside the mobile app). In it an admin can see open reports, hide/unhide a post or comment, suspend or reinstate a user, and resolve or dismiss a report. | M |
| BR-SF-07 | Admin accounts are separate from user accounts, require two-factor authentication, and have roles (Super-admin, Moderator). | M |
| BR-SF-08 | Admins can create and revoke pilot invite codes and see the KPI dashboard (BR-DI-01) in the portal. | M |
| BR-SF-04 | Every admin action is recorded with who, what, when and why. | M |
| BR-SF-05 | Suspended users cannot log in or post; their content is hidden. | M |
| BR-SF-06 | Before *public* launch (R1.1), uploaded images are checked against known illegal-content hash lists (e.g. CSAM hash matching). | M (R1.1) |

### 8.7 Platform & experience

| ID | Requirement | Priority |
|---|---|---|
| BR-PL-01 | The app runs on Android 9+ and iOS 15+ phones. | M |
| BR-PL-02 | The UI is available in English and Swahili and follows the device language by default. | M |
| BR-PL-03 | The app remains usable on slow or intermittent connections, shows clear offline/error messages, and never shows raw error codes. | M |
| BR-PL-04 | The app supports light and dark mode. | S |
| BR-PL-05 | The app meets WCAG 2.1 AA contrast and supports system font scaling and screen readers on core flows. | S |

### 8.8 Data & insight

| ID | Requirement | Priority |
|---|---|---|
| BR-DI-01 | The business can see daily: registered users, DAU, posts, likes, comments, follows, retention (D1/D7/D30), % new users who follow someone, % new users who post. | M |
| BR-DI-03 | No unnecessary personal data is collected; analytics never contain passwords, tokens or message content. | M |

## 9. Non-functional business requirements

| ID | Requirement |
|---|---|
| NFR-01 | **Performance:** common actions feel instant (optimistic UI); API P95 < 500 ms; smooth 60 fps scrolling on a mid-range Android device. |
| NFR-02 | **Data efficiency:** feed images delivered in compressed modern formats sized for the screen. |
| NFR-03 | **Availability:** pilot target 99 % monthly; R1.1 target 99.5 %. |
| NFR-04 | **Security:** industry-standard password hashing, encrypted transport, server-side authorization on every action. |
| NFR-05 | **Privacy & compliance:** 18+ platform (store age ratings set accordingly); comply with applicable data protection law (e.g. Tanzania PDPA 2022, Kenya DPA 2019 — *to be confirmed by legal counsel*) and Apple/Google rules for user-generated-content apps (report, block, in-app account deletion, published terms). |
| NFR-06 | **Recoverability:** automated daily database backups; a restore has been tested before the pilot. |
| NFR-07 | **Scalability:** reach ~10,000 active users through configuration, optimisation and adding instances — not a rewrite. |
| NFR-08 | **Cost:** infrastructure cost grows with usage; no fixed-cost infrastructure added before measurements justify it. |

## 10. Success metrics (KPIs)

| Category | KPI | Pilot target |
|---|---|---|
| Activation | % of new users who follow ≥ 1 account in first session | ≥ 80 % |
| Activation | % of new users who publish ≥ 1 post in first 7 days | ≥ 60 % |
| Engagement | Posts / DAU / day | ≥ 0.3 |
| Engagement | Likes + comments per post (median) | ≥ 3 |
| Retention | D1 / D7 / D30 | ≥ 70 % / 50 % / 30 % |
| Quality | Crash-free sessions | > 99 % |
| Quality | Feed P95 latency | < 500 ms |
| Safety | Median time to resolve a report | < 24 h |

## 11. Assumptions

1. Primary market is East Africa; English + Swahili are sufficient for R1.
2. Pilot users are invited, known to the team, and give feedback directly.
3. All accounts are public in R1.
4. One admin (from the team) moderates during the pilot, using the admin portal from a laptop.
5. A team of 1 engineer building with Claude Code (decision D-11).
6. Apple and Google developer accounts will be available for TestFlight / internal testing distribution.

## 12. Constraints

1. Budget: minimal infrastructure spend for the pilot (≤ USD 50/month).
2. Must follow the source guidelines' architecture principle: *simple infrastructure, scalable boundaries*.
3. Backend: NestJS + TypeScript (an existing scaffold is in the repository); PostgreSQL with Prisma, with most business activities implemented as PostgreSQL stored procedures (decision D-3).
4. Mobile: React Native (decision D-2). Admin: separate web portal (decision D-5).
5. Mobile users will run older app versions alongside newer ones; the API must stay backward compatible.

## 13. Business risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Pilot users don't engage without Reels | Medium | High | Validate photo loop first; ship Reels as R2 soon after; interview pilot users about video. |
| Empty feed for new users causes churn | High | High | Invite-based pilot (users know each other); onboarding prompts to follow; R3 Explore. |
| Data cost deters usage | Medium | High | Aggressive image optimisation; Low-data mode (R1.1). |
| Harmful content harms brand / legal exposure | Medium | High | Block/report/admin from day one; hash matching before public launch; clear ToS. |
| App store rejection | Medium | Medium | Implement UGC requirements (report, block, delete account, ToS, contact) in R1. |
| Scope creep toward "full Instagram" | High | Medium | This BRS is the gate; new scope requires a release assignment. |

## 14. Glossary

| Term | Meaning |
|---|---|
| Post | A published photo (R1) or video (R2) with caption. |
| Reel | A short vertical video post (R2). |
| Feed | The scrolling list of posts from followed accounts. |
| Social loop | Register → follow → post → react → get notified → return. |
| DAU | Daily active users. |
| D7 retention | % of users active again 7 days after sign-up. |
| Pilot | Private R1 trial with ~10 invited users. |

## 15. Approval

| Role | Name | Decision | Date |
|---|---|---|---|
| Product owner | | Approved | 2026-10-10 |
| Engineering lead | | | |
