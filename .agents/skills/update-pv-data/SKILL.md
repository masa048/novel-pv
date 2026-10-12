---
name: update-pv-data
description: >-
  PVデータの取得・再集計、キャッシュ管理、および集計スクリプト（scripts/update_data.py）の実行・トラブルシューティングを行うスキル。手動更新やデータ不整合の調査時に使用する。
---

# PV集計・キャッシュ管理スキル (update-pv-data)

このスキルは、小説家になろう（KASASAGI / API）およびカクヨムからPV・評価・ランキングデータを収集し、キャッシュを更新して [data.js](../../../data.js) を生成するデータパイプラインの実行および障害対応手順を定めたものです。

---

## 関連ファイル

- [scripts/update_data.py](../../../scripts/update_data.py): スクレイピング＆集計メインプログラム
- [data.js](../../../data.js): 集計結果のJavaScriptオブジェクト出力（フロントエンドで直接インポート）
- [.github/workflows/update-pv.yml](../../../.github/workflows/update-pv.yml): GitHub Actions 自動定期更新ワークフロー

### キャッシュファイル一覧

| ファイル | 役割 |
| :--- | :--- |
| `scripts/naro_daily_pv_cache.json` | なろうの確定日別PV履歴（2日前以前の確定データを永続保持） |
| `scripts/naro_episode_cache.json` | なろうの各話ごとの累計PV |
| `scripts/kakuyomu_stats_cache.json` | カクヨムの星・応援・フォロワー等の統計値スナップショット |
| `scripts/kakuyomu_daily_cache.json` | カクヨムの日別差分追跡キャッシュ（日次スナップショット差分から日別PVを算出） |
| `scripts/rankings_auto.json` | なろうランキングAPI自動検知キャッシュ（直近300位以内を自動検出） |

---

## 通常更新手順（ワークフロー）

### ステップ 1: スクリプトの実行
PowerShell から以下のコマンドを実行します。
```pwsh
python scripts/update_data.py
```

### ステップ 2: コンソール出力の検証
各作品ごとに以下のように処理が進み、最終的に `Wrote data.js with XX books.` が出力されることを確認します。

```text
Processing n8135mt (TS美少女神絵師になってVTuberの娘に狂わされる)...
  naro kasasagi OK
  kakuyomu analytics OK
  kakuyomu stats OK
  OK: n8135mt
...
Wrote data.js with 14 books.
```

- 各作品で `OK: {ncode}` が出ているか確認。
- エラーや例外スタックトレースが発生していないか確認。

### ステップ 3: ローカル確認（必要に応じて）
集計結果がWebUIで正しく描画されるかローカルサーバーで確認します。
```pwsh
python -m http.server 8088
```
- ブラウザで `http://localhost:8088/` を開き、本日のPV、グラフ、テーブルが最新化されていることを確認。

### ステップ 4: Git 差分の確認と反映
```pwsh
git status -s
```
更新されたファイル（`data.js`, `scripts/*.json`）をコミット・プッシュして GitHub Pages に反映します。

---

## トラブルシューティング

### 1. カクヨムのアクセス解析または作品ページ取得エラー
- **事象**: `kakuyomu analytics failed: 404 Client Error` やパースエラー
- **原因**: 
  - `config.json` の `kakuyomuId` が誤っている、または作品が非公開・削除されている。
  - カクヨム側のHTMLクラス名や構造が大幅に変更された。
- **対応**:
  - `config.json` の `kakuyomuId` を確認。
  - URL `https://kakuyomu.jp/works/{kakuyomuId}` に直接アクセス可能かブラウザで確認。

### 2. なろう KASASAGI アクセス解析エラー
- **事象**: `chart data not found for {ncode}`
- **原因**:
  - 投稿直後でまだアクセス解析ページが生成されていない。
  - KASASAGI側の定期メンテナンス中。
- **動作**:
  - スクリプト側でフォールバック（`empty_kasasagi()`）が動作し、集計全体は停止せずスキップされます。

### 3. カクヨムの日別PVが不整合・急変した場合
- カクヨムは日別PVの公式履歴APIがないため、本スクリプトが定期実行時のスナップショット差分（`kakuyomu_daily_cache.json`）から日別PVを推定・蓄積しています。
- キャッシュを誤って全削除すると、過去の日別PVの復元ができなくなるため注意してください。
- 特定の日付の差分に明らかな外れ値（異常値）が混入した場合は、`scripts/kakuyomu_daily_cache.json` 内の該当作品・該当日のエントリのみをピンポイントで修正してください。
