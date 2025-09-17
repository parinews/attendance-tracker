// server.js - Main server file for Replit
const express = require('express');
const path = require('path');
const cron = require('node-cron');
const emailjs = require('@emailjs/nodejs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// EmailJS Configuration
const EMAILJS_CONFIG = {
    publicKey: process.env.EMAILJS_PUBLIC_KEY || 'your_public_key_here',
    privateKey: process.env.EMAILJS_PRIVATE_KEY || 'your_private_key_here',
    serviceId: process.env.EMAILJS_SERVICE_ID || 'your_service_id_here',
    templateId: process.env.EMAILJS_TEMPLATE_ID || 'your_template_id_here'
};

// Initialize EmailJS
emailjs.init({
    publicKey: EMAILJS_CONFIG.publicKey,
    privateKey: EMAILJS_CONFIG.privateKey,
});

// Store notification settings (in production, use a database)
let notificationSettings = {
    email: null,
    enabled: false,
    lastSent: null
};

// Employee data
const employees = [
    { id: 1, name: "John Smith" },
    { id: 2, name: "Sarah Johnson" },
    { id: 3, name: "Mike Davis" }
];

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint to save notification settings
app.post('/api/notifications/setup', (req, res) => {
    const { email, method } = req.body;
    
    if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Valid email is required' });
    }
    
    notificationSettings = {
        email: email,
        method: method || 'email',
        enabled: true,
        lastSent: null
    };
    
    console.log('✅ Notification settings saved:', notificationSettings);
    res.json({ success: true, message: 'Notification settings saved successfully' });
});

// API endpoint to get notification settings
app.get('/api/notifications/settings', (req, res) => {
    res.json(notificationSettings);
});

// API endpoint to send test notification
app.post('/api/notifications/test', async (req, res) => {
    if (!notificationSettings.enabled || !notificationSettings.email) {
        return res.status(400).json({ error: 'Notifications not configured' });
    }
    
    try {
        await sendAttendanceEmail(true); // true = test mode
        res.json({ success: true, message: 'Test email sent successfully!' });
    } catch (error) {
        console.error('Test email failed:', error);
        res.status(500).json({ error: 'Failed to send test email' });
    }
});

// API endpoint for quick attendance submission
app.post('/api/attendance/quick', (req, res) => {
    const { date, records } = req.body;
    
    if (!date || !records || records.length !== employees.length) {
        return res.status(400).json({ error: 'Invalid attendance data' });
    }
    
    // In a real app, save to database here
    console.log('📊 Quick attendance saved:', { date, records });
    
    res.json({ success: true, message: 'Attendance saved successfully' });
});

// Function to generate quick response URL
function generateQuickResponseUrl() {
    const responseId = 'resp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const baseUrl = process.env.REPL_SLUG 
        ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
        : `http://localhost:${PORT}`;
    return `${baseUrl}?response=${responseId}`;
}

// Function to send attendance reminder email
async function sendAttendanceEmail(isTest = false) {
    if (!notificationSettings.enabled || !notificationSettings.email) {
        console.log('⚠️ Email notifications not configured');
        return;
    }

    const quickResponseUrl = generateQuickResponseUrl();
    const today = new Date().toLocaleDateString();
    
    const emailParams = {
        to_email: notificationSettings.email,
        to_name: 'Attendance Manager',
        subject: isTest ? '🧪 Test: Daily Attendance Reminder' : '🕐 Daily Attendance Reminder',
        date: today,
        quick_link: quickResponseUrl,
        employees_list: employees.map(emp => emp.name).join(', '),
        message: isTest 
            ? 'This is a test email. Your daily notifications are working correctly!'
            : 'Time to mark today\'s attendance! Click the quick link below for fast entry.'
    };

    try {
        const response = await emailjs.send(
            EMAILJS_CONFIG.serviceId,
            EMAILJS_CONFIG.templateId,
            emailParams
        );
        
        console.log(`✅ ${isTest ? 'Test' : 'Daily'} email sent successfully:`, response.status);
        
        if (!isTest) {
            notificationSettings.lastSent = new Date().toISOString();
        }
        
        return response;
    } catch (error) {
        console.error('❌ Email sending failed:', error);
        throw error;
    }
}

// Schedule daily notifications at 8:00 PM (20:00)
// Cron format: second minute hour day-of-month month day-of-week
const scheduleDaily = cron.schedule('0 0 20 * * *', async () => {
    console.log('⏰ Scheduled notification triggered at 8:00 PM');
    
    try {
        await sendAttendanceEmail();
        console.log('📧 Daily attendance email sent successfully');
    } catch (error) {
        console.error('❌ Failed to send scheduled email:', error);
    }
}, {
    scheduled: true,
    timezone: "America/New_York" // Change this to your timezone
});

// Alternative scheduling options (uncomment the one you want):

// Every minute for testing (comment out for production!)
// const scheduleTest = cron.schedule('*/1 * * * *', async () => {
//     console.log('🧪 Test notification (every minute)');
//     await sendAttendanceEmail(true);
// });

// Every hour for testing
// const scheduleHourly = cron.schedule('0 * * * *', async () => {
//     console.log('🧪 Hourly test notification');
//     await sendAttendanceEmail(true);
// });

// Weekdays only at 8 PM
// const scheduleWeekdays = cron.schedule('0 0 20 * * 1-5', async () => {
//     console.log('⏰ Weekday notification at 8:00 PM');
//     await sendAttendanceEmail();
// });

// API endpoint to manually trigger notification (for testing)
app.post('/api/notifications/trigger', async (req, res) => {
    try {
        await sendAttendanceEmail();
        res.json({ success: true, message: 'Notification sent manually' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to send notification' });
    }
});

// API endpoint to get cron status
app.get('/api/notifications/schedule', (req, res) => {
    res.json({
        dailyScheduleActive: scheduleDaily.getStatus() === 'scheduled',
        timezone: 'America/New_York',
        nextRun: '8:00 PM daily',
        lastSent: notificationSettings.lastSent
    });
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
    console.log(`
🚀 Attendance Tracker Server Started!
📍 Server running on port ${PORT}
⏰ Daily notifications scheduled for 8:00 PM
🌍 Timezone: America/New_York
    
📧 EmailJS Status: ${EMAILJS_CONFIG.publicKey !== 'your_public_key_here' ? '✅ Configured' : '⚠️ Needs Setup'}
🔔 Notifications: ${notificationSettings.enabled ? '✅ Enabled' : '⚠️ Not configured'}
    `);
    
    // Show helpful URLs
    if (process.env.REPL_SLUG) {
        console.log(`🔗 Your app: https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`);
    } else {
        console.log(`🔗 Local app: http://localhost:${PORT}`);
    }
});
