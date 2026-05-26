# -*- coding: utf-8 -*-
import os
import time
import traceback
import requests
from datetime import datetime

# 設定
PHOTO_DIR = os.path.expanduser('/home/pi/BME280/photo')
# ログファイルのパスをユーザーのホームディレクトリ内のログディレクトリに変更
# これにより、sudoなしでスクリプトを実行した場合でもログを書き込めるようになります。
LOG_DIR = os.path.expanduser('~/logs') # 例: /home/pi/logs
LOG_FILE = os.path.join(LOG_DIR, 'cam-upload.log')
SORACOM_HARVEST_URL = "http://harvest-files.soracom.io/PostCamera/"
IMAGE_WIDTH = 640
IMAGE_HEIGHT = 480
CAMERA_WARMUP_SEC = 1
UPLOAD_TIMEOUT = (10, 30)

def write_log(message):
    """ログファイルにメッセージを追記します。"""
    # ログディレクトリが存在しない場合は作成
    os.makedirs(LOG_DIR, exist_ok=True)
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(LOG_FILE, 'a') as f:
        f.write(f"[{timestamp}] {message}\n")

def main():
    write_log("Script started.")

    # photo ディレクトリが存在しない場合は作成
    os.makedirs(PHOTO_DIR, exist_ok=True)

    # temp_image_path を try ブロックの前に初期化
    # これにより、try ブロック内でエラーが発生した場合でも finally ブロックや
    # その後のコードで変数が未定義になることを防ぎます。
    temp_image_path = os.path.join(PHOTO_DIR, 'image.png')
    picam2 = None

    try:
        write_log("Importing Picamera2...")
        from picamera2 import Picamera2
        write_log("Picamera2 imported.")

        camera_info = Picamera2.global_camera_info()
        write_log(f"Camera info: {camera_info}")
        if not camera_info:
            raise RuntimeError("No libcamera cameras available.")

        # Picamera2 オブジェクトを作成
        write_log("Attempting to create Picamera2 object...")
        picam2 = Picamera2()
        write_log("Picamera2 object created.")

        write_log("Attempting to create camera configuration...")
        # 静止画撮影用の設定を作成
        # mainストリームで指定された解像度でキャプチャします。
        # 'encode="lores"' を削除しました。これにより、mainストリームがデフォルトでエンコードされます。
        camera_config = picam2.create_still_configuration(
            main={"size": (IMAGE_WIDTH, IMAGE_HEIGHT)}
        )
        write_log("Camera configuration created.")

        write_log("Attempting to apply camera configuration...")
        picam2.configure(camera_config)
        write_log("Camera configuration applied successfully.")

        write_log("Attempting to start camera...")
        picam2.start()
        write_log("Camera started successfully.")

        # カメラが安定するまで少し待機
        write_log(f"Waiting for camera to stabilize ({CAMERA_WARMUP_SEC} second)...")
        time.sleep(CAMERA_WARMUP_SEC) # raspistillの-t 5msはプレビュー時間なので、ここでは安定化のために1秒待機
        write_log("Camera stabilization complete.")

        write_log(f"Temporary image path set to: {temp_image_path}")

        # 画像をキャプチャして一時ファイルに保存
        write_log("Capturing image...")
        picam2.capture_file(temp_image_path)
        write_log(f"Image captured to {temp_image_path}")

        # SORACOM Harvest Filesにアップロード
        upload_filename = f"image{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
        upload_url = SORACOM_HARVEST_URL + upload_filename

        write_log(f"Opening image file for upload: {temp_image_path}")
        with open(temp_image_path, 'rb') as f:
            image_data = f.read()
        write_log("Image file read.")

        headers = {'Content-Type': 'image/png'}
        write_log(f"Uploading image to {upload_url}...")
        response = requests.put(
            upload_url,
            data=image_data,
            headers=headers,
            timeout=UPLOAD_TIMEOUT,
        )

        if response.status_code == 200:
            write_log(f"Image uploaded successfully. Response: {response.text}")
        else:
            write_log(f"Image upload failed. Status Code: {response.status_code}, Response: {response.text}")

    except requests.exceptions.Timeout as e:
        write_log(f"Image upload timed out: {e}")
    except Exception as e:
        write_log(f"An error occurred: {e}")
        write_log(traceback.format_exc())
    finally:
        # カメラを停止
        if picam2 is not None:
            write_log("Attempting to stop camera...")
            try:
                if picam2.started:
                    picam2.stop()
                    write_log("Camera stopped.")
                else:
                    write_log("Camera was not started.")
            except Exception as e:
                write_log(f"Failed to stop camera cleanly: {e}")

            try:
                picam2.close() # Picamera2オブジェクトを閉じる
                write_log("Picamera2 object closed.")
            except Exception as e:
                write_log(f"Failed to close Picamera2 object: {e}")
        else:
            write_log("Picamera2 object was not created.")

        # 一時ファイルを削除 (オプション)
        # temp_image_path が None でないことを確認してから削除を試みます
        if temp_image_path and os.path.exists(temp_image_path):
            write_log(f"Attempting to remove temporary file: {temp_image_path}")
            os.remove(temp_image_path)
            write_log(f"Removed temporary file: {temp_image_path}")
        elif temp_image_path:
            write_log(f"Temporary file {temp_image_path} did not exist to remove.")
        else:
            write_log("Temporary file path was not set.")

    write_log("Script finished.")

if __name__ == '__main__':
    main()
