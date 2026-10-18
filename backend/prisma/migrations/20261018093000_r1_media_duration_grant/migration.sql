-- R1 scope change 2026-10-16 (BRS §6.1), follow-up: GET /media/:id now reports a video's length,
-- and MediaService reads media_assets directly (not through a procedure), so the runtime role
-- needs duration_ms in its column grant. Hand-written: column grants are raw SQL (Schema §9).
GRANT SELECT (duration_ms) ON media_assets TO jamii_app;
