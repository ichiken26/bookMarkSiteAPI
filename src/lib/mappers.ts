import type { Category, CategoryRow, Bookmark, BookmarkRow } from '../type'

/** カテゴリー情報をAPI用レスポンスに整形 */
export const toCategory = (row: CategoryRow): Category => {
  /**
   * 各ブックマークカテゴリ
   * @param id カテゴリーのID
   * @param name カテゴリー名
   * @param sortOrder 並び順
   */
  const category: Category = {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
  }

  if (row.bookmark_count !== undefined) {
    category.bookmarkCount = row.bookmark_count
  }

  return category
}

/**
 * 各ブックマークの保持情報をAPI用レスポンスに整形
 * @param id ブックマークの固有ID
 * @param categoryId カテゴリーID
 * @param name ブックマーク名
 * @param url ブックマークしたURL
 * @param sortOrder カテゴリー内のブックマークの並び順
 */
export const toBookmark = (row: BookmarkRow): Bookmark => ({
  id: row.id,
  categoryId: row.category_id,
  name: row.name,
  url: row.url,
  sortOrder: row.sort_order,
})
