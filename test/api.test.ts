import app from '../src/index'
import { env } from 'cloudflare:workers'
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'

const jsonHeaders = { 'Content-Type': 'application/json' }

async function fetchPath(path: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext()
  const req = new Request(`http://test${path}`, init)
  const res = await app.fetch(req, env, ctx)
  await waitOnExecutionContext(ctx)
  return res
}

async function fetchApi(path: string, init?: RequestInit): Promise<Response> {
  const method = init?.method ?? 'GET'
  const routedPath = ['GET', 'HEAD', 'OPTIONS'].includes(method)
    ? path
    : path.replace('/api/v1', '/admin/api/v1')
  return fetchPath(routedPath, init)
}

describe('GET /api/v1/categories', () => {
  it('returns categories with bookmark counts', async () => {
    const res = await fetchApi('/api/v1/categories')
    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      data: Array<{ id: string; name: string; sortOrder: number; bookmarkCount: number }>
      meta: { total: number }
    }
    expect(json.meta.total).toBe(5)
    expect(json.data).toHaveLength(5)
    const tools = json.data.find((c) => c.id === 'category_tools')
    expect(tools?.bookmarkCount).toBe(3)
  })
})

describe('GET /api/v1/categories/:categoryId', () => {
  it('returns one category', async () => {
    const res = await fetchApi('/api/v1/categories/category_tools')
    expect(res.status).toBe(200)
    const json = (await res.json()) as { data: { id: string; name: string } }
    expect(json.data.id).toBe('category_tools')
  })

  it('returns 404 for unknown id', async () => {
    const res = await fetchApi('/api/v1/categories/unknown_cat')
    expect(res.status).toBe(404)
  })
})

describe('public /api/v1/* is read-only', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('returns 405 for public %s', async (method) => {
    const res = await fetchPath('/api/v1/categories', {
      method,
      headers: {
        ...jsonHeaders,
        Origin: 'https://bookmark.kokage-studio.com',
      },
      body: JSON.stringify({ name: 'X', sortOrder: 1 }),
    })

    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('GET, HEAD, OPTIONS')
    expect(res.headers.get('access-control-allow-origin')).toBe(
      'https://bookmark.kokage-studio.com',
    )
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('advertises only read methods during public preflight', async () => {
    const res = await fetchPath('/api/v1/categories', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://bookmark.kokage-studio.com',
        'Access-Control-Request-Method': 'POST',
      },
    })

    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-methods')).toBe('GET,HEAD,OPTIONS')
  })
})

describe('admin /admin/api/v1/*', () => {
  it('supports reads through the protected prefix', async () => {
    const res = await fetchPath('/admin/api/v1/categories')
    expect(res.status).toBe(200)
  })

  it('advertises CRUD methods during admin preflight', async () => {
    const res = await fetchPath('/admin/api/v1/categories', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://bookmark.kokage-studio.com',
        'Access-Control-Request-Method': 'POST',
      },
    })

    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-methods')).toBe(
      'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    )
  })
})

describe('POST /api/v1/categories', () => {
  it('creates a category', async () => {
    const res = await fetchApi('/api/v1/categories', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ name: 'Vitestカテゴリ', sortOrder: 999 }),
    })
    expect(res.status).toBe(201)
    const json = (await res.json()) as { data: { id: string; name: string; sortOrder: number } }
    expect(json.data.name).toBe('Vitestカテゴリ')
    expect(json.data.sortOrder).toBe(999)
    expect(json.data.id).toMatch(/^category_/)
  })

  it('returns 422 when id is sent in body', async () => {
    const res = await fetchApi('/api/v1/categories', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ id: 'x', name: 'Y', sortOrder: 1 }),
    })
    expect(res.status).toBe(422)
  })
})

describe('PATCH /api/v1/categories/reorder', () => {
  it('reorders categories', async () => {
    const list = await fetchApi('/api/v1/categories')
    const { data } = (await list.json()) as { data: { id: string; sortOrder: number }[] }
    const reordered = [...data].reverse().map((c, i) => ({ id: c.id, sortOrder: (i + 1) * 10 }))
    const res = await fetchApi('/api/v1/categories/reorder', {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({ items: reordered }),
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as { data: { id: string; sortOrder: number }[] }
    expect(json.data.length).toBe(reordered.length)
  })

  it('returns 409 when id is unknown', async () => {
    const res = await fetchApi('/api/v1/categories/reorder', {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({
        items: [{ id: 'category_tools', sortOrder: 1 }, { id: 'no_such_category', sortOrder: 2 }],
      }),
    })
    expect(res.status).toBe(409)
  })
})

describe('PUT/PATCH/DELETE /api/v1/categories/:categoryId', () => {
  it('PUT updates category', async () => {
    const res = await fetchApi('/api/v1/categories/category_mcp', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ name: 'MCPサーバ更新', sortOrder: 55 }),
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as { data: { name: string; sortOrder: number } }
    expect(json.data.name).toBe('MCPサーバ更新')
    expect(json.data.sortOrder).toBe(55)
  })

  it('PATCH partially updates', async () => {
    const res = await fetchApi('/api/v1/categories/category_mcp', {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({ name: 'MCPサーバ' }),
    })
    expect(res.status).toBe(200)
  })

  it('DELETE returns 409 when category has bookmarks', async () => {
    const res = await fetchApi('/api/v1/categories/category_tools', { method: 'DELETE' })
    expect(res.status).toBe(409)
  })

  it('DELETE removes empty category', async () => {
    const create = await fetchApi('/api/v1/categories', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ name: '削除用', sortOrder: 9000 }),
    })
    const { data } = (await create.json()) as { data: { id: string } }
    const del = await fetchApi(`/api/v1/categories/${data.id}`, { method: 'DELETE' })
    expect(del.status).toBe(204)
  })
})

describe('GET /api/v1/bookmarks', () => {
  it('lists with pagination meta', async () => {
    const res = await fetchApi('/api/v1/bookmarks?limit=2&offset=0')
    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      data: unknown[]
      meta: { total: number; limit: number; offset: number }
    }
    expect(json.meta.limit).toBe(2)
    expect(json.meta.offset).toBe(0)
    expect(json.meta.total).toBeGreaterThanOrEqual(29)
    expect(json.data).toHaveLength(2)
  })

  it('filters by categoryId', async () => {
    const res = await fetchApi('/api/v1/bookmarks?categoryId=category_mcp')
    expect(res.status).toBe(200)
    const json = (await res.json()) as { data: { categoryId: string }[]; meta: { total: number } }
    expect(json.meta.total).toBe(3)
    json.data.forEach((b) => expect(b.categoryId).toBe('category_mcp'))
  })

  it('returns 422 for invalid limit', async () => {
    const res = await fetchApi('/api/v1/bookmarks?limit=0')
    expect(res.status).toBe(422)
  })
})

describe('POST /api/v1/bookmarks', () => {
  it('creates bookmark in category', async () => {
    const res = await fetchApi('/api/v1/bookmarks', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        categoryId: 'category_tools',
        name: 'Vitestブックマーク',
        url: 'https://example.com/vitest',
        sortOrder: 9999,
      }),
    })
    expect(res.status).toBe(201)
    const json = (await res.json()) as { data: { id: string; url: string } }
    expect(json.data.url).toBe('https://example.com/vitest')
    expect(json.data.id).toMatch(/^bookmark_/)
  })

  it('returns 422 for unknown categoryId', async () => {
    const res = await fetchApi('/api/v1/bookmarks', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        categoryId: 'no_such',
        name: 'X',
        url: 'https://example.com/',
        sortOrder: 1,
      }),
    })
    expect(res.status).toBe(422)
  })
})

describe('GET/PUT/PATCH/DELETE /api/v1/bookmarks/:bookmarkId', () => {
  it('GET returns bookmark', async () => {
    const res = await fetchApi('/api/v1/bookmarks/bookmark_001')
    expect(res.status).toBe(200)
    const json = (await res.json()) as { data: { id: string } }
    expect(json.data.id).toBe('bookmark_001')
  })

  it('PUT updates bookmark', async () => {
    const res = await fetchApi('/api/v1/bookmarks/bookmark_001', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({
        categoryId: 'category_tools',
        name: 'Markdown2PDF更新',
        url: 'https://ichiken26.github.io/markdownConvertToPDF/',
        sortOrder: 10,
      }),
    })
    expect(res.status).toBe(200)
  })

  it('PATCH partially updates', async () => {
    const res = await fetchApi('/api/v1/bookmarks/bookmark_001', {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({ name: 'Markdown2PDF' }),
    })
    expect(res.status).toBe(200)
  })

  it('DELETE removes bookmark', async () => {
    const create = await fetchApi('/api/v1/bookmarks', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        categoryId: 'category_design',
        name: 'tmp-del',
        url: 'https://example.com/tmp-del',
        sortOrder: 9998,
      }),
    })
    const { data } = (await create.json()) as { data: { id: string } }
    const del = await fetchApi(`/api/v1/bookmarks/${data.id}`, { method: 'DELETE' })
    expect(del.status).toBe(204)
  })
})

describe('GET /api/v1/categories/:categoryId/bookmarks', () => {
  it('returns 404 for unknown category', async () => {
    const res = await fetchApi('/api/v1/categories/unknown_cat/bookmarks')
    expect(res.status).toBe(404)
  })

  it('returns bookmarks for category', async () => {
    const res = await fetchApi('/api/v1/categories/category_mcp/bookmarks')
    expect(res.status).toBe(200)
    const json = (await res.json()) as { data: unknown[]; meta: { total: number } }
    expect(json.meta.total).toBe(3)
  })
})

describe('PATCH /api/v1/categories/:categoryId/bookmarks/reorder', () => {
  it('returns 404 for unknown category', async () => {
    const res = await fetchApi('/api/v1/categories/unknown_cat/bookmarks/reorder', {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({ items: [{ id: 'bookmark_001', sortOrder: 1 }] }),
    })
    expect(res.status).toBe(404)
  })

  it('reorders bookmarks in category', async () => {
    const res = await fetchApi('/api/v1/categories/category_mcp/bookmarks/reorder', {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({
        items: [
          { id: 'bookmark_029', sortOrder: 10 },
          { id: 'bookmark_028', sortOrder: 20 },
          { id: 'bookmark_027', sortOrder: 30 },
        ],
      }),
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as { data: { id: string; sortOrder: number }[] }
    expect(json.data).toHaveLength(3)
  })
})

describe('GET /api/v1/bookmark-tree', () => {
  it('returns nested tree', async () => {
    const res = await fetchApi('/api/v1/bookmark-tree')
    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      data: Array<{ id: string; bookmarks: { id: string }[] }>
      meta: { categoryTotal: number; bookmarkTotal: number }
    }
    expect(json.meta.categoryTotal).toBeGreaterThanOrEqual(5)
    expect(json.meta.bookmarkTotal).toBeGreaterThanOrEqual(29)
    const tools = json.data.find((c) => c.id === 'category_tools')
    expect(tools?.bookmarks.length).toBeGreaterThanOrEqual(2)
  })
})

describe('not found', () => {
  it('returns JSON 404 for unknown path', async () => {
    const res = await fetchApi('/api/v1/no-such-route')
    expect(res.status).toBe(404)
    const json = (await res.json()) as { error: { code: string } }
    expect(json.error.code).toBe('NOT_FOUND')
  })

  it('does not expose the former unversioned contract', async () => {
    const res = await fetchApi('/api/categories')
    expect(res.status).toBe(404)
  })
})

describe('security headers and CORS', () => {
  it('allows the production same origin and emits hardening headers', async () => {
    const res = await fetchApi('/api/v1/categories', {
      headers: { Origin: 'https://bookmark.kokage-studio.com' },
    })
    expect(res.headers.get('access-control-allow-origin')).toBe('https://bookmark.kokage-studio.com')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
  })

  it('does not allow an untrusted browser origin by default', async () => {
    const res = await fetchApi('/api/v1/categories', {
      headers: { Origin: 'https://attacker.example' },
    })
    expect(res.headers.get('access-control-allow-origin')).not.toBe('https://attacker.example')
  })
})
