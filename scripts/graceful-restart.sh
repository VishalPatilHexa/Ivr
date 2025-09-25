#!/bin/bash

# ===============================================================================
# GRACEFUL RESTART SCRIPT
# ===============================================================================
# Safely restart the IVR application by checking for active calls first

API_URL="http://localhost:8080"  # Adjust to your app URL
APP_NAME="hexahealth-ivr"        # Your PM2 app name

echo "🎯 IVR Graceful Restart Script"
echo "================================"

# Check if app is running
if ! pm2 list | grep -q "$APP_NAME.*online"; then
    echo "❌ App $APP_NAME is not running. Starting it..."
    pm2 start $APP_NAME
    exit 0
fi

echo "🔍 Checking for active calls..."

# Call the API to check active calls
RESPONSE=$(curl -s "$API_URL/admin/active-calls" 2>/dev/null)

if [ $? -ne 0 ]; then
    echo "❌ Failed to connect to API. Force restarting..."
    pm2 restart $APP_NAME
    exit 1
fi

# Parse response to get active call count
ACTIVE_CALLS=$(echo "$RESPONSE" | grep -o '"activeCallCount":[0-9]*' | cut -d':' -f2)

if [ -z "$ACTIVE_CALLS" ]; then
    echo "⚠️ Could not determine active call count. Force restarting..."
    pm2 restart $APP_NAME
    exit 1
fi

if [ "$ACTIVE_CALLS" -eq 0 ]; then
    echo "✅ No active calls found. Restarting immediately..."
    pm2 restart $APP_NAME
    echo "🎉 Restart completed successfully!"
    exit 0
fi

echo "📞 Found $ACTIVE_CALLS active calls. Initiating graceful restart..."
echo "⏳ This will wait for calls to complete (max 10 minutes)..."

# Initiate graceful restart via API
RESTART_RESPONSE=$(curl -s -X POST "$API_URL/admin/graceful-restart" 2>/dev/null)
echo "Response: $RESTART_RESPONSE"

if echo "$RESTART_RESPONSE" | grep -q '"success":true'; then
    echo "✅ Graceful restart completed!"
else
    echo "⏳ Waiting for calls to complete..."
    echo "💡 You can check status with: curl $API_URL/admin/system-status"
    echo "💡 Or force restart with: curl -X POST $API_URL/admin/force-restart"
fi