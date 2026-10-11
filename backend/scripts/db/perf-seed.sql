-- Performance data set (Plan task 1.13): {{users}} users, {{posts}} posts with one photo each,
-- a skewed follow graph, likes, comments and notifications. Bulk-loaded directly (not through the
-- procedures) with triggers and FK checks off; counters are computed at the end. Run by
-- scripts/db/perf.ts into a throw-away *_perf database only.

SET session_replication_role = replica;
SET synchronous_commit = off;

CREATE TEMP TABLE u AS
SELECT uuidv7() AS id, g AS rn, now() - random() * interval '120 days' AS created_at
FROM generate_series(1, {{users}}) g;
CREATE UNIQUE INDEX ON u (rn);

INSERT INTO users (id, username, email, password_hash, date_of_birth, display_name, locale,
                   terms_accepted_at, last_active_at, created_at, updated_at)
SELECT id, translate(substr(md5(rn::text), 1, 7), '0123456789', 'aeiouybkmn') || '_' || rn,
       'user' || rn || '@perf.test', '$argon2id$v=19$m=19456,t=2,p=1$perf$perf',
       DATE '1990-01-01' + (rn % 3000),
       initcap(translate(substr(md5((rn * 31)::text), 1, 6), '0123456789', 'aeiouybkmn')) || ' '
         || initcap(translate(substr(md5((rn * 17)::text), 1, 8), '0123456789', 'aeiouybkmn')),
       CASE WHEN rn % 3 = 0 THEN 'sw' ELSE 'en' END,
       created_at, now() - random() * interval '3 days', created_at, created_at
FROM u;

-- Follows: {{follows_per_user}} per user, skewed towards popular accounts (low rn).
INSERT INTO follows (follower_id, following_id, created_at)
SELECT a.id, b.id, now() - random() * interval '100 days'
FROM u a
CROSS JOIN LATERAL (
  SELECT (1 + floor({{users}} * power(random(), 2)))::int AS rn
  FROM generate_series(1, {{follows_per_user}} + 0 * a.rn)
) pick
JOIN u b ON b.rn = pick.rn
WHERE b.id <> a.id
ON CONFLICT DO NOTHING;

-- Posts: skewed authors, spread over 120 days; 2 % deleted.
CREATE TEMP TABLE p AS
SELECT uuidv7() AS id, uuidv7() AS media_id, u.id AS author_id, s.ts AS created_at, s.g
FROM (SELECT g, (1 + floor({{users}} * power(random(), 1.5)))::int AS rn, now() - random() * interval '120 days' AS ts
      FROM generate_series(1, {{posts}}) g) s
JOIN u ON u.rn = s.rn;

INSERT INTO posts (id, author_id, caption, status, published_at, deleted_at, created_at, updated_at)
SELECT id, author_id, 'Perf post ' || g,
       CASE WHEN g % 50 = 0 THEN 'DELETED' ELSE 'PUBLISHED' END::post_status,
       created_at, CASE WHEN g % 50 = 0 THEN created_at END, created_at, created_at
FROM p;

INSERT INTO media_assets (id, owner_id, kind, purpose, status, original_key, mime_type, byte_size,
                          width, height, blurhash, processed_at, created_at, updated_at)
SELECT media_id, author_id, 'IMAGE', 'POST', 'READY',
       'users/' || author_id || '/media/' || media_id || '/original', 'image/jpeg', 2000000,
       1080, 1350, 'LEHV6nWB2yk8pyo0adR*.7kCMdnj', created_at, created_at, created_at
FROM p;

INSERT INTO post_media (post_id, media_id, position) SELECT id, media_id, 0 FROM p;

INSERT INTO media_variants (media_id, variant, object_key, width, height, mime_type, byte_size, created_at)
SELECT media_id, v.variant::media_variant_type,
       'users/' || author_id || '/media/' || media_id || '/' || lower(v.variant) || '.webp',
       v.w, v.h, 'image/webp', v.bytes, created_at
FROM p CROSS JOIN (VALUES ('FEED', 1080, 1350, 180000), ('THUMB', 320, 320, 20000)) AS v(variant, w, h, bytes);

-- Likes: {{likes}} random (user, post) pairs, biased towards recent posts.
INSERT INTO likes (user_id, post_id, created_at)
SELECT u.id, p.id, p.created_at + random() * interval '2 days'
FROM (SELECT (1 + floor({{users}} * random()))::int AS urn,
             (1 + floor({{posts}} * power(random(), 0.7)))::int AS pg
      FROM generate_series(1, {{likes}})) s
JOIN u ON u.rn = s.urn
JOIN p ON p.g = s.pg
ON CONFLICT DO NOTHING;

-- Comments.
INSERT INTO comments (post_id, author_id, body, created_at)
SELECT p.id, u.id, 'Perf comment ' || s.g, p.created_at + random() * interval '2 days'
FROM (SELECT g, (1 + floor({{users}} * random()))::int AS urn, (1 + floor({{posts}} * random()))::int AS pg
      FROM generate_series(1, {{comments}}) g) s
JOIN u ON u.rn = s.urn
JOIN p ON p.g = s.pg;

-- Notifications from likes (deduplicated like the procedures do).
INSERT INTO notifications (recipient_id, actor_id, type, post_id, created_at, read_at)
SELECT po.author_id, l.user_id, 'LIKE', l.post_id, l.created_at,
       CASE WHEN random() < 0.8 THEN l.created_at + interval '1 hour' END
FROM likes l JOIN posts po ON po.id = l.post_id
WHERE po.author_id <> l.user_id
ON CONFLICT DO NOTHING;

-- A few blocks.
INSERT INTO blocks (blocker_id, blocked_id)
SELECT a.id, b.id FROM u a JOIN u b ON b.rn = 1 + (a.rn * 7919) % {{users}}
WHERE a.rn % 20 = 0 AND a.id <> b.id
ON CONFLICT DO NOTHING;

-- Counters, as the procedures would have kept them.
UPDATE users x SET follower_count = s.n FROM (SELECT following_id AS id, count(*) AS n FROM follows GROUP BY 1) s WHERE x.id = s.id;
UPDATE users x SET following_count = s.n FROM (SELECT follower_id AS id, count(*) AS n FROM follows GROUP BY 1) s WHERE x.id = s.id;
UPDATE users x SET post_count = s.n
FROM (SELECT author_id AS id, count(*) AS n FROM posts WHERE status = 'PUBLISHED' GROUP BY 1) s WHERE x.id = s.id;
UPDATE posts x SET like_count = s.n FROM (SELECT post_id AS id, count(*) AS n FROM likes GROUP BY 1) s WHERE x.id = s.id;
UPDATE posts x SET comment_count = s.n FROM (SELECT post_id AS id, count(*) AS n FROM comments GROUP BY 1) s WHERE x.id = s.id;

RESET session_replication_role;
