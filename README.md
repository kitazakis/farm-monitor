# Farm Monitor

Raspberry Pi Zero 2 Wによる農業IoT定点観測システムのGitHub Pagesダッシュボードです。

公開URL:

https://kitazakis.github.io/farm-monitor/

## 役割分担

このリポジトリは、Webサイトと観測データをブランチで分離します。

- `main`: GitHub Pages用Webサイト専用
- `data`: Raspberry PiがPushする観測データ専用

Raspberry Piは `main` を更新しません。Codexや人間がWebサイトを変更するときは `main` だけを更新します。

## ブランチ構成

### main

```text
docs/
  index.html
  style.css
  app.js
  data/                 # GitHub Actionsがdataブランチから自動生成
.github/
  workflows/
    publish.yml
    sync-data-to-main.yml
README.md
```

`docs/data/` は手編集禁止です。`data` ブランチの内容をGitHub Actionsがコピーします。

### data

```text
current/
  latest.json
logs/
  2026/
    06/
      ith11b_2026-06.csv
images/
  latest.jpg
.github/
  workflows/
    sync-data-to-main.yml
```

`data` ブランチにWebページのHTML/CSS/JavaScriptは置きません。`.github/workflows/sync-data-to-main.yml` は、`data` ブランチへのPushを検知するための同期専用workflowです。

## データ形式

### latest.json

`current/latest.json` は現在値表示に使います。

```json
{
  "timestamp": "2026-06-15 15:57:29",
  "temperature": 24.7,
  "humidity": 46.5,
  "battery": 100,
  "rssi": -27
}
```

### 月次CSV

CSVは月単位で保存します。

```text
logs/YYYY/MM/ith11b_YYYY-MM.csv
```

例:

```csv
timestamp,temperature,humidity,battery,rssi
2026-06-15 15:56:51,24.8,46.3,100,-26
2026-06-15 15:57:29,24.7,46.5,100,-27
```

## 表示内容

GitHub Pagesは `docs/data/` のみを読みます。Raw GitHub URLには直接アクセスしません。

- 現在の温度
- 現在の湿度
- Battery
- RSSI
- 更新日時
- 最新画像
- 温度推移
- 湿度推移
- RSSI推移
- Battery推移

グラフはChart.jsで描画します。

## GitHub Actions

### dataブランチ更新時

`data` ブランチにPushされると、`sync-data-to-main.yml` が実行されます。

```text
data branch
  -> GitHub Actions
  -> main/docs/data
  -> GitHub Pages deploy
```

同期workflowは `current/`, `logs/`, `images/` を `main/docs/data/` へコピーし、同じworkflow内でPagesをデプロイします。`GITHUB_TOKEN` によるcommitは別workflowを連鎖起動しないため、同期workflow内でデプロイまで行います。

### mainブランチ更新時

WebサイトのHTML/CSS/JavaScriptやworkflowを変更した場合は、`publish.yml` が `docs/` をGitHub Pagesへデプロイします。

## Raspberry Pi運用フロー

Raspberry Piは `data` ブランチだけをcloneします。

```sh
git clone --branch data --single-branch git@github.com:kitazakis/farm-monitor.git farm-monitor-data
cd farm-monitor-data
```

観測時の処理は次だけです。

```text
BLE取得
CSV更新
latest.json更新
Camera撮影
latest.jpg更新
git add current/latest.json logs/YYYY/MM/ith11b_YYYY-MM.csv images/latest.jpg
git commit -m "Update observation YYYY-MM-DD HH:MM:SS"
git pull --rebase --autostash origin data
git push origin data
```

Push前に `git pull --rebase --autostash origin data` を実行すると、dataブランチ上の最新状態を取り込んでからPushできます。Raspberry PiはWebソースを持たないため、HTML/CSS/JavaScriptとの競合は発生しません。

## センサー追加

照度、土壌水分、EC、pH、気圧、雨量などを追加する場合は、CSVと `latest.json` に列/キーを追加します。

例:

```csv
timestamp,temperature,humidity,battery,rssi,illuminance,soil_moisture,ec,ph
```

`docs/app.js` には代表的な追加センサーの定義を用意しています。未定義の列もCSVとしては維持できるため、表示が必要になった時点で `FIELD_DEFINITIONS` に追加します。

## 長期運用の方針

- CSVは月単位に分割します。
- Pagesは最新月のCSVだけをグラフ表示します。
- 最新画像は `images/latest.jpg` のみを上書きします。
- 履歴画像を保存する場合は、Gitリポジトリが肥大化しやすいため、日次・異常時のみなどに制限します。

この構成により、Raspberry Piは観測データをPushするだけ、GitHubは受け取ったデータをPagesへ表示するだけ、という役割分担になります。
