# coding: utf-8
"""
Read INKBIRD ITH-11-B BLE advertisements and send data to SORACOM Harvest.

Legacy BME280 code is intentionally left in /home/pi/harvest.py and is not
deleted. This file replaces the BME280 read path with BLE advertisement scans.
"""

import asyncio
import csv
import json
import os
import signal
import sys
import time
import traceback
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, Optional

import requests
from bleak import BleakScanner


HARVEST_URL = os.environ.get("HARVEST_URL", "http://harvest.soracom.io")
MANUFACTURER_ID = int(os.environ.get("ITH11B_MANUFACTURER_ID", "9545"), 0)
DEFAULT_MACS = "49:25:10:25:03:1D"
TARGET_MACS = [
    mac.strip().upper()
    for mac in os.environ.get("ITH11B_MACS", DEFAULT_MACS).split(",")
    if mac.strip()
]
LOG_DIR = os.environ.get("ITH11B_LOG_DIR", "/home/pi/logs")
PUBLISH_INTERVAL_SECONDS = int(os.environ.get("ITH11B_PUBLISH_INTERVAL_SECONDS", "1200"))
WARNING_INTERVAL_SECONDS = int(os.environ.get("ITH11B_WARNING_INTERVAL_SECONDS", "300"))
SCAN_RESTART_SECONDS = int(os.environ.get("ITH11B_SCAN_RESTART_SECONDS", "3600"))
HTTP_TIMEOUT_SECONDS = int(os.environ.get("ITH11B_HTTP_TIMEOUT_SECONDS", "10"))


@dataclass
class Sample:
    mac: str
    timestamp: str
    temperature: float
    humidity: float
    battery: int
    rssi: Optional[int]


latest_samples: Dict[str, Sample] = {}
last_seen: Dict[str, float] = {}
last_published: Dict[str, float] = {}
last_warning: Dict[str, float] = {}
stop_requested = False


def now_text() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def csv_path() -> str:
    return os.path.join(LOG_DIR, f"ith11b_{datetime.now().strftime('%Y%m%d')}.csv")


def decode_sample(mac: str, manufacturer_data: bytes, rssi: Optional[int]) -> Optional[Sample]:
    if len(manufacturer_data) < 10:
        print(f"[{now_text()}] WARNING short manufacturer data from {mac}: {manufacturer_data!r}", flush=True)
        return None

    temperature = int.from_bytes(manufacturer_data[4:6], "little") / 10
    humidity = int.from_bytes(manufacturer_data[6:8], "little") / 10
    battery = int.from_bytes(manufacturer_data[8:10], "little")

    return Sample(
        mac=mac,
        timestamp=now_text(),
        temperature=temperature,
        humidity=humidity,
        battery=battery,
        rssi=rssi,
    )


def print_sample(sample: Sample) -> None:
    print(f"[{sample.timestamp}]", flush=True)
    print(f"MAC={sample.mac}", flush=True)
    print(f"TEMP={sample.temperature:.1f}", flush=True)
    print(f"HUM={sample.humidity:.1f}", flush=True)
    print(f"BATT={sample.battery}", flush=True)
    print(f"RSSI={sample.rssi}", flush=True)


def write_csv(sample: Sample) -> None:
    os.makedirs(LOG_DIR, exist_ok=True)
    path = csv_path()
    needs_header = not os.path.exists(path) or os.path.getsize(path) == 0
    with open(path, "a", newline="") as fp:
        writer = csv.writer(fp)
        if needs_header:
            writer.writerow(["timestamp", "mac", "temp", "humidity", "battery", "rssi"])
        writer.writerow([
            sample.timestamp,
            sample.mac,
            f"{sample.temperature:.1f}",
            f"{sample.humidity:.1f}",
            sample.battery,
            sample.rssi,
        ])


def harvest_payload(sample: Sample) -> dict:
    payload = {
        "temp": round(sample.temperature, 1),
        "hum": round(sample.humidity, 1),
        "battery": sample.battery,
        "rssi": sample.rssi,
        "timestamp": sample.timestamp,
    }
    if len(TARGET_MACS) > 1:
        payload["mac"] = sample.mac
    return payload


def send_to_harvest(sample: Sample) -> None:
    payload = harvest_payload(sample)
    body = json.dumps(payload)
    response = requests.post(
        HARVEST_URL,
        data=body,
        headers={"Content-Type": "application/json"},
        timeout=HTTP_TIMEOUT_SECONDS,
    )
    print(f"[{now_text()}] harvest_status={response.status_code} payload={payload}", flush=True)


def handle_advertisement(device, advertisement_data) -> None:
    try:
        mac = device.address.upper()
        if mac not in TARGET_MACS:
            return

        data = advertisement_data.manufacturer_data.get(MANUFACTURER_ID)
        if data is None:
            return

        rssi = getattr(advertisement_data, "rssi", None)
        if rssi is None:
            rssi = getattr(device, "rssi", None)

        sample = decode_sample(mac, data, rssi)
        if sample is None:
            return

        latest_samples[mac] = sample
        last_seen[mac] = time.monotonic()
    except Exception as exc:
        print(f"[{now_text()}] WARNING advertisement handler error: {exc}", flush=True)
        traceback.print_exc()


async def publish_due_samples() -> None:
    now = time.monotonic()
    for mac, sample in list(latest_samples.items()):
        last = last_published.get(mac, 0)
        if now - last < PUBLISH_INTERVAL_SECONDS:
            continue

        print_sample(sample)
        try:
            write_csv(sample)
        except Exception as exc:
            print(f"[{now_text()}] WARNING csv write failed: {exc}", flush=True)
            traceback.print_exc()

        try:
            send_to_harvest(sample)
        except Exception as exc:
            print(f"[{now_text()}] WARNING harvest upload failed: {exc}", flush=True)
            traceback.print_exc()

        last_published[mac] = now


async def warn_missing_advertisements() -> None:
    now = time.monotonic()
    for mac in TARGET_MACS:
        seen = last_seen.get(mac)
        if seen is not None and now - seen < WARNING_INTERVAL_SECONDS:
            continue

        warned = last_warning.get(mac, 0)
        if now - warned < WARNING_INTERVAL_SECONDS:
            continue

        if seen is None:
            age_text = "never"
        else:
            age_text = f"{int(now - seen)}s ago"
        print(f"[{now_text()}] WARNING no advertisement from {mac}; last_seen={age_text}", flush=True)
        last_warning[mac] = now


async def scan_forever() -> None:
    print(f"[{now_text()}] harvest_ble starting", flush=True)
    print(f"[{now_text()}] targets={TARGET_MACS} manufacturer_id={MANUFACTURER_ID}", flush=True)
    print(f"[{now_text()}] publish_interval={PUBLISH_INTERVAL_SECONDS}s", flush=True)

    while not stop_requested:
        scanner = BleakScanner(detection_callback=handle_advertisement)
        try:
            print(f"[{now_text()}] BLE scan start", flush=True)
            await scanner.start()
            scan_started = time.monotonic()

            while not stop_requested and time.monotonic() - scan_started < SCAN_RESTART_SECONDS:
                await publish_due_samples()
                await warn_missing_advertisements()
                await asyncio.sleep(1)

        except asyncio.CancelledError:
            raise
        except Exception as exc:
            print(f"[{now_text()}] WARNING BLE scanner error: {exc}", flush=True)
            traceback.print_exc()
            await asyncio.sleep(10)
        finally:
            try:
                await scanner.stop()
                print(f"[{now_text()}] BLE scan stop", flush=True)
            except Exception as exc:
                print(f"[{now_text()}] WARNING BLE scanner stop error: {exc}", flush=True)
                traceback.print_exc()

        if not stop_requested:
            await asyncio.sleep(2)


def request_stop(signum, frame) -> None:
    global stop_requested
    stop_requested = True
    print(f"[{now_text()}] stop requested signal={signum}", flush=True)


def main() -> int:
    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)
    try:
        asyncio.run(scan_forever())
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
