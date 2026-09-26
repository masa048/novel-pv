# 本棚 PVモニタ (Novel PV Monitor)

「小説家になろう」と「カクヨム」に投稿している自作のアクセス数（PV）を、**1時間に1回自動取得・集計**し、美しい和モダンな文芸本棚風ダッシュボードで可視化するWebアプリケーションです。**GitHub Pages** で完全無料でホスティングできます。

---

## 🌟 主な機能

- **今日 & 任意の日付指定でのPV集計**:
  - 本日のPVだけでなく、「昨日」「前日」「カレンダー日付指定」で過去の任意の日付のPVを瞬時にチェックできます。
- **なろう & カクヨムを別々で集計・比較**:
  - なろうPV・カクヨムPV・合算PVを各作品ごと＆全体でクリアに分離集計。
  - プラットフォームごとの読者傾向や比率を可視化。
- **1時間に1回 自動取得 (GitHub Actions)**:
  - 毎時23分に GitHub Actions が自動巡回し、最新データを取得して自動プッシュ・反映。
  - 手動実行（Run workflow）にも対応しており、いつでも即時更新可能。
- **和モダン・文芸調の洗練されたUI**:
  - 単行本が並ぶ本棚風の美しいビジュアル（書影画像対応、画像なし時は縦書きの自動装丁）。
  - 明色モード（和紙調）と墨色モード（ダークテーマ）の切り替え。
- **充実のアナリティクス機能**:
  - **なろう**: 時間帯別PV（0〜23時）、流入デバイス構成比（スマホ/PC/アプリ）、全期間日別推移、話数別累計PV、ランキング履歴（上位300位以内自動検知）。
  - **カクヨム**: 話数別読了定着カーブ（第1話〜最新話）、フォロワー数、星評価、応援数。
- **3つのクロスプラットフォーム集計テーブル**:
  - ① 指定日（今日）の作品別PV一覧
  - ② 全期間 累計PV一覧
  - ③ 直近7日間の日別PV推移テーブル（ヒートマップ表示）

---

## 🚀 GitHub Pages への公開手順 (簡単3ステップ)

### ステップ1: GitHub にリポジトリを作成してプッシュ
本フォルダのコードを、ご自身の GitHub リポジトリ（例: `novel-pv`）にプッシュします。

```bash
git init
git add .
git commit -m "feat: initial commit for novel pv monitor"
git branch -M main
git remote add origin https://github.com/<あなたのユーザー名>/<リポジトリ名>.git
git push -u origin main
```

### ステップ2: GitHub Actions の権限を確認
GitHub のサーバーが自動で更新データをプッシュできるように、ワークフローの書き込み権限を有効化します。
1. GitHubリポジトリの **Settings** タブを開きます。
2. 左メニューの **Actions** > **General** を開きます。
3. 下部の **Workflow permissions** で **Read and write permissions** を選択し、**Save** をクリックします。

### ステップ3: GitHub Pages を有効化
1. リポジトリの **Settings** > **Pages** を開きます。
2. **Build and deployment** の Source で **Deploy from a branch** を選択。
3. Branch で `main`、フォルダは `/ (root)` を選択して **Save** をクリック。
4. 数分で `https://<あなたのユーザー名>.github.io/<リポジトリ名>/` にサイトが公開されます！

---

## 📖 自分の作品を登録・編集する方法

リポジトリ直下の `config.json` を開いて、ご自身の作品情報を追加・変更するだけです。

```json
{
  "books": [
    {
      "ncode": "n1234ab",
      "kakuyomuId": "1681692786028123456",
      "title": "あなたの作品の正式タイトル",
      "shortTitle": "本棚に表示する短縮タイトル",
      "status": "ongoing",
      "genre": "女性向け",
      "order": 1,
      "cover": "covers/my_work.jpg",
      "tags": ["異世界", "ざまぁ", "ハッピーエンド"],
      "mood": "作品の雰囲気・キャッチコピー"
    }
  ]
}
```

### 各項目の説明
- `ncode`: 小説家になろうのURLに含まれる Nコード（例: `https://ncode.syosetu.com/n1234ab/` の `n1234ab`）
- `kakuyomuId`: カクヨムのURLに含まれる作品ID（例: `https://kakuyomu.jp/works/1681692786028123456` の数字）
- `status`: 連載中は `"ongoing"`、完結済みの場合は `"done"`
- `genre`: 本棚のバッジに表示されます（例: `"女性向け"`, `"男性向け"`, `"歴史"` 等）
- `cover`: 表紙・書影画像（`covers/` フォルダ内に保存）。画像がない場合は自動で美麗な和風縦書きカバーが生成されます。
- `mood`: 詳細パネルに表示される作品の雰囲気や紹介文

※編集後、変更をコミットして GitHub にプッシュするか、ローカルで `python scripts/update_data.py` を実行すると即座にデータが更新されます。

---

## ⏱ データの自動更新 & 手動更新

- **自動更新**: `.github/workflows/update-pv.yml` により、**1時間に1回**（毎時23分）自動実行されます。
- **今すぐ手動で更新したい場合**:
  - GitHub リポジトリの **Actions** タブ > **Update Novel PV** > **Run workflow** ボタンをクリックすると、約1分で最新データが取得・コミット・プッシュされます。

---

## 💻 ローカルでの実行・確認

```bash
# 依存ライブラリのインストール
pip install requests

# データの取得・集計スクリプト実行
python scripts/update_data.py

# ローカルサーバー起動
python -m http.server 8088
```
ブラウザで `http://localhost:8088/` を開くと表示されます。

---

## 📁 ディレクトリ構成

```
├── .github/
│   └── workflows/
│       └── update-pv.yml          # 1時間ごとのGitHub Actionsワークフロー
├── config.json                    # 監視対象作品の設定ファイル
├── covers/                        # 書影画像フォルダ
├── data.js                        # 自動生成される集計データ
├── index.html                     # メインWebダッシュボード
├── css/
│   └── style.css                  # 和モダン・文芸調スタイルシート
├── js/
│   └── app.js                     # 日付指定・本棚・グラフ描画ロジック
├── scripts/
│   ├── update_data.py             # スクレイピング＆集計エンジン
│   ├── naro_daily_pv_cache.json   # なろう日別PVキャッシュ
│   ├── naro_episode_cache.json    # なろうエピソードPVキャッシュ
│   ├── kakuyomu_stats_cache.json  # カクヨム統計キャッシュ
│   ├── kakuyomu_daily_cache.json  # カクヨム日別PV追跡キャッシュ
│   └── rankings_auto.json         # なろうランキング自動検知キャッシュ
├── rankings_manual.json           # 手動ランキング記録（任意）
└── README.md
```
