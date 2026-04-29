/**
 * Cloudflare Workers に渡される環境バインディング。
 * @property DB ブックマーク API が利用する Cloudflare D1 データベース。
 * @property ADMIN_TOKEN 管理系 API の Bearer 認証に使う任意のトークン。
 */
export type Bindings = {
  DB: MinimalD1Database
  ADMIN_TOKEN?: string
}

/**
 * この API で利用する D1 Database の最小インターフェース。
 * @property prepare SQL クエリを準備し、バインドや実行が可能なステートメントを返す。
 * @property batch 複数のステートメントをまとめて実行し、それぞれの結果を返す。
 */
export type MinimalD1Database = {
  prepare(query: string): MinimalD1PreparedStatement
  batch<T = unknown>(statements: MinimalD1PreparedStatement[]): Promise<MinimalD1Result<T>[]>
}

/**
 * この API で利用する D1 PreparedStatement の最小インターフェース。
 * @property bind SQL プレースホルダーに値をバインドしたステートメントを返す。
 * @property first クエリ結果の先頭 1 件を返す。該当行がない場合は null を返す。
 * @property all クエリ結果の全行と実行メタデータを返す。
 * @property run INSERT、UPDATE、DELETE など結果行を必要としない SQL を実行する。
 */
export type MinimalD1PreparedStatement = {
  bind(...values: unknown[]): MinimalD1PreparedStatement
  first<T = unknown>(): Promise<T | null>
  all<T = unknown>(): Promise<MinimalD1Result<T>>
  run(): Promise<MinimalD1Result>
}

/**
 * D1 クエリ実行結果のうち、この API が参照する最小プロパティ。
 * @property results SELECT などで返される行の配列。
 * @property success D1 による実行成否。
 * @property meta 変更行数などの実行メタデータ。
 */
export type MinimalD1Result<T = unknown> = {
  results?: T[]
  success: boolean
  meta?: { changes?: number }
}

/**
 * categories テーブルから取得する行データ。
 * @property id カテゴリ ID。
 * @property name カテゴリ名。
 * @property sort_order カテゴリ表示順。値が小さいほど先に表示される。
 * @property bookmark_count カテゴリに紐づくブックマーク数。集計クエリ時のみ付与される。
 */
export type CategoryRow = {
  id: string
  name: string
  sort_order: number
  bookmark_count?: number
}

/**
 * bookmarks テーブルから取得する行データ。
 * @property id ブックマーク ID。
 * @property category_id ブックマークが属するカテゴリ ID。
 * @property name ブックマーク名。
 * @property url ブックマーク先 URL。
 * @property sort_order カテゴリ内での表示順。値が小さいほど先に表示される。
 */
export type BookmarkRow = {
  id: string
  category_id: string
  name: string
  url: string
  sort_order: number
}

/**
 * API レスポンスで返すカテゴリ情報。
 * @property id カテゴリ ID。
 * @property name カテゴリ名。
 * @property sortOrder カテゴリ表示順。値が小さいほど先に表示される。
 * @property bookmarkCount カテゴリに紐づくブックマーク数。取得 API によっては省略される。
 */
export type Category = {
  id: string
  name: string
  sortOrder: number
  bookmarkCount?: number
}

/**
 * API レスポンスで返すブックマーク情報。
 * @property id ブックマーク ID。
 * @property categoryId ブックマークが属するカテゴリ ID。
 * @property name ブックマーク名。
 * @property url ブックマーク先 URL。
 * @property sortOrder カテゴリ内での表示順。値が小さいほど先に表示される。
 */
export type Bookmark = {
  id: string
  categoryId: string
  name: string
  url: string
  sortOrder: number
}
