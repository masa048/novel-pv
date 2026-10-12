# 本棚 PVモニタ (Novel PV Monitor) - AI運用指示規則

## 1. プロジェクト概要・技術スタック
- **概要**: 「小説家になろう」「カクヨム」のPV・読了率・ランキングを集計し、和モダン本棚UIで可視化するWebダッシュボード
- **ホスティング**: GitHub Pages（`main` ブランチのルートから静的ホスティング）
- **自動更新**: GitHub Actions（`.github/workflows/update-pv.yml`）により定期実行
- **フロントエンド**: HTML5 / Vanilla CSS / Vanilla JS (ES6+) / Chart.js（フレームワーク不使用）
- **集計エンジン**: Python 3.12+ (`requests` ライブラリ依存)
- **実行環境**: Windows / PowerShell (`pwsh`)

---

## 2. 主要ファイル責務
- `config.json`: 監視対象作品の設定（ncode, kakuyomuId, タイトル, 表示順, 書影パス等）
- `rankings_manual.json`: 手動記録のランキング情報
- `scripts/update_data.py`: スクレイピング・キャッシュ管理・集計メインスクリプト
- `scripts/*_cache.json`: 中間キャッシュ群（※スクリプトが整合管理するため手動編集禁止）
- `data.js`: フロントエンド読込用データ（`update_data.py` が自動生成・直接編集禁止）
- `covers/`: 書影画像フォルダ（`{ncode}.jpg` 等）
- `index.html` / `css/style.css` / `js/app.js`: 和モダン本棚ダッシュボードUI

---

## 3. データフローと必須アクション
```text
[config.json] + [rankings_manual.json] 
  └─► [scripts/update_data.py] ◄── [なろう / カクヨム]
        ├─► [scripts/*_cache.json]
        └─► [data.js] ──► [index.html / js / css]
```
- 作品追加・設定変更時: `config.json` を編集
- ランキング記録時: `rankings_manual.json` に追記
- **データ反映義務**: データ定義変更後は必ず `python scripts/update_data.py` を実行し、`data.js` を再生成すること

---

## 4. 厳守事項・制約

### データ保全
- **文字コード**: 全ファイル UTF-8（BOMなし）厳守
- **JSON構文チェック**: 編集後はスクリプト実行前に必ず検証すること
  ```pwsh
  python -c "import json; json.load(open('config.json', encoding='utf-8')); json.load(open('rankings_manual.json', encoding='utf-8')); print('JSON OK')"
  ```
- **実行ログ確認**: スクリプト実行後、全作品が `OK: {ncode}` で完了し `Wrote data.js with XX books.` となることを確認すること

### フロントエンド・UI保持
- **世界観維持**: 和モダン・文芸調のトーン（和紙調明色モード、墨色ダークモード）を損なわないこと
- **書影フォールバック**: 表紙画像がない場合でも縦書きCSS自動装丁が正常動作する構造を維持すること
- **外部依存制限**: Tailwind等のCSSフレームワークを追加導入せず、Vanilla CSS/JS を維持すること

### コマンド作法
- 集計実行: `python scripts/update_data.py`
- ローカルプレビュー: `python -m http.server 8088`
