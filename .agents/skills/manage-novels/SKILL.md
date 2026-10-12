---
name: manage-novels
description: >-
  小説作品の新規追加・編集・書影設定・ステータス更新（連載中/完結）を行うスキル。config.json への作品登録や書影画像の配置、集計更新を行う時に使用する。
---

# 作品管理スキル (manage-novels)

このスキルは、監視対象のWeb小説作品を新規追加、既存作品の情報更新（連載状況・タイトル・ジャンル・表示順など）、および書影（表紙）画像の設定を行うための標準手順を定めたものです。

---

## 関連ファイル

- [config.json](../../../config.json): 監視対象作品の設定ファイル
- [covers/](../../../covers/): 書影画像の格納ディレクトリ
- [rankings_manual.json](../../../rankings_manual.json): 手動ランキング記録（新規作品登録時にキーを追加）
- [scripts/update_data.py](../../../scripts/update_data.py): 集計スクリプト
- [data.js](../../../data.js): 集計出力データ

---

## `config.json` 作品エントリ仕様

`config.json` の `"books"` 配列に格納する各作品のスキーマです。

```json
{
  "ncode": "n1234ab",
  "kakuyomuId": "1681692786028123456",
  "title": "作品の正式タイトル（長文可）",
  "shortTitle": "本棚・一覧用の短縮タイトル",
  "status": "ongoing",
  "genre": "ローファンタジー",
  "order": 1,
  "cover": "covers/n1234ab.jpg",
  "tags": [
    "タグ1",
    "タグ2"
  ],
  "mood": "作品のキャッチコピー・あらすじ導入"
}
```

### フィールド詳細

| フィールド | 必須 | 型 | 説明 |
| :--- | :---: | :--- | :--- |
| `ncode` | 必須 | string | 小説家になろうのNコード（小文字。例: `"n8135mt"`） |
| `kakuyomuId` | 任意 | string | カクヨム作品URLに含まれるID数字文字列。カクヨム未掲載の場合は省略可 |
| `title` | 必須 | string | 正式タイトル。詳細ダイアログやヘッダーに表示 |
| `shortTitle` | 必須 | string | 本棚の背表紙やテーブル等で視認性を高めるための短縮タイトル |
| `status` | 必須 | string | `"ongoing"`（連載中）または `"done"`（完結済み） |
| `genre` | 必須 | string | ジャンル（例: `"ローファンタジー"`, `"恋愛"`, `"ファンタジー"` など） |
| `order` | 必須 | integer | 本棚での表示順序。1からの連番または任意の昇順整数 |
| `cover` | 任意 | string | 書影画像の相対パス（例: `"covers/n1234ab.jpg"`）。未指定時は自動装丁カバー |
| `tags` | 任意 | array | タグ文字列の配列（例: `["TS", "VTuber", "コメディ"]`） |
| `mood` | 任意 | string | 詳細モーダルに表示されるキャッチコピー・紹介文 |
| `hot_override`| 任意 | boolean | `true` の場合、HOTバッジを強制表示 |

---

## 書影画像（カバー）の仕様

- **保存場所**: [covers/](../../../covers/)
- **ファイル名規則**: 原則 `{ncode}.jpg` または `{ncode}.png`
- **推奨アスペクト比**: 一般的な文庫・単行本比率（1 : 1.4 〜 1 : 1.5 程度）
- **画像なしの場合**: `cover` を空文字列または省略するか、画像ファイルが存在しない場合、フロントエンド側で自動的に和モダンな縦書き装丁（和風テクスチャ＋筆文字風タイトル＋帯風ジャンル）が適用されます。無理にダミー画像を置く必要はありません。

---

## ワークフロー（手順）

### ステップ 1: `config.json` に作品を追加・編集
1. `config.json` を開き、`"books"` 配列に新しいオブジェクトを挿入または既存オブジェクトを更新します。
2. 表示順を調整する場合は既存エントリの `order` を整理します。

### ステップ 2: 書影画像の配置（任意）
表紙画像がある場合は、`covers/{ncode}.jpg` として保存し、`config.json` の `"cover"` にパスを指定します。

### ステップ 3: `rankings_manual.json` に空キーを用意
新規作品の場合、[rankings_manual.json](../../../rankings_manual.json) に対象 `ncode` のキーを追加しておきます。
```json
"n1234ab": []
```

### ステップ 4: JSON 構文の検証
文法エラーがないことを確認します。
```pwsh
python -c "import json; json.load(open('config.json', encoding='utf-8')); json.load(open('rankings_manual.json', encoding='utf-8')); print('JSON Syntax OK')"
```

### ステップ 5: 集計スクリプトのテスト実行
スクリプトを実行し、なろう・カクヨムから初回データが正しく取得できるか検証します。
```pwsh
python scripts/update_data.py
```
- 新規追加した作品について `OK: {ncode}` と出力されることを確認。
- なろうのアクセス解析がまだ存在しない（投稿直後など）場合は、空データでフォールバック処理されることを確認。

### ステップ 6: ローカルでの表示確認
ローカルサーバーを起動し、本棚UIに正しく作品が表示されるか確認します。
```pwsh
python -m http.server 8088
```
- ブラウザで `http://localhost:8088/` を開き、書影または自動装丁、タイトル、ステータスバッジが正しくレンダリングされているか確認。

### ステップ 7: Git コミットと反映
変更内容をコミットし、プッシュして GitHub Pages へ反映します。
