-- Drop the old table and create a more flexible one
DROP TABLE IF EXISTS tm_crew_notification_prefs;

-- Individual crew notification settings
CREATE TABLE tm_crew_notifications (
    notification_id VARCHAR(7) PRIMARY KEY CHECK (notification_id ~ '^#[0-9A-F]{6}$'),
    show_id VARCHAR(50),
    crew_member_id VARCHAR(50), -- Could be from production_notes
    
    -- Contact info
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(100),
    role VARCHAR(50), -- FOH, Lighting, Driver, etc.
    
    -- Notification toggles (TM controls these)
    notify_on_schedule_change BOOLEAN DEFAULT false,
    notify_on_traffic_delay BOOLEAN DEFAULT false,
    notify_on_lobby_change BOOLEAN DEFAULT false,
    notify_on_soundcheck_change BOOLEAN DEFAULT false,
    notify_on_emergency BOOLEAN DEFAULT true, -- Always on by default
    
    -- Additional settings
    advance_notice_minutes INTEGER DEFAULT 30, -- How early to notify
    preferred_contact_method VARCHAR(10) DEFAULT 'sms', -- sms, email, both
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for quick lookups
CREATE INDEX idx_crew_notifications_show ON tm_crew_notifications(show_id);
CREATE INDEX idx_crew_notifications_enabled ON tm_crew_notifications(show_id, notify_on_schedule_change);
