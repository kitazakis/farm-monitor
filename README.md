# Farm Monitor

Raspberry Piによる農業IoT定点観測システムのWebダッシュボードです。GitHub Pagesで公開し、ブラウザから温湿度計の最新値、推移グラフ、最新画像を確認できます。

公開URL:

https://kitazakis.github.io/farm-monitor/

## 方針

GitHub Pages側では、Raspberry PiからPushされた実データをそのまま読み込みます。ラズパイ側は次の2ファイルを更新してGitHubへPushするだけで、画面表示が更新されます。

- `data/ith11b_log.csv`
- `images/latest.jpg`

`latest.json` などの中間JSONは使用しません。

## 構成

```text
docs/
  index.html
  style.css
  app.js
data/
  ith11b_log.csv
images/
  latest.jpg
.github/
  workflows/
    publish.yml
README.md
```

## 表示内容

- 現在の観測値: CSV最新行から温度、湿度、バッテリー残量、RSSI、更新日時を表示
- 最新画像: `images/latest.jpg`
- グラフ: CSV全体から温度、湿度、バッテリー残量、RSSIの推移を表示

画像が存在しない場合、画面には `No Image` と表示されます。

## CSV形式

Raspberry Piが保存する `data/ith11b_log.csv` は次の形式です。

```csv
timestamp,temperature,humidity,battery,rssi
2026-06-15 15:56:51,24.8,46.3,100,-26
2026-06-15 15:57:29,24.7,46.5,100,-27
```

`docs/app.js` はこのCSVを直接読み込み、最後のデータ行を現在値として扱います。過去データはすべてグラフに反映されます。

## 拡張

将来、照度、土壌水分、EC、pHなどを追加する場合は、CSVに列を追加し、`docs/app.js` の次の定義に項目を追加します。

- `FIELD_ALIASES`: CSV列名と画面内部キーの対応
- `METRICS`: 現在値カードに表示する項目
- `CHART_FIELDS`: グラフに表示する項目

この構成により、ラズパイ側のCSV出力を増やすだけで表示項目を拡張しやすくしています。

## GitHub Pages

`.github/workflows/publish.yml` は `main` ブランチへのPush時に実行されます。`docs/` を公開ルートへ配置し、`data/ith11b_log.csv` と `images/latest.jpg` を同じ公開ルートへコピーしてGitHub Pagesへデプロイします。

GitHub側では、PagesのSourceをGitHub Actionsに設定してください。

## ローカル確認

リポジトリ直下で簡易HTTPサーバーを起動します。

```sh
python3 -m http.server 8000
```

その後、ブラウザで次を開きます。

```text
http://localhost:8000/docs/
```

本番環境ではActionsが `docs/index.html` を公開ルートへ展開するため、`https://kitazakis.github.io/farm-monitor/` で表示されます。

## 今回の対象外

今回はGitHub側の表示環境のみを対象としています。ラズパイ側のPythonプログラム、Git自動Push、Harvest連携、メール送信機能は含めていません。
