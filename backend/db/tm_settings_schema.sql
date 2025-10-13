-- Tour Manager Settings for automated notifications and adjustments
CREATE TABLE tm_settings (
    setting_id VARCHAR(7) PRIMARY KEY CHECK (setting_id ~ '^#[0-9A-F]{6}$'),
    user_id VARCHAR(7) REFERENCES tm_users(user_id),
    show_id VARCHAR(50),
    
    -- Traffic monitoring settings
    traffic_monitoring_enabled BOOLEAN DEFAULT false,
    traffic_check_hours_before DECIMAL(3,1) DEFAULT 2.0, -- Check 2 hours before
    traffic_delay_threshold_minutes INTEGER DEFAULT 30, -- Alert if delay > 30 min
    
    -- Auto-adjustment settings
    auto_adjust_enabled BOOLEAN DEFAULT false,
    auto_adjust_requires_approval BOOLEAN DEFAULT true,
    adjustment_buffer_minutes INTEGER DEFAULT 15, -- Add 15 min buffer to delays
    
    -- Auto-notification settings
    auto_notify_on_adjustment BOOLEAN DEFAULT false,
    notify_all_crew BOOLEAN DEFAULT false,
    notify_local_drivers BOOLEAN DEFAULT true,
    notify_department_heads BOOLEAN DEFAULT true,
    
    -- Notification templates
    adjustment_sms_template TEXT DEFAULT 'SCHEDULE CHANGE: {{event}} moved to {{new_time}} (was {{old_time}}) due to {{reason}}. {{additional_info}}',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notification preferences by crew member
CREATE TABLE tm_crew_notification_prefs (
    pref_id VARCHAR(7) PRIMARY KEY CHECK (pref_id ~ '^#[0-9A-F]{6}$'),
    phone_number VARCHAR(20),
    crew_name VARCHAR(100),
    department VARCHAR(50),
    is_local_driver BOOLEAN DEFAULT false,
    is_department_head BOOLEAN DEFAULT false,
    opt_in_auto_notifications BOOLEAN DEFAULT true,
    show_id VARCHAR(50)
);
