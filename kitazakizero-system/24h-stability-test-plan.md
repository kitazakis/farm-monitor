# 24h Stability Test Plan

Current network route at setup time:

- Default route: `wlan0` via `150.43.204.30`, metric 600
- LTE route: `wwan0` via `10.245.159.196`, metric 700
- Active connections: `preconfigured` on `wlan0`, `soracom` on `cdc-wdm0`

Cron profiles on the Raspberry Pi:

- Normal: `/home/pi/cron.txt`
- Camera off: `/home/pi/cron.camera-off.txt`
- Upload off: `/home/pi/cron.upload-off.txt`
- BLE Harvest service: `harvest-ble.service`

Important note:

- `/home/pi/lagoon.py` is not upload-only. It starts Picamera2, captures a 640x480 image, then uploads it to SORACOM Harvest Files.
- Therefore, camera-off testing must disable both `shutter3.py` and `lagoon.py`.
- BME280 cron and legacy `/home/pi/harvest.py` cron are disabled. ITH-11-B data upload runs through `harvest-ble.service`.

Apply a profile:

```sh
sudo crontab /home/pi/cron.txt
sudo crontab /home/pi/cron.camera-off.txt
sudo crontab /home/pi/cron.upload-off.txt
```

Suggested isolation order:

1. Normal profile for 24h with camera connected and LTE connected.
2. Camera off profile for 24h with LTE connected. This disables both `shutter3.py` and `lagoon.py`.
3. Upload off profile for 24h with camera connected. This disables `lagoon.py`; also stop `harvest-ble.service`.
4. LTE off only when Wi-Fi or console access is confirmed:

```sh
nmcli con down soracom
nmcli con up soracom
```

BLE Harvest controls:

```sh
sudo systemctl status harvest-ble --no-pager
sudo systemctl stop harvest-ble
sudo systemctl start harvest-ble
journalctl -u harvest-ble -n 100 --no-pager
tail -100 /home/pi/logs/harvest_ble.log
tail -20 /home/pi/logs/ith11b_$(date +%Y%m%d).csv
```

Evidence to collect after each phase:

```sh
sudo crontab -l
ls -lh /home/pi/logs/incident_snapshots
tail -200 /home/pi/logs/incident_snapshots/latest.log
tail -200 /home/pi/logs/healthcheck.log
tail -200 /home/pi/logs/camera.log
tail -200 /home/pi/logs/harvest.log
tail -200 /home/pi/logs/lagoon.log
sudo tail -200 /var/log/soracom_status.log
journalctl -b -1 --no-pager > /home/pi/logs/journal_prevboot.log
vcgencmd get_throttled
```

Automatic snapshots:

- `/home/pi/logs/incident_snapshot.sh` captures OS, power, network, modem, process, cron, separated app logs, SORACOM status, current journal, and previous boot journal.
- It runs automatically after reboot and hourly at minute 07.
- Manual capture:

```sh
/home/pi/logs/incident_snapshot.sh manual
```

Interpretation:

- Reboot only with camera enabled: camera stack remains first suspect.
- Upload stops while healthcheck continues: LTE/upload stack remains first suspect.
- Modem reconnects without camera activity: LTE/modem/power path remains first suspect.
- `throttled` non-zero or USB reset/disconnect in journal: power/USB path should be investigated before software changes.
