#!/bin/bash

# ===============================================================================
# CHECK ACTIVE CALLS SCRIPT
# ===============================================================================
# Quickly check current active calls

API_URL="http://localhost:8080"

echo "🔍 Checking Active Calls..."
echo "=========================="

# Method 1: Via API
echo "📡 Via API:"
curl -s "$API_URL/admin/active-calls" | jq .

echo -e "\n📊 Via Redis Direct:"
# Method 2: Direct Redis check
redis-cli -c << 'EOF'
SELECT 1
EVAL "
local sessions = redis.call('KEYS', 'ivr:session:*')
local active = 0
for i=1,#sessions do
    local data = redis.call('GET', sessions[i])
    if data then
        local session = cjson.decode(data)
        if session.status == 'active' or session.status == 'active_with_metadata' then
            active = active + 1
            print('Active: ' .. sessions[i] .. ' - ' .. session.status)
        end
    end
end
return active
" 0
EOF

echo -e "\n💡 Usage:"
echo "  - Check via API: curl $API_URL/admin/active-calls"
echo "  - System status: curl $API_URL/admin/system-status"
echo "  - Graceful restart: ./scripts/graceful-restart.sh"