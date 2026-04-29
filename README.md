```txt
npm install
npm run dev
```

```txt
npm run deploy
```

Write APIs (`POST`, `PUT`, `PATCH`, `DELETE`) require a bearer token.

```txt
wrangler secret put ADMIN_TOKEN
```

Then send it from the CMS as:

```txt
Authorization: Bearer <ADMIN_TOKEN>
```

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
npm run cf-typegen
```

Pass the `CloudflareBindings` as generics when instantiation `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>()
```
