#!/bin/sh
# Redmi AX6000 (OpenWrt / BusyBox ash) campus-network keepalive with srun-rust.
# Upstream: https://github.com/0xha0/srun-rust
# Install the aarch64-unknown-linux-musl `srun` binary at /usr/bin/srun.
# Configure the account ON THE ROUTER before starting this script:
#   srun -c /etc/srun/config.json user add YOUR_USERNAME
# The password is prompted for and saved in a private config file.
# Keep this script's original filename for existing startup jobs.

umask 077

SRUN_BIN="${SRUN_BIN:-/usr/bin/srun}"
SRUN_CONFIG="${SRUN_CONFIG:-/etc/srun/config.json}"
PERIOD="${PERIOD:-300}"
LOG_FILE_PATH="${LOG_FILE_PATH:-/tmp/srun.log}"

log() {
    printf '[%s] %s\n' "$(date '+%F %T')" "$*" >> "$LOG_FILE_PATH"
}

# Preserve the old OpenClash setup, without deleting a working file when
# /root/GeoSite.dat or /root/clash is missing.
start_openclash() {
    [ -d /etc/openclash ] || return 0

    if [ -f /root/GeoSite.dat ]; then
        cp /root/GeoSite.dat /etc/openclash/GeoSite.dat || log 'WARN: failed to copy GeoSite.dat'
    fi

    if [ -f /root/clash ]; then
        if mkdir -p /etc/openclash/core && cp /root/clash /etc/openclash/core/clash; then
            chmod +x /etc/openclash/core/clash || log 'WARN: failed to chmod clash'
        else
            log 'WARN: failed to install OpenClash core'
        fi
    fi
}

case "$PERIOD" in
    ''|*[!0-9]*)
        log "ERROR: PERIOD must be a positive number of seconds: $PERIOD"
        exit 2
        ;;
esac
if [ "$PERIOD" -lt 1 ]; then
    log 'ERROR: PERIOD must be at least 1 second'
    exit 2
fi

if [ ! -x "$SRUN_BIN" ]; then
    log "ERROR: srun executable not found: $SRUN_BIN"
    exit 1
fi

if [ ! -s "$SRUN_CONFIG" ]; then
    log "ERROR: config missing/empty: $SRUN_CONFIG"
    log "Run: $SRUN_BIN -c $SRUN_CONFIG user add YOUR_USERNAME"
    exit 1
fi

if ! "$SRUN_BIN" version >> "$LOG_FILE_PATH" 2>&1; then
    log 'ERROR: srun cannot execute (check AX6000 aarch64/musl binary)'
    exit 1
fi

start_openclash
log "Starting srun daemon (interval=${PERIOD}s, config=$SRUN_CONFIG)"
# Native daemon handles status checks, reauthentication and retry backoff.
# Keep in the foreground; use OpenWrt procd to restart it if it crashes.
exec "$SRUN_BIN" -c "$SRUN_CONFIG" daemon --interval "$PERIOD" --probe server >> "$LOG_FILE_PATH" 2>&1
