---
name: manage-novels
description: >-
  小説作品の新規追加・編集・書影生成/設定・表示順繰り下げ・ステータス更新を行うスキル。config.json への作品登録、なろう/カクヨムからの情報自動抽出、AI書影生成、集計更新（scripts/update_data.py）の手順を網羅。
---

# 作品管理スキル (manage-novels)

監視対象のWeb小説作品の新規追加、既存作品の編集、表示順（`order`）の挿入・繰り下げ、Antigravity画像生成機能による書影作成、および集計更新の標準手順です。

---

## 関連ファイル

- [config.json](../../../config.json): 監視対象作品の設定ファイル
- [covers/](../../../covers/): 書影画像の格納ディレクトリ（規格: 896 × 1200 px, JPEG）
- [rankings_manual.json](../../../rankings_manual.json): 手動ランキング記録（新規作品登録時にキーを追加）
- [scripts/update_data.py](../../../scripts/update_data.py): 集計スクリプト
- [data.js](../../../data.js): 集計出力データ（フロントエンド読込用）

---

## 1. 作品情報の抽出ノウハウ

ユーザーから作品URL（なろう・カクヨム）が提供された場合、各サービスから自動でメタデータを取得・補完します。

### なろう公式APIからの情報取得
```pwsh
python -c "import urllib.request, json; res = urllib.request.urlopen('https://api.syosetu.com/novelapi/api/?ncode={ncode}&out=json').read(); print(res.decode('utf-8'))"
```
- `title`: 正式タイトル
- `story`: あらすじ・作品概要
- `keyword`: タグ選定の参考（3〜5個を選定）
- `genre`: なろうジャンルコード（101: 異世界恋愛, 201: ハイファンタジー, 202: ローファンタジー, 302: ヒューマンドラマ 等）

### カクヨム作品ページからの情報取得
カクヨムURL `https://kakuyomu.jp/works/{kakuyomuId}` の HTML 内にある `__NEXT_DATA__` から取得:
- `catchphrase`: `mood`（キャッチコピー）としてそのまま活用可能
- `genre`: カクヨムジャンル（DRAMA → 「現代ドラマ」, FANTASY → 「ハイファンタジー」/「ローファンタジー」 等）

### フィールド設定ルール
- `shortTitle`: 本棚や背表紙用の短縮タイトル。長文タイトルの場合、`〜` や `―` の前のメインタイトルを採用。
- `status`: 新規追加時は基本的に `"ongoing"`（連載中）。完結作品は `"done"`。
- `cover`: 原則 `"covers/{ncode}.jpg"` と指定（画像未作成時でもフロント側で縦書き自動装丁が働くため安全）。

---

## 2. 表示順（`order`）の挿入と繰り下げノウハウ

「新規作品を作品番号 X に設定し、既存の X 以降を繰り下げる」場合の処理手順:

1. `config.json` の `"books"` 配列内で、インデックス `X - 1` の位置に新規エントリを挿入する。
2. 新規エントリの `"order"` を `X` に設定する。
3. 既存の `order >= X` であるすべての作品エントリの `"order"` を順に `+1` 繰り下げる。
4. `"books"` 配列の並び順も `order` の昇順と一致させる。

---

## 3. 書影（カバー）画像の生成と配置ノウハウ

ユーザーから「書影画像を作成してほしい」と依頼された場合、**Antigravityの画像生成サブエージェント（`image-generator`）** を利用します。
※注意: `tapnow` ツールはユーザーの明示的な許可がない限り絶対に使用禁止。

### ステップ 3-1: `image-generator` サブエージェントの呼び出し
`invoke_subagent` ツールを使用します:
- `TypeName`: `"image-generator"`
- `Role`: `"Cover Image Generator"`
- `Prompt` に以下の要素を必ず盛り込む:
  1. **作品世界観・モチーフの具体指示**: キャラクターの外見・服装・表情、料理や小道具、店内の照明・湯気・空気感、アニメ/ライトノベル調の高品質なデジタルイラスト。
  2. **【最重要】完全テキストレス制約**:
     - **「タイトルロゴ、著者名、キャッチコピー、本・雑誌のようなタイポグラフィ、看板やメニュー等の不自然な文字情報は一切含めない（完全テキストレス、No text, no letters, no typography）」** を強く指示する。
  3. **アスペクト比**: 縦長（3:4 または 2:3、単行本・文庫本比率）。

### ステップ 3-2: 規格サイズへのリサイズと配置
サブエージェントが生成した画像を、既存書影の標準規格である **896 × 1200 px**（JPEG）にリサイズして配置します。

```python
from PIL import Image

src = r"<サブエージェントが出力した画像パス>"
dst = r"covers\<ncode>.jpg"

with Image.open(src) as img:
    resized = img.resize((896, 1200), Image.Resampling.LANCZOS)
    resized.save(dst, format="JPEG", quality=92)
```

---

## 4. `rankings_manual.json` の更新

新規作品の Nコード に対応する空の配列エントリを追加します。
```json
{
  "n2852mz": [],
  ...
}
```

---

## 5. JSON構文チェックと集計更新

### ステップ 5-1: JSON構文チェック
構文エラーがあると集計スクリプトが停止するため、必ず事前に検証します。
```pwsh
python -c "import json; json.load(open('config.json', encoding='utf-8')); json.load(open('rankings_manual.json', encoding='utf-8')); print('JSON Syntax OK')"
```

### ステップ 5-2: 集計スクリプト実行
```pwsh
python scripts/update_data.py
```
- 出力ログを確認し、新規作品および全作品が `OK: {ncode}` で完了することを確認。
- 最終行に `Wrote data.js with XX books.` と出力されれば正常完了。

---

## 6. チェックリスト（完了確認）

- [ ] `config.json` に新作品が正しく挿入され、以降の作品の `order` が重複なく連番で繰り下げられているか
- [ ] `shortTitle` や `genre`, `mood` が適切に設定されているか
- [ ] `rankings_manual.json` に空キー `"{ncode}": []` が追加されているか
- [ ] JSON構文チェックでエラーが出ないか
- [ ] 書影生成を依頼された場合、文字なし（テキストレス）で 896×1200 px の `covers/{ncode}.jpg` が配置されているか
- [ ] `python scripts/update_data.py` がエラーなく完走し、`data.js` に全作品が反映されたか
- [ ] 報告フォーマット（【新規実行・生成したもの】【既存のまま流用したもの】【スキップ・省略した工程】）を厳守して報告したか
