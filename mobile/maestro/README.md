# Maestro E2E — the core loop

One flow, [`flows/core-loop.yaml`](flows/core-loop.yaml), drives the loop the pilot is judged on,
on a real phone: sign up → onboarding → feed → like → comment → log out → log in
(App Flow §3, §4.1–4.2, §4.5, §5, §7.1–7.2).

## Running it

1. Start the local stack and Metro: `scripts\dev-phone.bat` from the repo root (API, worker,
   Postgres, Redis, MinIO; it also restarts the containers if the Wi-Fi address changed).
2. Have the Jamii Air **dev build** installed on the phone, with the phone attached over USB
   (`adb devices` lists it) and the app able to reach the API.
3. Install Maestro once: `curl -Ls "https://get.maestro.mobile.dev" | bash`
   (Windows: run it in WSL or Git Bash; the CLI needs `adb` on the PATH).
4. `npm run e2e` from `mobile/`.

## What it expects of the data

The flow signs up a new account each run, so the stack needs **an existing account with at least
one published post** for the new one to follow in onboarding step 2. Without that the feed is
empty and the flow stops at `Your feed is empty` with that message, rather than failing on a
missing Like button.

Registration is limited to **5 per hour per address**. Beyond that, clear the `rl:*` keys in Redis
between runs (the same limit the live tests hit, see the Phase 3 backlog decisions).

## What it leaves out, and why

- **Sharing a photo.** The Create flow opens the system photo picker (task 3.7 decision: no in-app
  gallery), which is another app's UI. Device check 3.7.h covers it instead.
- **The notification permission prompt.** The flow taps *Not now*; the OS prompt and real pushes
  are device check 3.10.e.
- **Date of birth** is the one step that does drive another app's UI — Android's date dialog. Its
  two taps are `optional: true`, so a different Android version changes the dialog without failing
  the run, but check this step first if sign-up breaks on a new phone.

## Not in CI yet

CI runs this nowhere: GitHub Actions would need either an Android emulator plus a Gradle debug
build (~20–30 min a push, outside the EAS flow this project uses) or Maestro Cloud (paid, and the
build leaves this machine). Decided 2026-10-15 to keep the flow local and wire CI in Plan 5.x,
where the release work already touches builds and signing.
