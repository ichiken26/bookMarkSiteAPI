import type { Context } from 'hono'
import type { Bindings } from '../type'

type JsonObject = Record<string, unknown>
type AppContext = Context<{ Bindings: Bindings }>

// APIの成功レスポンスを管理
export const success = <T,>(data: T, meta?: JsonObject) => ({ data, ...(meta ? { meta } : {}) })

/** エラーレスポンスを管理
 * @param c Honoのリクエストコンテキスト
 * @param status HTTPステータスコード（400:不正リクエスト、401:認証エラー、403:認可エラー、404:未検出、409:競合、422:バリデーションエラー、500:サーバー内部エラー）
 * @param code エラー識別子
 * @param message エラーメッセージ
 */
export const errorResponse = (
  c: AppContext,
  status: 400 | 401 | 403 | 404 | 409 | 422 | 500,
  code: string,
  message: string,
) => c.json({ error: { code, message } }, status)

/** バリデーション失敗時のエラーレスポンス（422 / VALIDATION_ERROR）を返す
 * @param c Honoのリクエストコンテキスト
 * @param message バリデーションエラーメッセージ
 */
export const validationError = (
  c: AppContext,
  message: string,
) => errorResponse(c, 422, 'VALIDATION_ERROR', message)

/** リソース未検出時のエラーレスポンス（404 / NOT_FOUND）を返す
 * @param c Honoのリクエストコンテキスト
 * @param message 未検出エラーメッセージ
 */
export const notFound = (
  c: AppContext,
  message: string,
) => errorResponse(c, 404, 'NOT_FOUND', message)

/** 競合発生時のエラーレスポンス（409 / CONFLICT）を返す
 * @param c Honoのリクエストコンテキスト
 * @param message 競合エラーメッセージ
 */
export const conflict = (
  c: AppContext,
  message: string,
) => errorResponse(c, 409, 'CONFLICT', message)
