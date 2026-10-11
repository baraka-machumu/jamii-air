-- fn_ping (Schema §7): harness sample; returns 'pong' for an existing user, JA404 otherwise.
-- @param {String} $1:viewerId
SELECT fn_ping($1::uuid) AS reply;
