# Bookmark API specification

## Access model

- Public base: `https://bookmark.kokage-studio.com/api/v1`
- Admin base: `https://bookmark.kokage-studio.com/admin/api/v1`
- The public base accepts only `GET`, `HEAD`, and `OPTIONS`. Other methods return `405 METHOD_NOT_ALLOWED`.
- The admin base exposes the same reads plus all mutations. Cloudflare Zero Trust Access protects `/admin/*`, including the admin API.
- The API Worker disables its `workers.dev` endpoint so requests cannot bypass the configured custom-domain routes.

Responses use `{ "data": ..., "meta"?: ... }` on success and
`{ "error": { "code": string, "message": string, "details"?: unknown } }` on failure.

## Resources

Public reads (also available below the admin base):

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/categories` | List categories with bookmark counts. |
| GET | `/categories/:categoryId` | Read one category. |
| GET | `/bookmarks` | List bookmarks; supports `categoryId`, `limit`, and `offset`. |
| GET | `/bookmarks/:bookmarkId` | Read one bookmark. |
| GET | `/categories/:categoryId/bookmarks` | List a category's bookmarks. |
| GET | `/bookmark-tree` | Deprecated compatibility tree. |

Admin mutations:

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/categories` | Create a category. |
| PUT / PATCH / DELETE | `/categories/:categoryId` | Replace, update, or delete a category. |
| PATCH | `/categories/reorder` | Reorder categories. |
| POST | `/bookmarks` | Create a bookmark. |
| PUT / PATCH / DELETE | `/bookmarks/:bookmarkId` | Replace, update, or delete a bookmark. |
| PATCH | `/categories/:categoryId/bookmarks/reorder` | Reorder bookmarks in a category. |

## Validation and status codes

- IDs are server-generated; a client-supplied create ID returns `422`.
- Names are trimmed and must be non-empty strings.
- Bookmark URLs must be valid `http` or `https` URLs.
- `sortOrder` must be a valid integer where supplied.
- Full replacements require every mutable field; partial updates accept only supplied fields.
- Reorder payloads use `{ "items": [{ "id": string, "sortOrder": number }] }`, reject duplicate or unknown IDs, and preserve the existing membership checks.
- Deleting a non-empty category returns `409`.
- Missing resources return `404`; malformed JSON returns `400`; validation failures return `422`.

## CORS and routing

`CORS_ORIGIN` is an optional comma-separated exact-origin allowlist. If unset, the shared production origin is allowed. The API route configuration must include both `/api/v1/*` and `/admin/api/v1/*`; the latter is more specific than the CMS asset route.
