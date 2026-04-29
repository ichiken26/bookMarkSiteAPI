import { Hono } from 'hono'
import { renderer } from './renderer'
import type {
  Bindings,
  CategoryRow,
  BookmarkRow,
  Category,
  Bookmark,
} from './type'
import { toCategory, toBookmark } from './lib/mappers'
import { success, errorResponse, validationError, notFound, conflict } from './lib/responses'
import {
  parseJsonBody,
  generateId,
  normalizeName,
  normalizeSortOrder,
  normalizeUrl,
  rejectClientId,
} from './lib/validation'
import {
  categoryExists,
  getCategory,
  getBookmark,
  nextCategorySortOrder,
  nextBookmarkSortOrder,
} from './lib/repositories'

type JsonObject = Record<string, unknown>

const app = new Hono<{ Bindings: Bindings }>()

app.use(renderer)

app.get('/', (c) => {
  return c.render(<h1>Bookmark API</h1>)
})

app.use('/api/*', async (c, next) => {
  // GETの非同期処理化
  if (c.req.method === 'GET') {
    await next() // 次のミドルウェア処理 / ルート処理に処理を勧める関数
    return
  }

  // APIトークンを取得
  const expectedToken = c.env.ADMIN_TOKEN
  if (!expectedToken) {
    return errorResponse(c, 500, 'CONFIGURATION_ERROR', 'ADMIN_TOKEN is not configured')
  }

  // 認証情報を取得
  const authorization = c.req.header('Authorization')
  // Bearerで始まらないヘッダーは認証不正なので早期リターンで排除
  if (!authorization?.startsWith('Bearer ')) {
    return errorResponse(c, 401, 'UNAUTHORIZED', 'Bearer token is required')
  }

  // レスポンスヘッダからBearerの接頭辞を取り除いてトークン本体だけを取り出す
  const token = authorization.slice('Bearer '.length)
  // トークン比較し、トークン不正を検知
  if (token !== expectedToken) {
    return errorResponse(c, 403, 'FORBIDDEN', 'Invalid bearer token')
  }

  await next()
})

app.get('/api/categories', async (c) => {
  // DBからカテゴリー一覧をブックマーク件数つきで取得
  const result = await c.env.DB.prepare(
    // FROM categories c: カテゴリーテーブルをcという名前で記述し参照する
    // SELECT句: LEFT JOIN句内でCOUNT集計した結果が存在しないカテゴリについて、bookmark_countがnullになるので0埋め
    // LEFT JOIN句の中身(サブクエリ): ブックマークテーブルのカテゴリーIDによってブックマークを1まとめにし、その数をカウント
    // LEFT JOIN ~ ON: カテゴリーテーブルとカテゴリーIDごとにブックマークテーブルの集計結果をカテゴリーIDによりLEFT JOIN(カテゴリーテーブルを残す)
    // ORDER BY句: カテゴリーの順序を昇順(ASC)で並び変える
    // Q. bcにはCOUNTの集計結果が入ってるからbc.category_idなどの書き方って不適切では？
    // A. カテゴリごとの件数には結合キーとしてcategory_idが残るため、bookmark_countだけでなくcategory_idも使える
    //    また、サブクエリ内の名称はローカル別名なのでグローバル(本クエリ)内では使えない
    `
    SELECT
      c.id,
      c.name,
      c.sort_order,
      COALESCE(bc.bookmark_count, 0) AS bookmark_count
    FROM categories c
    LEFT JOIN (
      SELECT b.category_id, COUNT(*) AS bookmark_count
      FROM bookmarks b
      GROUP BY b.category_id
    ) bc
    ON bc.category_id = c.id
    ORDER BY c.sort_order ASC, c.name ASC;
    `,
  ).all<CategoryRow>()
  // DB結果をAPIのreturn用のJSONとして整形
  const data = (result.results ?? []).map(toCategory)
  return c.json(success(data, { total: data.length }))
})

app.post('/api/categories', async (c) => {
  // HonoのコンテキストオブジェクトのJSONをパースし、bodyとerrorに分離
  const { body, error } = await parseJsonBody(c)

  // エラーがあるもしくはリクエストボディが存在しないときに400エラーを返す
  if (error || !body) return errorResponse(c, 400, 'BAD_REQUEST', error ?? 'Invalid request')

  // クライアントによるid指定禁止
  const idError = rejectClientId(body)
  // 検知したらバリデーションエラーを返す(エラーならstring値→true, OKならnull→falsyなのでスルー)
  if (idError) return validationError(c, idError)

  // カテゴリー名について正規化・バリデーション処理
  const name = normalizeName(body.name)
  // バリデーション結果がエラー(型不正や空文字)もしくは値が存在しないならバリデーションエラーを返す
  if (name.error || name.value === null) return validationError(c, name.error ?? 'name is required')

  // sortOrderを正規化・バリデーション
  const sortOrder = normalizeSortOrder(body.sortOrder, false)
  // バリデーション結果がエラー(型不正)ならバリデーションエラーを返す
  if (sortOrder.error) return validationError(c, sortOrder.error)

  /** カテゴリー作成時にUUIDを付与し、 カテゴリー名と並び順を付与*/
  const category: Category = {
    id: generateId('catrgory'),
    name: name.value,
    sortOrder: sortOrder.value ?? (await nextCategorySortOrder(c.env.DB)), // 並び順がリクエストで渡されていたらそれを使用, それがnullish(null || undefined)のときDBから次の並び順のみ取得
  }

  // カテゴリーテーブルにカテゴリーID・カテゴリー名・並び順をINSERTするSQLを実行(.run())
  await c.env.DB.prepare('INSERT INTO categories (id, name, sort_order) VALUES (?, ?, ?)')
    .bind(category.id, category.name, category.sortOrder)
    .run()

  // INSERTしたオブジェクトと成功ステータス(201)を返す
  return c.json(success(category), 201)
})

app.patch('/api/categories/reorder', async (c) => {
  // HonoのコンテキストオブジェクトのJSONをパースし、bodyとerrorに分離
  const { body, error } = await parseJsonBody(c)

  // エラーがあるもしくはリクエストボディが存在しないときに400エラーを返す
  if (error || !body) return errorResponse(c, 400, 'BAD_REQUEST', error ?? 'Invalid request')

  // items が配列でない、または空配列のときバリデーションエラー
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return validationError(c, 'items must be a non-empty array')
  }

  // カテゴリーID(文字列)の重複を許さない集合を作成
  const seen = new Set<string>()
  // idとsortOrderのJSONを格納する配列を作成
  const items: { id: string; sortOrder: number }[] = []
  // リクエスト内のカテゴリーIDの重複を排除
  for (const item of body.items) {
    // アイテムが存在しない || アイテムの型がオブジェクトでない || アイテムが配列である　ときバリデーションエラー
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return validationError(c, 'items must contain objects')
    }

    // 型アサーション(itemはJSONオブジェクトとして扱うと明示)
    const record = item as JsonObject
    // カテゴリーIDが文字列でないときもしくは整形結果がfalsyなときバリデーションエラー
    if (typeof record.id !== 'string' || !record.id.trim()) {
      return validationError(c, 'items[].id is required')
    }

    // sortOrderをバリデーション
    const sortOrder = normalizeSortOrder(record.sortOrder, true)
    if (sortOrder.error || sortOrder.value === null) return validationError(c, sortOrder.error ?? 'invalid sortOrder')

    // 既にチェック済みとしてカテゴリーIDを登録、もし重複したIDが出てきた場合コンフリクトとして処理
    if (seen.has(record.id)) return conflict(c, 'items contains duplicate ids')
    seen.add(record.id)
    // チェック済みのカテゴリーIDと並び順を配列に追加
    items.push({ id: record.id, sortOrder: sortOrder.value })
  }

  // チェック済みIDのそれぞれにおいてバインドするための?を作成
  const placeholders = items.map(() => '?').join(', ')
  // リクエストIDのうちDBに存在するものを全件取得
  const existing = await c.env.DB.prepare(`SELECT id FROM categories WHERE id IN (${placeholders})`)
    .bind(...items.map((item) => item.id))
    .all<{ id: string }>()
  // 一致件数がリクエスト件数より少ないなら409 CONFLICTを返す
  if ((existing.results ?? []).length !== items.length) {
    return conflict(c, 'items contains unknown category ids')
  }

  // 複数行の更新は重いのでバッチ処理を行う
  await c.env.DB.batch(
    items.map((item) =>
      c.env.DB
        .prepare('UPDATE categories SET sort_order = ? WHERE id = ?') // カテゴリーテーブルを、IDが一致するカテゴリー行を対象に、sort_orderを新しい順番に更新
        .bind(item.sortOrder, item.id), // フロントで決定された新しいsort_orderを挿入
    ),
  )

  // 更新後のカテゴリー(ID・カテゴリー名・並び順)を重複チェックしたカテゴリーIDのそれぞれにおいて再取得
  const updated = await c.env.DB.prepare(`SELECT id, name, sort_order FROM categories WHERE id IN (${placeholders}) ORDER BY sort_order ASC, name ASC`)
    .bind(...items.map((item) => item.id))
    .all<CategoryRow>()
  const data = (updated.results ?? []).map(toCategory) // DBの取得結果をAPIレスポンス風に整形
  return c.json(success(data, { total: data.length }))
})

app.get('/api/categories/:categoryId', async (c) => { // 『:』は動的セグメント、Nuxtの/api/categories/{categoryid}
  // DBからカテゴリーIDに相当するデータ(カテゴリーID・カテゴリー名・並び順)を1件取得
  const category = await getCategory(c.env.DB, c.req.param('categoryId'))
  // 見つからなかったとき404エラー
  if (!category) return notFound(c, 'category not found')
  return c.json(success(toCategory(category)))
})

app.put('/api/categories/:categoryId', async (c) => {
  // HonoのコンテキストオブジェクトのJSONをパースし、bodyとerrorに分離
  const { body, error } = await parseJsonBody(c)
  // エラーがあるもしくはリクエストボディが存在しないときに400エラーを返す
  if (error || !body) return errorResponse(c, 400, 'BAD_REQUEST', error ?? 'Invalid request')

  // クライアントでのID指定拒否
  const idError = rejectClientId(body)
  if (idError) return validationError(c, idError)

  // nameの正規化・バリデーション
  const name = normalizeName(body.name)
  if (name.error || name.value === null) return validationError(c, name.error ?? 'name is required')

  // sortOrderのバリデーション
  const sortOrder = normalizeSortOrder(body.sortOrder, true)
  if (sortOrder.error || sortOrder.value === null) return validationError(c, sortOrder.error ?? 'invalid sortOrder')

  // カテゴリーIDをパスパラメータから取得
  const categoryId = c.req.param('categoryId')
  // カテゴリーIDに対しDBからカテゴリーデータを取得
  const existing = await getCategory(c.env.DB, categoryId)
  if (!existing) return notFound(c, 'category not found') // カテゴリーIDのNot Foundエラー

  // パスパラメータのカテゴリーIDに対し、リクエストボディの情報を更新
  await c.env.DB.prepare('UPDATE categories SET name = ?, sort_order = ? WHERE id = ?')
    .bind(name.value, sortOrder.value, categoryId)
    .run()

  return c.json(success({ id: categoryId, name: name.value, sortOrder: sortOrder.value }))
})

app.patch('/api/categories/:categoryId', async (c) => {
  // HonoのコンテキストオブジェクトのJSONをパースし、bodyとerrorに分離
  const { body, error } = await parseJsonBody(c)
  // エラーがあるもしくはリクエストボディが存在しないときに400エラーを返す
  if (error || !body) return errorResponse(c, 400, 'BAD_REQUEST', error ?? 'Invalid request')

  // クライアントでのID指定拒否
  const idError = rejectClientId(body)
  if (idError) return validationError(c, idError)

  // パスパラメータのカテゴリーIDを取得
  const categoryId = c.req.param('categoryId')
  // パスパラメータのカテゴリーIDに一致するカテゴリーデータをDBから1件取得
  const existing = await getCategory(c.env.DB, categoryId)
  if (!existing) return notFound(c, 'category not found')

  // DB行形式(CategoryRow)をAPI処理用のCategory形式に変換
  const category = toCategory(existing)

  // nameがリクエストボディに含まれている場合のみ部分更新
  if ('name' in body) {
    // nameを正規化・バリデーション
    const name = normalizeName(body.name)
    // 不正なnameならバリデーションエラー
    if (name.error || name.value === null) return validationError(c, name.error ?? 'name is required')
    // 既存カテゴリーのnameを更新
    category.name = name.value
  }

  // sortOrderがリクエストボディに含まれている場合のみ部分更新
  if ('sortOrder' in body) {
    // sortOrderを正規化・バリデーション
    const sortOrder = normalizeSortOrder(body.sortOrder, true)
    // 不正なsortOrderならバリデーションエラー
    if (sortOrder.error || sortOrder.value === null) return validationError(c, sortOrder.error ?? 'invalid sortOrder')
    // 既存カテゴリーのsortOrderを更新
    category.sortOrder = sortOrder.value
  }

  // 更新があった項目に対してDBを更新
  await c.env.DB.prepare('UPDATE categories SET name = ?, sort_order = ? WHERE id = ?')
    .bind(category.name, category.sortOrder, category.id)
    .run()

  return c.json(success(category))
})

app.delete('/api/categories/:categoryId', async (c) => {
  // パスパラメータのカテゴリーIDを取得
  const categoryId = c.req.param('categoryId')
  // パスパラメータのカテゴリーIDに一致するカテゴリーデータをDBから1件取得
  const existing = await getCategory(c.env.DB, categoryId)
  if (!existing) return notFound(c, 'category not found')

  // パスパラメータ指定のカテゴリーIDに一致するブックマークの件数をカウント
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS total FROM bookmarks WHERE category_id = ?')
    .bind(categoryId)
    .first<{ total: number }>()
  
  // ブックマークの件数が残っていればDELETEしない(RDBの不整合を守るため)
  if ((count?.total ?? 0) > 0) {
    return conflict(c, 'category has bookmarks')
  }

  // パスパラメータ指定のカテゴリーIDの該当データを削除し、成功レスポンス(204)を返す
  await c.env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(categoryId).run()
  return c.body(null, 204)
})

app.get('/api/bookmarks', async (c) => {
  const categoryId = c.req.query('categoryId')
  const q = c.req.query('q')?.trim() // 検索クエリ(検索ワード)
  const limitRaw = c.req.query('limit') // 一覧表示の上限件数(何件まで表示)
  const offsetRaw = c.req.query('offset') // 取得開始位置(limitと合わせれば1ページに表示する情報だけDBから撮ってこれる)
  const limit = limitRaw === undefined ? 50 : Number(limitRaw) // 一覧表示の上限件数(デフォルト値50で指定件数があればそちら)
  const offset = offsetRaw === undefined ? 0 : Number(offsetRaw) // 取得開始位置(デフォルト1で指定があればそちら)

  if (!Number.isInteger(limit) || limit < 1) {
    return validationError(c, 'limit must be a positive integer')
  }
  if (!Number.isInteger(offset) || offset < 0) {
    return validationError(c, 'offset must be a non-negative integer')
  }

  // WHERE句の条件文字列を動的に組み立てる配列
  const where: string[] = []
  // プレースホルダ(?)に順番どおり差し込む値を保持する配列
  const binds: unknown[] = []
  // categoryIdが指定されているときはカテゴリで絞り込み
  if (categoryId) {
    where.push('category_id = ?')
    binds.push(categoryId)
  }
  // qが指定されているときはnameまたはurlの部分一致で絞り込み
  if (q) {
    where.push('(name LIKE ? OR url LIKE ?)') // WHERE句の一部, LIKEで部分一致検索
    // LIKE検索用に前方・後方ワイルドカードを付与
    binds.push(`%${q}%`, `%${q}%`)
  }

  // WHERE句を結合
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  // 条件に一致するブックマークの数を集計
  const count = await c.env.DB.prepare(`SELECT COUNT(*) AS total FROM bookmarks ${whereSql}`)
    .bind(...binds)
    .first<{ total: number }>()
  // 条件に一致するブックマークの情報(ブックマークID・カテゴリーID・ブックマーク名・URL・並び順)をブックマークテーブルから取得し、昇順に並べる
  const result = await c.env.DB.prepare(
    `
    SELECT id, category_id, name, url, sort_order
    FROM bookmarks
    ${whereSql}
    ORDER BY category_id ASC, sort_order ASC, name ASC
    LIMIT ? OFFSET ?
    `,
  )
    .bind(...binds, limit, offset)
    .all<BookmarkRow>()
  // JSONオブジェクトに整形、ブックマークの取得件数・limit・offsetを共に返す
  return c.json(success((result.results ?? []).map(toBookmark), { total: count?.total ?? 0, limit, offset }))
})

app.post('/api/bookmarks', async (c) => {
  // HonoのコンテキストオブジェクトのJSONをパースし、bodyとerrorに分離
  const { body, error } = await parseJsonBody(c)
  // エラーがあるもしくはリクエストボディが存在しないときに400エラーを返す
  if (error || !body) return errorResponse(c, 400, 'BAD_REQUEST', error ?? 'Invalid request')

  // クライアントでのID指定拒否
  const idError = rejectClientId(body)
  if (idError) return validationError(c, idError)

  // categoryIdが文字列でない、または空文字(空白のみ含む)ならバリデーションエラー
  if (typeof body.categoryId !== 'string' || !body.categoryId.trim()) {
    return validationError(c, 'categoryId is required')
  }
  // categoryIdに対応するカテゴリがDBに存在しないならバリデーションエラー
  if (!(await categoryExists(c.env.DB, body.categoryId))) {
    return validationError(c, 'categoryId does not exist')
  }

  // nameを正規化・バリデーション
  const name = normalizeName(body.name)
  // nameが不正ならバリデーションエラー
  if (name.error || name.value === null) return validationError(c, name.error ?? 'name is required')

  // urlを正規化・バリデーション
  const url = normalizeUrl(body.url)
  // urlが不正ならバリデーションエラー
  if (url.error || url.value === null) return validationError(c, url.error ?? 'url is required')

  // sortOrderを正規化・バリデーション
  const sortOrder = normalizeSortOrder(body.sortOrder, false)
  // sortOrderが不正ならバリデーションエラー
  if (sortOrder.error) return validationError(c, sortOrder.error)

  // ブックマークのデータを正規化
  const bookmark: Bookmark = {
    id: generateId('bookmark'), // ブックマークIDのUUIDを生成
    categoryId: body.categoryId,
    name: name.value,
    url: url.value,
    sortOrder: sortOrder.value ?? (await nextBookmarkSortOrder(c.env.DB, body.categoryId)), // sortOrderが指定されていればその値を使用し、未指定(nullish)ならカテゴリ内の次の並び順をDBから採番
  }

  // ブックマークテーブルにデータをINSERT
  await c.env.DB.prepare(
    'INSERT INTO bookmarks (id, category_id, name, url, sort_order) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(bookmark.id, bookmark.categoryId, bookmark.name, bookmark.url, bookmark.sortOrder)
    .run()

  // レスポンスをJSONに整形し、成功ステータス(201)を返す
  return c.json(success(bookmark), 201)
})

app.get('/api/bookmarks/:bookmarkId', async (c) => {
  // パスパラメータのbookmarkIdに一致するブックマークをDBから1件取得
  const bookmark = await getBookmark(c.env.DB, c.req.param('bookmarkId'))
  // 対象が存在しないなら404エラー
  if (!bookmark) return notFound(c, 'bookmark not found')
  // DB行形式をAPIレスポンス形式に変換して返却
  return c.json(success(toBookmark(bookmark)))
})

app.put('/api/bookmarks/:bookmarkId', async (c) => {
  // HonoのコンテキストオブジェクトのJSONをパースし、bodyとerrorに分離
  const { body, error } = await parseJsonBody(c)
  // エラーがあるもしくはリクエストボディが存在しないときに400エラーを返す
  if (error || !body) return errorResponse(c, 400, 'BAD_REQUEST', error ?? 'Invalid request')

  // クライアントでのID指定拒否
  const idError = rejectClientId(body)
  if (idError) return validationError(c, idError)

  // categoryIdが文字列でない、または空文字(空白のみ含む)ならバリデーションエラー
  if (typeof body.categoryId !== 'string' || !body.categoryId.trim()) {
    return validationError(c, 'categoryId is required')
  }
  // categoryIdに対応するカテゴリがDBに存在しないならバリデーションエラー
  if (!(await categoryExists(c.env.DB, body.categoryId))) {
    return validationError(c, 'categoryId does not exist')
  }

  // nameを正規化・バリデーション
  const name = normalizeName(body.name)
  // nameが不正ならバリデーションエラー
  if (name.error || name.value === null) return validationError(c, name.error ?? 'name is required')

  // urlを正規化・バリデーション
  const url = normalizeUrl(body.url)
  // urlが不正ならバリデーションエラー
  if (url.error || url.value === null) return validationError(c, url.error ?? 'url is required')

  // sortOrderを正規化・バリデーション(PUTでは必須)
  const sortOrder = normalizeSortOrder(body.sortOrder, true)
  // sortOrderが不正ならバリデーションエラー
  if (sortOrder.error || sortOrder.value === null) return validationError(c, sortOrder.error ?? 'invalid sortOrder')

  // パスパラメータのbookmarkIdを取得
  const bookmarkId = c.req.param('bookmarkId')
  // パスパラメータのbookmarkIdに一致するブックマークをDBから1件取得
  const existing = await getBookmark(c.env.DB, bookmarkId)
  // 対象が存在しないなら404エラー
  if (!existing) return notFound(c, 'bookmark not found')

  // PUT更新用に、バリデーション済みのブックマークデータを組み立てる
  const bookmark: Bookmark = {
    id: bookmarkId,
    categoryId: body.categoryId,
    name: name.value,
    url: url.value,
    sortOrder: sortOrder.value,
  }

  // 指定したbookmarkIdのブックマークを更新
  await c.env.DB.prepare('UPDATE bookmarks SET category_id = ?, name = ?, url = ?, sort_order = ? WHERE id = ?')
    .bind(bookmark.categoryId, bookmark.name, bookmark.url, bookmark.sortOrder, bookmark.id)
    .run()

  // 更新後のブックマークデータを返却
  return c.json(success(bookmark))
})

app.patch('/api/bookmarks/:bookmarkId', async (c) => {
  // HonoのコンテキストオブジェクトのJSONをパースし、bodyとerrorに分離
  const { body, error } = await parseJsonBody(c)
  // エラーがあるもしくはリクエストボディが存在しないときに400エラーを返す
  if (error || !body) return errorResponse(c, 400, 'BAD_REQUEST', error ?? 'Invalid request')

  // クライアントでのID指定拒否
  const idError = rejectClientId(body)
  if (idError) return validationError(c, idError)

  // パスパラメータのbookmarkIdを取得
  const bookmarkId = c.req.param('bookmarkId')
  // パスパラメータのbookmarkIdに一致するブックマークをDBから1件取得
  const existing = await getBookmark(c.env.DB, bookmarkId)
  // 対象が存在しないなら404エラー
  if (!existing) return notFound(c, 'bookmark not found')

  // DB行形式をAPI処理用のBookmark形式に変換
  const bookmark = toBookmark(existing)

  // categoryIdがリクエストボディに含まれている場合のみ部分更新(ブックマークを別カテゴリーに移動など)
  if ('categoryId' in body) {
    // categoryIdが文字列でない、または空文字(空白のみ含む)ならバリデーションエラー
    if (typeof body.categoryId !== 'string' || !body.categoryId.trim()) {
      return validationError(c, 'categoryId is required')
    }
    // categoryIdに対応するカテゴリがDBに存在しないならバリデーションエラー
    if (!(await categoryExists(c.env.DB, body.categoryId))) {
      return validationError(c, 'categoryId does not exist')
    }
    // 既存ブックマークのcategoryIdを更新
    bookmark.categoryId = body.categoryId
  }

  // nameがリクエストボディに含まれている場合のみ部分更新
  if ('name' in body) {
    // nameを正規化・バリデーション
    const name = normalizeName(body.name)
    // nameが不正ならバリデーションエラー
    if (name.error || name.value === null) return validationError(c, name.error ?? 'name is required')
    // 既存ブックマークのnameを更新
    bookmark.name = name.value
  }

  // urlがリクエストボディに含まれている場合のみ部分更新
  if ('url' in body) {
    // urlを正規化・バリデーション
    const url = normalizeUrl(body.url)
    // urlが不正ならバリデーションエラー
    if (url.error || url.value === null) return validationError(c, url.error ?? 'url is required')
    // 既存ブックマークのurlを更新
    bookmark.url = url.value
  }

  // sortOrderがリクエストボディに含まれている場合のみ部分更新
  if ('sortOrder' in body) {
    // sortOrderを正規化・バリデーション
    const sortOrder = normalizeSortOrder(body.sortOrder, true)
    // sortOrderが不正ならバリデーションエラー
    if (sortOrder.error || sortOrder.value === null) return validationError(c, sortOrder.error ?? 'invalid sortOrder')
    // 既存ブックマークのsortOrderを更新
    bookmark.sortOrder = sortOrder.value
  }

  // 指定したbookmarkIdのブックマークを更新
  await c.env.DB.prepare('UPDATE bookmarks SET category_id = ?, name = ?, url = ?, sort_order = ? WHERE id = ?')
    .bind(bookmark.categoryId, bookmark.name, bookmark.url, bookmark.sortOrder, bookmark.id)
    .run()

  // 更新後のブックマークデータを返却
  return c.json(success(bookmark))
})

app.delete('/api/bookmarks/:bookmarkId', async (c) => {
  // パスパラメータのbookmarkIdを取得
  const bookmarkId = c.req.param('bookmarkId')
  // パスパラメータのbookmarkIdに一致するブックマークをDBから1件取得
  const existing = await getBookmark(c.env.DB, bookmarkId)
  // 対象が存在しないなら404エラー
  if (!existing) return notFound(c, 'bookmark not found')

  // 指定したbookmarkIdのブックマークを削除
  await c.env.DB.prepare('DELETE FROM bookmarks WHERE id = ?').bind(bookmarkId).run()
  // 削除成功時はレスポンスボディなしで204を返却
  return c.body(null, 204)
})

app.get('/api/categories/:categoryId/bookmarks', async (c) => {
  // パスパラメータのcategoryIdを取得
  const categoryId = c.req.param('categoryId')
  // categoryIdに対応するカテゴリがDBに存在しないなら404エラー
  if (!(await categoryExists(c.env.DB, categoryId))) {
    return notFound(c, 'category not found')
  }

  // categoryIdに一致するブックマーク一覧を、並び順(sort_order, name)の昇順で取得
  const result = await c.env.DB.prepare(
    `
    SELECT id, category_id, name, url, sort_order
    FROM bookmarks
    WHERE category_id = ?
    ORDER BY sort_order ASC, name ASC
    `,
  )
    .bind(categoryId)
    .all<BookmarkRow>()
  // DB行形式(BookmarkRow)をAPIレスポンス形式(Bookmark)に変換
  const data = (result.results ?? []).map(toBookmark)
  // 取得した一覧データと件数を返却
  return c.json(success(data, { total: data.length }))
})

app.patch('/api/categories/:categoryId/bookmarks/reorder', async (c) => {
  // パスパラメータのcategoryIdを取得
  const categoryId = c.req.param('categoryId')
  // categoryIdに対応するカテゴリがDBに存在しないなら404エラー
  if (!(await categoryExists(c.env.DB, categoryId))) {
    return notFound(c, 'category not found')
  }

  // HonoのコンテキストオブジェクトのJSONをパースし、bodyとerrorに分離
  const { body, error } = await parseJsonBody(c)
  // エラーがあるもしくはリクエストボディが存在しないときに400エラーを返す
  if (error || !body) return errorResponse(c, 400, 'BAD_REQUEST', error ?? 'Invalid request')

  // items が配列でない、または空配列のときバリデーションエラー
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return validationError(c, 'items must be a non-empty array')
  }

  // ブックマークID(文字列)の重複を許さない集合を作成
  const seen = new Set<string>()
  // idとsortOrderのJSONを格納する配列を作成
  const items: { id: string; sortOrder: number }[] = []
  // リクエスト内のブックマークIDの重複を排除
  for (const item of body.items) {
    // アイテムが存在しない || アイテムの型がオブジェクトでない || アイテムが配列である ときバリデーションエラー
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return validationError(c, 'items must contain objects')
    }

    // 型アサーション(itemはJSONオブジェクトとして扱うと明示)
    const record = item as JsonObject
    // ブックマークIDが文字列でないときもしくは整形結果がfalsyなときバリデーションエラー
    if (typeof record.id !== 'string' || !record.id.trim()) {
      return validationError(c, 'items[].id is required')
    }

    // sortOrderを正規化・バリデーション
    const sortOrder = normalizeSortOrder(record.sortOrder, true)
    if (sortOrder.error || sortOrder.value === null) return validationError(c, sortOrder.error ?? 'invalid sortOrder')

    // 既にチェック済みとしてブックマークIDを登録、もし重複したIDが出てきた場合コンフリクトとして処理
    if (seen.has(record.id)) return conflict(c, 'items contains duplicate ids')
    seen.add(record.id)
    // チェック済みのブックマークIDと並び順を配列に追加
    items.push({ id: record.id, sortOrder: sortOrder.value })
  }

  // チェック済みIDのそれぞれにおいてバインドするための?を作成
  const placeholders = items.map(() => '?').join(', ')
  // リクエストIDのうち、対象categoryId内でDBに存在するブックマークを全件取得
  const existing = await c.env.DB.prepare(
    `SELECT id FROM bookmarks WHERE category_id = ? AND id IN (${placeholders})`,
  )
    .bind(categoryId, ...items.map((item) => item.id))
    .all<{ id: string }>()
  // 一致件数がリクエスト件数より少ないなら409 CONFLICTを返す
  if ((existing.results ?? []).length !== items.length) {
    return conflict(c, 'items contains unknown bookmarks or bookmarks outside category')
  }

  // 指定categoryId内のブックマーク並び順を一括更新
  await c.env.DB.batch(
    items.map((item) =>
      c.env.DB.prepare('UPDATE bookmarks SET sort_order = ? WHERE id = ? AND category_id = ?').bind(
        item.sortOrder,
        item.id,
        categoryId,
      ),
    ),
  )

  // 更新後のブックマークを対象categoryId内かつ更新対象IDに絞って再取得
  const updated = await c.env.DB.prepare(
    `
    SELECT id, category_id, name, url, sort_order
    FROM bookmarks
    WHERE category_id = ? AND id IN (${placeholders})
    ORDER BY sort_order ASC, name ASC
    `,
  )
    .bind(categoryId, ...items.map((item) => item.id))
    .all<BookmarkRow>()
  // DB行形式をAPIレスポンス形式に変換
  const data = (updated.results ?? []).map(toBookmark)
  // 更新後の一覧データと件数を返却
  return c.json(success(data, { total: data.length }))
})

app.get('/api/bookmark-tree', async (c) => {
  // カテゴリーデータを並び順とカテゴリー名の昇順で取得
  const categoriesResult = await c.env.DB.prepare(
    'SELECT id, name, sort_order FROM categories ORDER BY sort_order ASC, name ASC',
  ).all<CategoryRow>()
  // ブックマークデータをカテゴリーID・並び順・ブックマーク名の昇順で取得
  const bookmarksResult = await c.env.DB.prepare(
    'SELECT id, category_id, name, url, sort_order FROM bookmarks ORDER BY category_id ASC, sort_order ASC, name ASC',
  ).all<BookmarkRow>()

  // ブックマークデータからカテゴリーIDを覗いたMapオブジェクトを作成
  const bookmarksByCategory = new Map<string, Omit<Bookmark, 'categoryId'>[]>()
  // ブックマーク一覧をカテゴリID単位でグルーピング
  for (const row of bookmarksResult.results ?? []) {
    // DB行形式をAPI処理用のBookmark形式に変換
    const bookmark = toBookmark(row)
    // categoryIdはMapのキーで管理するため、値側には含めない
    const item = {
      id: bookmark.id,
      name: bookmark.name,
      url: bookmark.url,
      sortOrder: bookmark.sortOrder,
    }
    // 既存のカテゴリ配下ブックマーク配列を取得(未作成なら空配列を使用)
    const bookmarks = bookmarksByCategory.get(bookmark.categoryId) ?? []
    // 現在のブックマークをカテゴリ配下配列に追加
    bookmarks.push(item)
    // 更新後の配列をカテゴリIDキーでMapに保存
    bookmarksByCategory.set(bookmark.categoryId, bookmarks)
  }

  // カテゴリ一覧を並び順どおりに走査し、各カテゴリに紐づくブックマーク配列を付与してツリー形にする
  const data = (categoriesResult.results ?? []).map((row) => ({
    ...toCategory(row),
    // 事前にMapへ集約したブックマークをcategoryIdで引き当てる(無ければ空配列)
    bookmarks: bookmarksByCategory.get(row.id) ?? [],
  }))
  // 全ブックマーク件数
  const bookmarkTotal = (bookmarksResult.results ?? []).length

  // カテゴリ＋配下ブックマークのツリー(data)と、カテゴリ件数・ブックマーク総数(meta)を返す
  return c.json(success(data, { categoryTotal: data.length, bookmarkTotal }))
})

// どのルートにも一致しなかったリクエストに共通の404レスポンスを返す
app.notFound((c) => errorResponse(c, 404, 'NOT_FOUND', 'not found'))

// ハンドラ内で捕捉されなかった例外をログ出力し、共通の500レスポンスを返す
app.onError((err, c) => {
  console.error(err)
  return errorResponse(c, 500, 'INTERNAL_SERVER_ERROR', 'Internal server error')
})

export default app
