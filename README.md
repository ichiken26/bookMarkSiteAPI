# Bookmark API Worker

Hono and Cloudflare D1 API for the bookmark site.

- Public read-only API: `https://bookmark.kokage-studio.com/api/v1/`
- Zero Trust protected CMS API: `https://bookmark.kokage-studio.com/admin/api/v1/`

The public route accepts `GET`, `HEAD`, and `OPTIONS`. Create, update, reorder,
and delete operations are available only on the admin route. Both prefixes mount
the same handlers, so response contracts and validation stay consistent.

For local development:

```sh
npm install
npm run db:migrate:local
npm run dev
```

Copy `.dev.vars.example` to `.dev.vars` only when overriding `CORS_ORIGIN`.
Deploy with `npm run deploy`. `wrangler.jsonc` configures both custom-domain
routes and disables the default development hostname to prevent route bypass.

See [APIspec.md](./APIspec.md) for the contract and
[FrontendBusinessLogic.md](./FrontendBusinessLogic.md) for client behavior.
