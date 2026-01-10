-- Migration: Add GIN index for payment_providers.config JSONB field
-- This improves query performance when searching within the JSON configuration
-- See: specs/system_spec_detailed.md section 3.2

-- Create GIN index for efficient JSONB queries on payment_providers.config
CREATE INDEX IF NOT EXISTS payment_providers_config_idx 
  ON payment_providers USING GIN (config);

-- Note: This index enables fast lookups like:
-- SELECT * FROM payment_providers WHERE config @> '{"MerchantID": "123"}';
