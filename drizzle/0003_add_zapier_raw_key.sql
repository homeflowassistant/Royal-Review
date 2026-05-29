-- Add connectionKeyRaw column to zapier_connections table
-- This stores the actual connection key for users to copy anytime
ALTER TABLE zapier_connections ADD COLUMN "connectionKeyRaw" text;

-- Update existing rows to have a placeholder (optional - they won't have the raw key)
UPDATE zapier_connections SET "connectionKeyRaw" = '' WHERE "connectionKeyRaw" IS NULL;

-- Make the column NOT NULL
ALTER TABLE zapier_connections ALTER COLUMN "connectionKeyRaw" SET NOT NULL;
