# 本棚 PVモニタ (Novel PV Monitor) - AI運用ガイドライン & プロジェクトルール

本ファイルは、本プロジェクト「本棚 PVモニタ」においてAIエージェントが作業を行う際の基本方針、アーキテクチャ、データフロー、および厳守すべき制約事項を定めたものです。

---

## 1. プロジェクト概要

「小説家になろう」および「カクヨム」に投稿しているWeb小説のアクセス数（PV）、読了率、星評価、ランキング推移などを自動取得・集計し、和モダンな文芸本棚風UIで可視化するWebダッシュボードです。

- **ホスティング**: GitHub Pages（`main` ブランチのルートから静的ホスティング）
- **自動更新**: GitHub Actions（`.github/workflows/update-pv.yml`）により毎時定期実行
- **フロントエンド**: HTML5 / Vanilla CSS / Vanilla JS (ES6+) / Chart.js
- **集計エンジン**: Python 3.12+ (標準ライブラリ + `requests`)

---

## 2. ディレクトリ構成と役割

```text
├── .agents/                      # Antigravity AI設定フォルダ
│   ├── rules/                   # ディレクトリ特化ルール
│   └── skills/                  # 定常業務・ワークフロースキル群
│       ├── record-rankings/     # ランキング手動記録スキル
│       ├── manage-novels/       # 作品追加・編集スキル
│       └── update-pv-data/      # PV集計・キャッシュ管理スキル
├── .github/workflows/           # GitHub Actions ワークフロー定義
│   └── update-pv.yml            # 定期集計・自動プッシュワークフロー
├── covers/                      # 書影（表紙）画像フォルダ ({ncode}.jpg 等)
├── css/
│   └── style.css                # 和モダン・文芸調スタイルシート（明色・墨色対応）
├── js/
│   └── app.js                   # 本棚レンダリング、日付ピッカー、グラフ描画ロジック
├── scripts/
│   ├── update_data.py           # スクレイピング＆データ集計メインスクリプト
│   ├── naro_daily_pv_cache.json # なろう日別PVキャッシュ
│   ├── naro_episode_cache.json  # なろうエピソードPVキャッシュ
│   ├── kakuyomu_stats_cache.json# カクヨム統計（★・応援・フォロワー）キャッシュ
│   ├── kakuyomu_daily_cache.json# カクヨム日別PV差分追跡キャッシュ
│   └── rankings_auto.json       # なろうランキング自動検知キャッシュ
├── AGENTS.md                    # 本ガイドライン（常時適用ルール）
├── config.json                  # 監視対象作品の設定ファイル
├── data.js                      # 集計結果のJavaScriptデータ（自動生成）
├── index.html                   # メインWebダッシュボード
├── rankings_manual.json         # 手動ランキング記録データ
└── README.md                    # プロジェクトドキュメント
```

---

## 3. データパイプラインと依存関係

```
[config.json] (作品定義)
[rankings_manual.json] (手動記録)
       │
       ▼
[scripts/update_data.py] ◄── [KASASAGI / なろうAPI] & [カクヨム解析ページ]
       │
       ├─► scripts/*_cache.json (中間キャッシュ更新)
       │
       ▼
   [data.js] (window.NOVEL_DATA 出力)
       │
       ▼
[index.html] + [js/app.js] + [css/style.css] (ダッシュボード描画)
```

1. **設定変更**: 作品追加・編集は [config.json](./config.json) を編集。
2. **ランキング追加**: 手動記録は [rankings_manual.json](./rankings_manual.json) に追記。
3. **データ反映**: 必ず `python scripts/update_data.py` を実行して [data.js](./data.js) を再生成する。
4. **公開**: GitHub へプッシュすると GitHub Pages で自動公開される。

---

## 4. 厳守すべき開発・運用ルール

### 4.1. データ整合性と安全策
- **文字コードの厳守**: すべてのファイル（特に日本語を含むJSON/JS/Python）は **UTF-8（BOMなし）** で保存すること。
- **JSON構文の検証**: `config.json` や `rankings_manual.json` を編集した後は、スクリプト実行前に必ず JSON 構文チェックを行うこと。
  ```pwsh
  python -c "import json; json.load(open('config.json', encoding='utf-8')); print('config.json OK')"
  ```
- **キャッシュの直接改ざん禁止**: `scripts/*_cache.json` はスクリプトが整合性を保ちながら更新するため、破損復旧などの特別な理由がない限り手動で編集・削除しないこと。
- **データ生成の検証**: データ編集後は必ず `python scripts/update_data.py` を実行し、全作品が `OK: {ncode}` で完了し `Wrote data.js with XX books.` となることを確認すること。

### 4.2. フロントエンドとデザイン方針
- **文芸・和モダンUIの保持**: 本棚デザイン、和紙調の明色モード、墨色ダークモードの上品で落ち着いた世界観を崩さないこと。
- **書影フォールバック**: 書影画像（`covers/`）がない場合でも、縦書きタイトルと帯風バッジが自動で美しく装丁される仕組み（CSS装丁）を壊さないこと。
- **外部依存の制限**: 余計なCSSフレームワーク（Tailwind等）や重厚なライブラリを追加導入せず、Vanilla CSS/JS と Chart.js による軽量構成を維持すること。

### 4.3. 実行環境とシェル作法
- **OS**: Windows
- **シェル**: PowerShell (`pwsh`)
- **Python環境**: `python` コマンドで呼び出し可能（`requests` ライブラリ依存）。
- **ローカル確認**: ダッシュボードの動作確認は `python -m http.server 8088` を使用する。

---

## 5. スキル（ワークフロー）の活用

特定の作業を行う際は、対応するスキルを参照・実行してください。

| スキル名 | 格納場所 | 用途 |
| :--- | :--- | :--- |
| **`record-rankings`** | [.agents/skills/record-rankings/](./.agents/skills/record-rankings/SKILL.md) | なろう・カクヨムのランキング順位を手動記録・更新する |
| **`manage-novels`** | [.agents/skills/manage-novels/](./.agents/skills/manage-novels/SKILL.md) | 作品の新規登録、設定変更、書影設定、連載状態の更新 |
| **`update-pv-data`** | [.agents/skills/update-pv-data/](./.agents/skills/update-pv-data/SKILL.md) | PVデータの再取得・集計スクリプト実行・トラブルシューティング |
