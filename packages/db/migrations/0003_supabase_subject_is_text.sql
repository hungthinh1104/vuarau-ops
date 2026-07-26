-- `actors.supabase_user_id` becomes `text`.
--
-- A JWT `sub` is a string by specification. Supabase emits a uuid today, but
-- typing our column as `uuid` bakes that in and rejects any other issuer — and
-- the failure mode is an authentication error nobody can explain from the code.
--
-- Migration 0002 is left untouched (applied migrations are immutable; see
-- docs/10-ai-coding/CHANGE_PROTOCOL.md). The cast is lossless in this direction:
-- every uuid has a text representation.

ALTER TABLE "actors" ALTER COLUMN "supabase_user_id" SET DATA TYPE text;