import type { MinimalD1Database, CategoryRow, BookmarkRow } from '../type'

/** 指定したカテゴリIDがDBに存在するかをbooleanで返す */
export const categoryExists = async (db: MinimalD1Database, id: string) => {
  const row =
    await db
      .prepare('SELECT id FROM categories WHERE id = ?') // categoryテーブルのid列を取得, WHEREでidが?と一致するものを取得
      .bind(id) // ?はプレースホルダ, .bind(id)でid値を差し込む
      .first<{ id: string }>()  // 先頭1件だけ取得, オブジェクト | nullを返す, UUIDを生成しているので1件しか一致しないはず
  return Boolean(row)
}

/** カテゴリーデータを1件取得する
 * @param db D1データベース接続
 * @param id 取得対象のカテゴリID
 * @returns idに一致するカテゴリ（型定義は`CategoryRow`）。存在しない場合は `null`
 */
export const getCategory = (db: MinimalD1Database, id: string) =>
  db
    .prepare('SELECT id, name, sort_order FROM categories WHERE id = ?')
    .bind(id)
    .first<CategoryRow>()

/** ブックマークデータを1件取得する
 * @param db D1データベース接続
 * @param id 取得対象のブックマークID
 * @returns idに一致するブックマーク（型定義は`BookmarkRow`）。存在しない場合は `null`
 */
export const getBookmark = (db: MinimalD1Database, id: string) =>
  db
    .prepare('SELECT id, category_id, name, url, sort_order FROM bookmarks WHERE id = ?')
    .bind(id)
    .first<BookmarkRow>()

/**
 * 10件刻みでカテゴリーの並び順を自動採番
 */
export const nextCategorySortOrder = async (db: MinimalD1Database) => {
  // MAX(sort_order): 既存カテゴリの最大sort_orderをとる
  // COALESCE(..., -10): テーブルが空で MAX が NULL のとき -10 に置き換える
  // +10: 最大値より 10 大きい値を次の候補にする
  // AS sortOrder: 結果列名を sortOrder にする
  // 1件単位でなく10件単位なのは、sortOrderが10単位ごとだと途中挿入がしやすいため
  // 1件単位だと、つまり途中挿入を頻繁に行う設計だと、再採番時に全件UPDATEが必要になりやすく処理が重くなる
  // なので途中挿入の限界が来たらフロント側でreorderして全件UPDATE
  const row =
    await db
      .prepare('SELECT COALESCE(MAX(sort_order), -10) + 10 AS sortOrder FROM categories')
      .first<{
        sortOrder: number
      }>()
  return row?.sortOrder ?? 0
}

/**
 * 10件刻みでブックマークの並び順を自動採番
 */
export const nextBookmarkSortOrder = async (db: MinimalD1Database, categoryId: string) => {
  const row = await db
    .prepare('SELECT COALESCE(MAX(sort_order), -10) + 10 AS sortOrder FROM bookmarks WHERE category_id = ?')
    .bind(categoryId)
    .first<{ sortOrder: number }>()
  return row?.sortOrder ?? 0
}
