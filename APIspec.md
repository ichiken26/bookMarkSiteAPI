# API仕様書

## 目的

JSONファイルで一元管理しているブックマークデータを、Cloudflare Workers 上のAPIとして提供する。永続化には Cloudflare D1 を使用し、CMSからカテゴリとブックマークをCRUD操作できるようにする。

既存JSONの基本構造は以下。

```json
[
  {
    "name": "urlName",
    "url": "https://example.com"
  }
]
```

API化後は、既存JSONファイル単位の分類を `category` としてD1に移行する。カテゴリとブックマークはそれぞれIDを持ち、CMS上で並び替えできるように `sortOrder` を持つ。

## 前提

- 実行環境は Cloudflare Workers。
- DBは Cloudflare D1。
- APIレスポンスは JSON。
- CMSからカテゴリとブックマークを作成・更新・削除・並び替えできる。
- 公開サイト側は主にGET APIを使用する。
- 管理系のPOST/PUT/PATCH/DELETE APIは、別途認証を付ける想定とする。

## データモデル

### Category

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | string | yes | カテゴリID。API側で生成する。 |
| `name` | string | yes | カテゴリ名。 |
| `sortOrder` | number | yes | カテゴリの表示順。昇順で表示する。 |

### Bookmark

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | string | yes | ブックマークID。API側で生成する。 |
| `categoryId` | string | yes | 所属カテゴリID。 |
| `name` | string | yes | 表示名。 |
| `url` | string | yes | URL。 |
| `sortOrder` | number | yes | カテゴリ内での表示順。昇順で表示する。 |

## D1テーブル設計案

### `categories`

| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `id` | TEXT | PRIMARY KEY | カテゴリID。 |
| `name` | TEXT | NOT NULL | カテゴリ名。 |
| `sort_order` | INTEGER | NOT NULL | 表示順。 |

### `bookmarks`

| カラム | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `id` | TEXT | PRIMARY KEY | ブックマークID。 |
| `category_id` | TEXT | NOT NULL | 所属カテゴリID。 |
| `name` | TEXT | NOT NULL | 表示名。 |
| `url` | TEXT | NOT NULL | URL。 |
| `sort_order` | INTEGER | NOT NULL | カテゴリ内の表示順。 |

推奨インデックス:

```sql
CREATE INDEX idx_categories_sort_order ON categories(sort_order);
CREATE INDEX idx_bookmarks_category_sort_order ON bookmarks(category_id, sort_order);
```

## CRUD仕様表

### カテゴリ

| 操作 | HTTPメソッド | エンドポイント | 説明 |
| --- | --- | --- | --- |
| Create | `POST` | `/api/categories` | カテゴリを作成する。 |
| Read | `GET` | `/api/categories` | カテゴリ一覧を取得する。 |
| Read | `GET` | `/api/categories/:categoryId` | 指定カテゴリを取得する。 |
| Update | `PUT` | `/api/categories/:categoryId` | 指定カテゴリを全体更新する。 |
| Update | `PATCH` | `/api/categories/:categoryId` | 指定カテゴリを部分更新する。 |
| Update | `PATCH` | `/api/categories/reorder` | カテゴリの並び順を一括更新する。 |
| Delete | `DELETE` | `/api/categories/:categoryId` | 指定カテゴリを削除する。 |

### ブックマーク

| 操作 | HTTPメソッド | エンドポイント | 説明 |
| --- | --- | --- | --- |
| Create | `POST` | `/api/bookmarks` | ブックマークを作成する。 |
| Read | `GET` | `/api/bookmarks` | ブックマーク一覧を取得する。 |
| Read | `GET` | `/api/bookmarks/:bookmarkId` | 指定ブックマークを取得する。 |
| Read | `GET` | `/api/categories/:categoryId/bookmarks` | 指定カテゴリのブックマーク一覧を取得する。 |
| Update | `PUT` | `/api/bookmarks/:bookmarkId` | 指定ブックマークを全体更新する。 |
| Update | `PATCH` | `/api/bookmarks/:bookmarkId` | 指定ブックマークを部分更新する。 |
| Update | `PATCH` | `/api/categories/:categoryId/bookmarks/reorder` | 指定カテゴリ内のブックマーク並び順を一括更新する。 |
| Delete | `DELETE` | `/api/bookmarks/:bookmarkId` | 指定ブックマークを削除する。 |

### 公開サイト向け集約取得

| 操作 | HTTPメソッド | エンドポイント | 説明 |
| --- | --- | --- | --- |
| Read | `GET` | `/api/bookmark-tree` | カテゴリと配下ブックマークを並び順付きでまとめて取得する。 |

## API設計

### 共通仕様

- ベースパス: `/api`
- リクエスト形式: `application/json`
- レスポンス形式: `application/json`
- 文字コード: UTF-8
- 日時形式: ISO 8601
- 並び順は `sortOrder` の昇順。
- URLは `http://` または `https://` から始まる有効なURLのみ許可する。
- `id` はAPI側で生成し、クライアントからの指定は受け付けない。

### 共通レスポンス

成功時:

```json
{
  "data": {
    "id": "category01HZX...",
    "name": "tools",
    "sortOrder": 10
  }
}
```

一覧取得時:

```json
{
  "data": [],
  "meta": {
    "total": 0
  }
}
```

エラー時:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "name is required"
  }
}
```

## エンドポイント詳細

### `GET /api/categories`

カテゴリ一覧を取得する。`sortOrder` 昇順で返す。

#### レスポンス例

```json
{
  "data": [
    {
      "id": "category01HZX...",
      "name": "tools",
      "sortOrder": 10,
      "bookmarkCount": 12,
    }
  ],
  "meta": {
    "total": 1
  }
}
```

### `GET /api/categories/:categoryId`

指定カテゴリIDのカテゴリを取得する。

#### レスポンス例

```json
{
  "data": {
    "id": "category01HZX...",
    "name": "tools",
    "sortOrder": 10
  }
}
```

### `POST /api/categories`

カテゴリを作成する。

#### リクエスト例

```json
{
  "name": "tools",
  "sortOrder": 10
}
```

`sortOrder` を省略した場合は末尾に追加する。

#### レスポンス

- ステータスコード: `201 Created`

```json
{
  "data": {
    "id": "category01HZX...",
    "name": "tools",
    "sortOrder": 10
  }
}
```

### `PUT /api/categories/:categoryId`

カテゴリを全体更新する。`name` と `sortOrder` は必須。

#### リクエスト例

```json
{
  "name": "development tools",
  "sortOrder": 20
}
```

### `PATCH /api/categories/:categoryId`

カテゴリを部分更新する。送信された項目のみ更新する。

#### リクエスト例

```json
{
  "name": "development tools"
}
```

### `PATCH /api/categories/reorder`

カテゴリの並び順を一括更新する。CMSのドラッグアンドドロップ後に使用する。

#### リクエスト例

```json
{
  "items": [
    {
      "id": "category01HZX...",
      "sortOrder": 10
    },
    {
      "id": "category01HZY...",
      "sortOrder": 20
    }
  ]
}
```

#### レスポンス例

```json
{
  "data": [
    {
      "id": "category01HZX...",
      "name": "tools",
      "sortOrder": 10
    }
  ],
  "meta": {
    "total": 2
  }
}
```

### `DELETE /api/categories/:categoryId`

カテゴリを削除する。

カテゴリ配下にブックマークが存在する場合は、データ消失を避けるため `409 Conflict` を返す。配下ブックマークも削除したい場合は、別途 `force=true` のような明示的な仕様を追加する。

#### レスポンス

- ステータスコード: `204 No Content`
- レスポンスボディなし

### `GET /api/bookmarks`

ブックマーク一覧を取得する。

#### クエリパラメータ

| パラメータ | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `categoryId` | string | no | 指定カテゴリIDで絞り込む。 |
| `q` | string | no | `name` または `url` を部分一致検索する。 |
| `limit` | number | no | 取得件数。デフォルトは `50`。 |
| `offset` | number | no | 取得開始位置。デフォルトは `0`。 |

#### レスポンス例

```json
{
  "data": [
    {
      "id": "bookmark_01HZX...",
      "categoryId": "category01HZX...",
      "name": "Example",
      "url": "https://example.com",
      "sortOrder": 10
    }
  ],
  "meta": {
    "total": 1,
    "limit": 50,
    "offset": 0
  }
}
```

### `GET /api/bookmarks/:bookmarkId`

指定ブックマークIDのブックマークを取得する。

#### レスポンス例

```json
{
  "data": {
    "id": "bookmark_01HZX...",
    "categoryId": "category01HZX...",
    "name": "Example",
    "url": "https://example.com",
    "sortOrder": 10
  }
}
```

### `GET /api/categories/:categoryId/bookmarks`

指定カテゴリIDに紐づくブックマーク一覧を取得する。`sortOrder` 昇順で返す。

#### レスポンス例

```json
{
  "data": [
    {
      "id": "bookmark_01HZX...",
      "categoryId": "category01HZX...",
      "name": "Example",
      "url": "https://example.com",
      "sortOrder": 10
    }
  ],
  "meta": {
    "total": 1
  }
}
```

### `POST /api/bookmarks`

ブックマークを作成する。

#### リクエスト例

```json
{
  "categoryId": "category01HZX...",
  "name": "Example",
  "url": "https://example.com",
  "sortOrder": 10
}
```

`sortOrder` を省略した場合は、指定カテゴリ内の末尾に追加する。

#### レスポンス

- ステータスコード: `201 Created`

```json
{
  "data": {
    "id": "bookmark_01HZX...",
    "categoryId": "category01HZX...",
    "name": "Example",
    "url": "https://example.com",
    "sortOrder": 10
  }
}
```

### `PUT /api/bookmarks/:bookmarkId`

ブックマークを全体更新する。`categoryId`、`name`、`url`、`sortOrder` は必須。

#### リクエスト例

```json
{
  "categoryId": "category01HZX...",
  "name": "Updated Example",
  "url": "https://example.com/docs",
  "sortOrder": 20
}
```

### `PATCH /api/bookmarks/:bookmarkId`

ブックマークを部分更新する。送信された項目のみ更新する。

カテゴリ移動を行う場合は `categoryId` と `sortOrder` を送信する。

#### リクエスト例

```json
{
  "name": "Updated Example"
}
```

### `PATCH /api/categories/:categoryId/bookmarks/reorder`

指定カテゴリ内のブックマーク並び順を一括更新する。CMSのドラッグアンドドロップ後に使用する。

#### リクエスト例

```json
{
  "items": [
    {
      "id": "bookmark_01HZX...",
      "sortOrder": 10
    },
    {
      "id": "bookmark_01HZY...",
      "sortOrder": 20
    }
  ]
}
```

#### レスポンス例

```json
{
  "data": [
    {
      "id": "bookmark_01HZX...",
      "categoryId": "category01HZX...",
      "name": "Example",
      "url": "https://example.com",
      "sortOrder": 10
    }
  ],
  "meta": {
    "total": 2
  }
}
```

### `DELETE /api/bookmarks/:bookmarkId`

ブックマークを削除する。

#### レスポンス

- ステータスコード: `204 No Content`
- レスポンスボディなし

### `GET /api/bookmark-tree`

公開サイト表示向けに、カテゴリ一覧と各カテゴリ配下のブックマークをまとめて取得する。カテゴリは `sortOrder` 昇順、ブックマークもカテゴリ内で `sortOrder` 昇順に並べる。

#### レスポンス例

```json
{
  "data": [
    {
      "id": "category01HZX...",
      "name": "tools",
      "sortOrder": 10,
      "bookmarks": [
        {
          "id": "bookmark_01HZX...",
          "name": "Example",
          "url": "https://example.com",
          "sortOrder": 10
        }
      ]
    }
  ],
  "meta": {
    "categoryTotal": 1,
    "bookmarkTotal": 1
  }
}
```

## 必要なGET API

更新後の要件に対応するGET APIは以下。

| 必要な情報 | エンドポイント | 取得内容 |
| --- | --- | --- |
| カテゴリ一覧 | `GET /api/categories` | カテゴリID、名前、並び順、件数。 |
| カテゴリごとのID・名前・並び順 | `GET /api/categories` | `id`、`name`、`sortOrder` を返す。 |
| 各カテゴリIDに紐づいたブックマークID | `GET /api/categories/:categoryId/bookmarks` | 指定カテゴリ配下のブックマークID一覧を含む。 |
| ブックマークIDに紐づいたname・url・並び順 | `GET /api/bookmarks/:bookmarkId` | `id`、`name`、`url`、`sortOrder` を返す。 |
| サイト表示用の一括取得 | `GET /api/bookmark-tree` | カテゴリと配下ブックマークをネストして返す。 |

## ステータスコード

| ステータスコード | 説明 |
| --- | --- |
| `200 OK` | 取得・更新成功。 |
| `201 Created` | 作成成功。 |
| `204 No Content` | 削除成功。 |
| `400 Bad Request` | JSON形式不正、パラメータ不正。 |
| `401 Unauthorized` | 認証が必要。 |
| `403 Forbidden` | 権限不足。 |
| `404 Not Found` | 指定IDが存在しない。 |
| `409 Conflict` | 削除対象に子データがある、並び順更新対象が不整合など。 |
| `422 Unprocessable Entity` | バリデーションエラー。 |
| `500 Internal Server Error` | サーバー内部エラー。 |

## バリデーション

| 対象 | ルール |
| --- | --- |
| `category.name` | 必須、1文字以上、前後空白は保存前に除去する。 |
| `bookmark.name` | 必須、1文字以上、前後空白は保存前に除去する。 |
| `bookmark.url` | 必須、`http://` または `https://` の有効なURL。 |
| `categoryId` | 必須、存在するカテゴリIDであること。 |
| `sortOrder` | 0以上の整数。 |
| `id` | API側で生成し、クライアントからの指定は受け付けない。 |

## 並び替え仕様

- 並び順は `sortOrder` の昇順で扱う。
- CMSではドラッグアンドドロップ後、対象リスト全体の `id` と `sortOrder` を一括送信する。
- `sortOrder` は `10, 20, 30` のように間隔を空けて採番してもよい。
- 一括並び替えAPIでは、送信されたIDが対象カテゴリに属しているか検証する。
- ブックマークを別カテゴリへ移動する場合は、`PATCH /api/bookmarks/:bookmarkId` で `categoryId` と `sortOrder` を更新する。

## 認証・認可

公開サイト向けGET APIは未認証で利用可能にしてもよい。

CMS向けの以下APIは認証必須とする。

- `POST`
- `PUT`
- `PATCH`
- `DELETE`

認証方式は別途決定する。Cloudflare Workers上では、管理画面から送信するBearer Token、Cloudflare Access、または独自セッション管理を想定する。

## OpenAPI風サマリ

```yaml
openapi: 3.0.3
info:
  title: Bookmark API
  version: 1.0.0
paths:
  /api/categories:
    get:
      summary: List categories
    post:
      summary: Create category
  /api/categories/{categoryId}:
    get:
      summary: Get category
    put:
      summary: Replace category
    patch:
      summary: Update category
    delete:
      summary: Delete category
  /api/categories/reorder:
    patch:
      summary: Reorder categories
  /api/bookmarks:
    get:
      summary: List bookmarks
    post:
      summary: Create bookmark
  /api/bookmarks/{bookmarkId}:
    get:
      summary: Get bookmark
    put:
      summary: Replace bookmark
    patch:
      summary: Update bookmark
    delete:
      summary: Delete bookmark
  /api/categories/{categoryId}/bookmarks:
    get:
      summary: List bookmarks by category
  /api/categories/{categoryId}/bookmarks/reorder:
    patch:
      summary: Reorder bookmarks in category
  /api/bookmark-tree:
    get:
      summary: Get categories with bookmarks
```
