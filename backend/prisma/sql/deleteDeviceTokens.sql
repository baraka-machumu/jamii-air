-- fn_delete_device_tokens (Schema §7.6, push worker): tokens Expo reported as DeviceNotRegistered.
-- @param {String} $1:tokensJson
SELECT deleted FROM fn_delete_device_tokens(ARRAY(SELECT jsonb_array_elements_text($1::text::jsonb)));
