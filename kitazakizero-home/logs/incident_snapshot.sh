#!/bin/bash

set +e

REASON="${1:-manual}"
BASE="/home/pi/logs/incident_snapshots"
TS="$(date '+%Y%m%d_%H%M%S')"
OUT="${BASE}/${TS}_${REASON}.log"

mkdir -p "$BASE"

{
  echo "===== incident snapshot ====="
  echo "reason=${REASON}"
  echo "timestamp=$(date '+%F %T %Z')"
  echo

  echo "===== identity ====="
  hostname
  uptime
  who
  echo

  echo "===== reboot history ====="
  last -x reboot shutdown | head -20
  echo

  echo "===== power and resources ====="
  vcgencmd measure_temp 2>&1
  vcgencmd get_throttled 2>&1
  free -h
  df -h
  echo

  echo "===== network ====="
  ip route
  ip -brief addr
  nmcli device status 2>&1
  nmcli -f NAME,UUID,TYPE,DEVICE con show --active 2>&1
  echo

  echo "===== modem ====="
  timeout 10 mmcli -L 2>&1
  timeout 10 mmcli -m 0 2>&1
  echo

  echo "===== usb ====="
  lsusb 2>&1
  echo

  echo "===== processes ====="
  ps -eo pid,ppid,lstart,etimes,stat,pcpu,pmem,cmd --sort=-pcpu | head -50
  echo

  echo "===== crontab ====="
  echo "-- root --"
  sudo -n crontab -l 2>&1
  echo "-- pi --"
  crontab -l 2>&1
  echo

  echo "===== harvest-ble service ====="
  systemctl status harvest-ble.service --no-pager -n 80 2>&1
  echo

  echo "===== log files ====="
  ls -lh /home/pi/logs 2>&1
  echo

  echo "===== healthcheck tail ====="
  tail -180 /home/pi/logs/healthcheck.log 2>&1
  echo

  echo "===== camera tail ====="
  tail -160 /home/pi/logs/camera.log 2>&1
  echo

  echo "===== bme280 tail ====="
  tail -160 /home/pi/logs/bme280.log 2>&1
  echo

  echo "===== harvest tail ====="
  tail -160 /home/pi/logs/harvest.log 2>&1
  echo

  echo "===== harvest_ble tail ====="
  tail -180 /home/pi/logs/harvest_ble.log 2>&1
  echo

  echo "===== ith11b csv tail ====="
  tail -40 /home/pi/logs/ith11b_$(date '+%Y%m%d').csv 2>&1
  echo

  echo "===== lagoon tail ====="
  tail -160 /home/pi/logs/lagoon.log 2>&1
  echo

  echo "===== soracom status tail ====="
  sudo -n tail -220 /var/log/soracom_status.log 2>&1
  echo

  echo "===== journal boots ====="
  journalctl --list-boots --no-pager 2>&1
  echo

  echo "===== journal key services current boot ====="
  journalctl -b -u NetworkManager -u ModemManager -u cron --no-pager -n 300 2>&1
  echo

  echo "===== journal kernel current boot ====="
  journalctl -b -k --no-pager -n 300 2>&1
  echo

  echo "===== journal previous boot ====="
  journalctl -b -1 --no-pager -n 300 2>&1
} > "$OUT" 2>&1

ln -sfn "$OUT" "$BASE/latest.log"
find "$BASE" -type f -name '*.log' -mtime +14 -delete
echo "$OUT"
