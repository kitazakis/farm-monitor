#!/bin/bash

LOG=/home/pi/logs/healthcheck.log

{
  echo "===== $(date '+%F %T') ====="
  /usr/bin/vcgencmd measure_temp
  /usr/bin/vcgencmd get_throttled
  /usr/bin/uptime
  /usr/bin/free -m | /usr/bin/head -2
  /usr/bin/df -h /
  /usr/sbin/ip -brief a
  /usr/sbin/ip route
  /usr/bin/nmcli device status
  if command -v mmcli >/dev/null 2>&1; then
    /usr/bin/timeout 8 /usr/bin/mmcli -m 0 2>&1 | /usr/bin/grep -E 'state:|power state:|access tech:|signal quality:|operator name:|registration:|packet service state:' || true
  fi
  echo
} >> "$LOG" 2>&1
