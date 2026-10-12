# データ保全と整合性担保ルール (Data Integrity Rules)

本リポジトリで作品データやランキング情報、集計キャッシュを扱う際に厳守すべきデータ保全規約です。

---

## 1. JSON ファイルの検証義務

[config.json](../../config.json) や [rankings_manual.json](../../rankings_manual.json) を手動またはプログラムで編集した際は、**必ずスクリプト実行前に構文検証コマンドを実行**してください。

```pwsh
python -c "import json; json.load(open('config.json', encoding='utf-8')); json.load(open('rankings_manual.json', encoding='utf-8')); print('JSON Syntax OK')"
```

- 末尾の余分なカンマ（trailing comma）やクォーテーションのミスを放置してはならない。
- エンコーディングは常に UTF-8（BOMなし）。

---

## 2. 集計スクリプトの実行と整合性確認

データ定義や手動記録を変更した場合は、必ずデータ集計エンジンを実行して [data.js](../../data.js) の再生成までを完遂してください。

```pwsh
python scripts/update_data.py
```

- スクリプト出力の末尾に `Wrote data.js with XX books.` が出力されていることを確認する。
- 特定の作品でパースエラーやネットワークエラーが発生していないかコンソール出力を注視する。

---

## 3. キャッシュファイルの保護

`scripts/` 以下の各種キャッシュファイル（`*_cache.json`, `rankings_auto.json`）は、GitHub Actions やローカル実行時のアクセス負荷軽減および日別差分集計の基準点となります。

- 意図的なトラブルシューティング（壊れたキャッシュエントリの修復など）を除き、**キャッシュファイルを手動で一括削除・直接改変してはならない**。
- カクヨムの日別PVはスナップショット差分（`kakuyomu_daily_cache.json`）で管理されているため、キャッシュが消失すると過去の日別PVの復元が困難になる点に留意すること。

---

## 4. 変更差分の確認

Git コミットや作業完了報告を行う前に、必ず `git status` および `git diff` で意図しない変更（不要な空行、文字コード化け、破損）が含まれていないか点検すること。
