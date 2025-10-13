-- Add band member specific fields to the notifications table
ALTER TABLE tm_crew_notifications 
ADD COLUMN member_type VARCHAR(20) DEFAULT 'crew' CHECK (member_type IN ('crew', 'band', 'support')),
ADD COLUMN notify_on_set_time_change BOOLEAN DEFAULT false,
ADD COLUMN notify_on_meet_greet BOOLEAN DEFAULT false,
ADD COLUMN notify_on_press_commitments BOOLEAN DEFAULT false,
ADD COLUMN notify_on_travel_departure BOOLEAN DEFAULT false;

-- Rename table to be more inclusive
ALTER TABLE tm_crew_notifications RENAME TO tm_member_notifications;

-- Update indexes
DROP INDEX IF EXISTS idx_crew_notifications_show;
DROP INDEX IF EXISTS idx_crew_notifications_enabled;
CREATE INDEX idx_member_notifications_show ON tm_member_notifications(show_id);
CREATE INDEX idx_member_notifications_type ON tm_member_notifications(show_id, member_type);
CREATE INDEX idx_member_notifications_enabled ON tm_member_notifications(show_id, notify_on_schedule_change);
