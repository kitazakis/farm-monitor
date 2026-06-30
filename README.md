# Farm Monitor

農業IoT向けの定点観測ダッシュボードです。GitHub Pagesで公開し、ブラウザから最新の観測値、最新画像、温度・湿度・通信状態・バッテリー推移を確認できます。

公開URL:

https://kitazakis.github.io/farm-monitor/

## 構成

```text
docs/
  index.html
  style.css
  app.js
data/
  latest.json
  ith11b_log.csv
images/
  latest.jpg
.github/
  workflows/
    publish.yml
README.md
```

## 表示内容

- 現在の観測値: 温度、湿度、バッテリー残量、RSSI、更新日時
- 最新画像: `images/latest.jpg`
- グラフ: `data/ith11b_log.csv` から温度、湿度、バッテリー残量、RSSIを表示

画像が存在しない場合、画面には `No Image` と表示されます。

## データ形式

`data/latest.json`

```json
{
  "timestamp": "2026-06-30T08:30:00+09:00",
  "temperature_c": 27.4,
  "humidity_percent": 71,
  "battery_percent": 88,
  "rssi_dbm": -63,
  "image_timestamp": "2026-06-30T08:25:00+09:00"
}
```

`data/ith11b_log.csv`

```csv
timestamp,temperature_c,humidity_percent,battery_percent,rssi_dbm
2026-06-30T08:00:00+09:00,27.4,71,88,-63
```

将来、土壌水分、EC、pH、照度などを追加する場合は、CSV列と `docs/app.js` の `METRICS` または `CHART_FIELDS` に項目を追加してください。

## GitHub Pages

`.github/workflows/publish.yml` は `main` ブランチへのPush時に実行されます。`docs/` を公開ルートへ配置し、`data/` と `images/` を同じ公開ルートへコピーしてからGitHub Pagesへデプロイします。

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
