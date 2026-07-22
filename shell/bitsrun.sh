#!/bin/bash

# https://euler0525.github.io/blogs//posts/ba0d09df/#%E6%A0%A1%E5%9B%AD%E7%BD%91%E8%87%AA%E5%8A%A8%E7%99%BB%E9%99%86
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
REBOOT_MARKER="/root/.bitsrun_reboot_attempted"


handle_bit_user_json() {
    local config_files=(
        "/etc/bit-user.json"
        "/etc/xdg/bitsrun/bit-user.json"
        "/root/.config/bitsrun/bit-user.json"
        "/root/.config/bit-user.json"
    )

    local content="{
    \"username\": \"$USER_NAME\",
    \"password\": \"$PASSWORD\"
}"

    local config_file

    for config_file in "${config_files[@]}"; do
        mkdir -p "$(dirname "$config_file")"
        echo "$content" > "$config_file"
        chmod 600 "$config_file"
    done
}

check_status() {
    status_output=$(bitsrun status --json)

    timestamp="[$(date +'%Y-%m.%d_%H:%M:%S')]"

    if echo "$status_output" | grep -q '"user_name"'; then
        echo "$timestamp Status is OK."

        rm -f "$REBOOT_MARKER"
    else
        echo "$timestamp User is not logged in. Logging in..."

        for retry in 1 2 3; do
            echo "$timestamp Login attempt $retry/3."
            /root/.local/bin/bitsrun login

            sleep 10

            status_output=$(bitsrun status --json)

            if echo "$status_output" | grep -q '"user_name"'; then
                echo "$timestamp Login successful."

                rm -f "$REBOOT_MARKER"
                return
            fi
        done

        if [ -f "$REBOOT_MARKER" ]; then
            echo "$timestamp Login failed after reboot. Router will not reboot again."
            return
        fi

        echo "$timestamp Login failed 3 times. Rebooting router once."
        touch "$REBOOT_MARKER"
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
    sleep "$PERIOD"
done

