-- Generalise the Depop-only draft store to any marketplace.
--
-- `depop` is deliberately NOT dropped. Dropping a column is irreversible and
-- the reader falls back to it, so an existing Depop draft keeps working and
-- migrates itself the next time that listing is written. A later migration can
-- remove it once nothing reads it.
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "marketplaces" JSONB;
