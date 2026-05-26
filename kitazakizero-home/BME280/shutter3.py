# -*- coding: utf-8 -*-
import subprocess
import os
import sys
import traceback
from time import sleep

shutter_numb = 0
photo_dir = os.path.expanduser('/home/pi/BME280/photo')

def cameraLoad():
    """
    カメラのシャッターカウントをファイルから読み込みます。
    ファイルが存在しない場合は、初期値0として扱われます。
    """
    global shutter_numb
    filename = os.path.join(photo_dir, 'camera.set')
    try:
        # ファイルが存在しない場合に備えてディレクトリを作成
        os.makedirs(photo_dir, exist_ok=True)
        with open(filename, 'r') as fp:
            tmp_shutter_numb = fp.readlines()
            tmp2_shutter_numb = tmp_shutter_numb[0].rstrip()
            shutter_numb = int(tmp2_shutter_numb)
        print(f"Loaded shutter number: {shutter_numb}")
    except FileNotFoundError:
        print('No camera.set data found. Initializing shutter number to 0.')
        shutter_numb = 0 # ファイルがない場合は初期値を0に設定
        cameraSave() # 新しいファイルを作成
    except Exception as e:
        print(f"Error loading camera.set: {e}")
        shutter_numb = 0 # エラー時は初期値を0に設定

def cameraSave():
    """
    現在のシャッターカウントをファイルに保存します。
    """
    filename = os.path.join(photo_dir, 'camera.set')
    try:
        # ファイルが存在しない場合に備えてディレクトリを作成
        os.makedirs(photo_dir, exist_ok=True)
        with open(filename, 'w') as fp:
            fp.write(str(shutter_numb))
        print(f"Saved shutter number: {shutter_numb}")
    except Exception as e:
        print(f"Error saving camera.set: {e}")

def shutter():
    """
    カメラを使用して写真を撮影し、シャッターカウントをインクリメントします。
    """
    global shutter_numb
    shutter_numb += 1

    # ファイル名を生成 (例: 000001.jpg)
    filename = os.path.join(photo_dir, str("{0:06d}".format(shutter_numb)) + '.jpg')

    picam2 = None

    try:
        print("Importing Picamera2...")
        from picamera2 import Picamera2
        print("Picamera2 imported.")

        camera_info = Picamera2.global_camera_info()
        print(f"Camera info: {camera_info}")
        if not camera_info:
            raise RuntimeError("No libcamera cameras available.")

        # Picamera2 オブジェクトを作成
        picam2 = Picamera2()

        # 静止画撮影用の設定を作成し、解像度を設定
        camera_config = picam2.create_still_configuration(main={"size": (1296, 972)})
        picam2.configure(camera_config)

        # カメラを開始
        picam2.start()
        print("Camera started.")

        # カメラが安定するまで待機
        sleep(1.000)

        # 画像をキャプチャして指定されたファイルパスに保存
        picam2.capture_file(filename)
        print(f"Photo captured: {filename}")
        return True

    except Exception as e:
        print(f"Error during camera operation: {e}")
        traceback.print_exc()
        return False
    finally:
        if picam2 is not None:
            try:
                if picam2.started:
                    picam2.stop()
                    print("Camera stopped.")
            except Exception:
                pass

            try:
                picam2.close()
            except Exception:
                pass

if __name__ == '__main__':
    cameraLoad() # シャッターカウントを読み込む
    if shutter():    # 写真を撮影する
        cameraSave() # シャッターカウントを保存する
    else:
        sys.exit(1)
