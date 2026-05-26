# Raspberry Pi Local Copy

Source:

- Host: `pi@150.43.204.13`
- Hostname: `kitazakizero`
- Remote home: `/home/pi`

Local copy:

- `kitazakizero-home/`: copied `/home/pi/`
- `kitazakizero-system/`: OS, cron, systemd, apt, and pip snapshots
- `WORKLOG_2026-05-26.md`: consolidated worklog for camera, Lagoon, BLE Harvest, cron, and logging changes

Operational changes applied on 2026-05-26:

- Updated `/home/pi/BME280/shutter3.py`
- Installed `/home/pi/cron.txt` as root crontab
- Created `/home/pi/logs/camera.log`, `lagoon.log`, `harvest.log`, and `bme280.log`
- Set journald `Storage=persistent`
- Added `/home/pi/cron.camera-off.txt`, `/home/pi/cron.upload-off.txt`, and `/home/pi/24h-stability-test-plan.md`
- Moved unused files into `/home/pi/archive_20260526_maintenance/`
- Added `/home/pi/logs/incident_snapshot.sh`
- Added automatic incident snapshots:
  - `@reboot` after 180 seconds
  - every hour at minute 07

Incident logs:

- Main health log: `/home/pi/logs/healthcheck.log`
- Snapshot directory: `/home/pi/logs/incident_snapshots/`
- Latest snapshot symlink: `/home/pi/logs/incident_snapshots/latest.log`
- Local incident capture from setup: `kitazakizero-system/incident_20260526_175129/`

Important finding:

- `/home/pi/lagoon.py` starts Picamera2 and captures a 640x480 image before uploading.
- It is part of the camera stack, not upload-only.

BLE Harvest:

- `/home/pi/harvest_ble.py` reads INKBIRD ITH-11-B advertisements from `49:25:10:25:03:1D`.
- `harvest-ble.service` runs it continuously.
- CSV backup: `/home/pi/logs/ith11b_YYYYMMDD.csv`
- Service log: `/home/pi/logs/harvest_ble.log`
- Legacy BME280 `/home/pi/harvest.py` is preserved and backed up under `/home/pi/archive_20260526_maintenance/backups/`.

Excluded from the home copy:

- `.ssh/`
- `.cache/`
- `.local/share/Trash/`

Refresh command:

```sh
rsync -av --exclude=.ssh/ --exclude=.cache/ --exclude=.local/share/Trash/ -e 'ssh -i ./codex_raspberry_ed25519 -o BatchMode=yes' pi@150.43.204.13:/home/pi/ ./kitazakizero-home/
```
