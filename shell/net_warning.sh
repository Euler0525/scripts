#!/bin/sh
# Network traffic monitoring script with threshold alerting
# Monitors specified network interfaces, logs traffic usage, and triggers alerts when exceeding defined thresholds

# List of network interfaces to monitor (excludes loopback interface 'lo')
# Uncomment and modify the line below to specify interfaces manually (e.g., NETWORK_INTERFACES=("eth0" "wlan0"))
NETWORK_INTERFACES=($(ls /sys/class/net | grep -v 'lo'))
# NETWORK_INTERFACES=("eth0")  # Manual interface specification example

# Alert threshold in GB (both upload and download)
WARNING_THRESHOLD_GB=10

# Monitoring interval in seconds (3600 = 1 hour)
CHECK_INTERVAL=3600

LOG_FILE="./network_alert.log"

log() {
    local message="$1"
    echo -e "$(date +"%F %T") $message" >> "$LOG_FILE"
}


while true; do
    declare -A RX_BYTES_INITIAL TX_BYTES_INITIAL RX_BYTES_FINAL TX_BYTES_FINAL

    # First sample: capture initial byte counts for all interfaces
    for INTERFACE in "${NETWORK_INTERFACES[@]}"; do
        RX_BYTES_INITIAL[$INTERFACE]=$(cat /sys/class/net/"$INTERFACE"/statistics/rx_bytes)
        TX_BYTES_INITIAL[$INTERFACE]=$(cat /sys/class/net/"$INTERFACE"/statistics/tx_bytes)
    done

    # Wait for specified monitoring interval
    sleep "$CHECK_INTERVAL"

    # Second sample: capture final byte counts after interval
    for INTERFACE in "${NETWORK_INTERFACES[@]}"; do
        RX_BYTES_FINAL[$INTERFACE]=$(cat /sys/class/net/"$INTERFACE"/statistics/rx_bytes)
        TX_BYTES_FINAL[$INTERFACE]=$(cat /sys/class/net/"$INTERFACE"/statistics/tx_bytes)
    done

    ALERT_MESSAGE=""

    # Calculate and process traffic data for each interface
    for INTERFACE in "${NETWORK_INTERFACES[@]}"; do
        # Calculate bytes transferred during interval
        RX_TOTAL=$((RX_BYTES_FINAL[$INTERFACE] - RX_BYTES_INITIAL[$INTERFACE]))
        TX_TOTAL=$((TX_BYTES_FINAL[$INTERFACE] - TX_BYTES_INITIAL[$INTERFACE]))
        
        RX_GB=$(echo "scale=2; $RX_TOTAL / 1024 / 1024 / 1024" | bc)
        TX_GB=$(echo "scale=2; $TX_TOTAL / 1024 / 1024 / 1024" | bc)

        # Convert bytes to MB (integer division)
        RX_MB=$((RX_TOTAL / 1024 / 1024))
        TX_MB=$((TX_TOTAL / 1024 / 1024))

        log "Interface $INTERFACE: Download ${RX_MB}MB (${RX_GB}GB), Upload ${TX_MB}MB (${TX_GB}GB)"

        # Check download threshold and add to alert if exceeded
        if [ $(echo "$RX_GB >= $WARNING_THRESHOLD_GB" | bc) -eq 1 ]; then
            ALERT_MESSAGE+="Interface $INTERFACE download traffic exceeded: ${RX_GB}GB (threshold: ${WARNING_THRESHOLD_GB}GB)\n"
        fi
        
        # Check upload threshold and add to alert if exceeded
        if [ $(echo "$TX_GB >= $WARNING_THRESHOLD_GB" | bc) -eq 1 ]; then
            ALERT_MESSAGE+="Interface $INTERFACE upload traffic exceeded: ${TX_GB}GB (threshold: ${WARNING_THRESHOLD_GB}GB)\n"
        fi
    done

    # Clean up temporary associative arrays to prevent memory leaks
    unset RX_BYTES_INITIAL TX_BYTES_INITIAL RX_BYTES_FINAL TX_BYTES_FINAL
done