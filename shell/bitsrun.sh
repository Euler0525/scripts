#!/bin/bash

export PATH="/root/.local/bin:$PATH"
export PYTHONPATH="/root/.local/lib/python3.10/site-packages:$PYTHONPATH"

echo "[$(date '+%F %T')] PATH: $PATH" >> /tmp/bitsrun.log
echo "[$(date '+%F %T')] PYTHONPATH: $PYTHONPATH" >> /tmp/bitsrun.log
which bitsrun >> /tmp/bitsrun.log 2>&1
python3 -c "import sys; print(sys.path)" >> /tmp/bitsrun.log 2>&1


USER_NAME=""
PASSWORD=""

# check every 5 minutes
PERIOD=300
LOG_FILE_PATH="/tmp/bitsrun.log"


handle_bit_user_json() {
    local config_file="$HOME/.config/bitsrun/bit-user.json"
    local content="{
    \"username\": \"$USER_NAME\",
    \"password\": \"$PASSWORD\"
}"

    if [ ! -f "$config_file" ]; then
        mkdir -p "$(dirname "$config_file")"
        echo "$content" > "$config_file"
        chmod 600 "$config_file"
    else
        if [ ! -s "$config_file" ]; then
            echo "$content" > "$config_file"
        fi
        chmod 600 "$config_file"
    fi
}

check_status() {
    status_output=$(bitsrun status --json)

    timestamp="[$(date +'%Y-%m.%d_%H:%M:%S')]"

    if echo "$status_output" | grep -q '"user_name"'; then
        echo "$timestamp Status is OK."
    else
        echo "$timestamp User is not logged in. Logging in..."

        for retry in 1 2 3; do
            echo "$timestamp Login attempt $retry/3."
            /root/.local/bin/bitsrun login

            sleep 10

            status_output=$(bitsrun status --json)

            if echo "$status_output" | grep -q '"user_name"'; then
                echo "$timestamp Login successful."
                return
            fi
        done

        echo "$timestamp Login failed 3 times. Rebooting router."
        sync
        /sbin/reboot
    fi
}

start_openclash() {
    rm -f /etc/openclash/GeoSite.dat
    cp /root/GeoSite.dat /etc/openclash/

    mkdir -p /etc/openclash/core/
    cp /root/clash /etc/openclash/core/
}

handle_bit_user_json
start_openclash

while true; do
    check_status
    sleep $PERIOD
done
