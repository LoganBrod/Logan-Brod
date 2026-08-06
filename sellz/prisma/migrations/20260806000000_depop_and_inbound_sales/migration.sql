-- Depop drafts, Depop tracking state, and sales parsed from forwarded email.
--
-- Written idempotently on purpose. This project ran `prisma db push` until
-- now, so the production database may already carry some or all of these
-- objects depending on whether a given deploy's pre-deploy step completed.
-- Every statement here is therefore safe to run against a database that
-- already has the change, which makes the migration correct from either
-- starting state rather than only from the one we happen to expect.
--
-- Later migrations do not need this treatment: once the baseline is resolved,
-- _prisma_migrations tracks exactly what has run.

-- Depop draft + manual tracking state. Metrics stay in Listing.outcome,
-- shared with eBay, so analytics treat both platforms alike.
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "depop" JSONB;

-- Unguessable component of a seller's inbound forwarding address. Indexed
-- rather than unique: see the note in schema.prisma.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "inboundToken" TEXT;
CREATE INDEX IF NOT EXISTS "User_inboundToken_idx" ON "User"("inboundToken");

CREATE TABLE IF NOT EXISTS "InboundSale" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemTitle" TEXT NOT NULL,
    "price" DOUBLE PRECISION,
    "soldAt" TIMESTAMP(3),
    "platform" TEXT NOT NULL DEFAULT 'depop',
    "listingId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundSale_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InboundSale_userId_status_idx" ON "InboundSale"("userId", "status");

-- ADD CONSTRAINT has no IF NOT EXISTS, so swallow the duplicate instead.
DO $$ BEGIN
    ALTER TABLE "InboundSale"
        ADD CONSTRAINT "InboundSale_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
