# Frontend business logic

## Public site

The public site reads from `/api/v1`. Load `GET /categories` first, then fetch
`GET /categories/:categoryId/bookmarks` only when the category is expanded.
Cache each loaded category in memory and abort obsolete requests. The compatibility
tree endpoint is not used for initial rendering.

## CMS

The CMS is served below `/admin/`, which Cloudflare Zero Trust Access protects.
It sends every request to `/admin/api/v1` and loads categories immediately on
mount. No application-level credential is collected or stored by the browser.

Mutations retain the existing optimistic interaction rules:

- Disable duplicate submissions while a request is active.
- Show API validation and conflict messages in the page.
- After category mutation, refresh the category list.
- After bookmark mutation, refresh counts and each affected expanded category.
- Reordering sends the full ordered membership as `items`.
- Destructive actions require browser confirmation.

The public API must never be used for mutations. A non-read method there returns
`405`; this is intentional and must not be retried against another origin.
