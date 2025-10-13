-- Add response mode preference to tm_settings
ALTER TABLE tm_settings 
ADD COLUMN response_mode VARCHAR(10) DEFAULT 'basic' CHECK (response_mode IN ('basic', 'expanded'));

COMMENT ON COLUMN tm_settings.response_mode IS 'Controls response verbosity - basic for quick answers, expanded for detailed responses with context';
