import app from '../src/index'
import { env } from 'cloudflare:workers'
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'

const ADMIN_TOKEN = 'test-admin-token'
const authHeaders = { Authorization: `Bearer ${ADMIN_TOKEN}` }

async function fetchApi(path: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext()
  const req = new Request(`http://test${path}`, init)
  const res = await app.fetch(req, { ...env, ADMIN_TOKEN }, ctx)
  await waitOnExecutionContext(ctx)
  return res
}

describe('GET /api/categories', () => {
  it('returns categories with bookmark counts', async () => {
    const res = await fetchApi('/api/categories')
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

describe('GET /api/categories/:categoryId', () => {
  it('returns one category', async () => {
    const res = await fetchApi('/api/categories/category_tools')
    expect(res.status).toBe(200)
    const json = (await res.json()) as { data: { id: string; name: string } }
    expect(json.data.id).toBe('category_tools')
  })

  it('returns 404 for unknown id', async () => {
    const res = await fetchApi('/api/categories/unknown_cat')
    expect(res.status).toBe(404)
  })
})

describe('auth on mutating /api/*', () => {
  it('returns 401 without Bearer', async () => {
    const res = await fetchApi('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'X', sortOrder: 1 }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 403 for wrong token', async () => {
    const res = await fetchApi('/api/categories', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer wrong',
      },
      body: JSON.stringify({ name: 'X', sortOrder: 1 }),
    })
    expect(res.status).toBe(403)
  })
})

describe('POST /api/categories', () => {
  it('creates a category', async () => {
    const res = await fetchApi('/api/categories', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Vitestカテゴリ', sortOrder: 999 }),
    })
    expect(res.status).toBe(201)
    const json = (await res.json()) as { data: { id: string; name: string; sortOrder: number } }
    expect(json.data.name).toBe('Vitestカテゴリ')
    expect(json.data.sortOrder).toBe(999)
    expect(json.data.id).toMatch(/^catrgory_/)
  })

  it('returns 422 when id is sent in body', async () => {
    const res = await fetchApi('/api/categories', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'x', name: 'Y', sortOrder: 1 }),
    })
    expect(res.status).toBe(422)
  })
})

describe('PATCH /api/categories/reorder', () => {
  it('reorders categories', async () => {
    const list = await fetchApi('/api/categories')
    const { data } = (await list.json()) as { data: { id: string; sortOrder: number }[] }
    const reordered = [...data].reverse().map((c, i) => ({ id: c.id, sortOrder: (i + 1) * 10 }))
    const res = await fetchApi('/api/categories/reorder', {
      method: 'PATCH',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: reordered }),
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as { data: { id: string; sortOrder: number }[] }
    expect(json.data.length).toBe(reordered.length)
  })

  it('returns 409 when id is unknown', async () => {
    const res = await fetchApi('/api/categories/reorder', {
      method: 'PATCH',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ id: 'category_tools', sortOrder: 1 }, { id: 'no_such_category', sortOrder: 2 }],
      }),
    })
    expect(res.status).toBe(409)
  })
})

describe('PUT/PATCH/DELETE /api/categories/:categoryId', () => {
  it('PUT updates category', async () => {
    const res = await fetchApi('/api/categories/category_mcp', {
      method: 'PUT',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'MCPサーバ更新', sortOrder: 55 }),
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as { data: { name: string; sortOrder: number } }
    expect(json.data.name).toBe('MCPサーバ更新')
    expect(json.data.sortOrder).toBe(55)
  })

  it('PATCH partially updates', async () => {
    const res = await fetchApi('/api/categories/category_mcp', {
      method: 'PATCH',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'MCPサーバ' }),
    })
    expect(res.status).toBe(200)
  })

  it('DELETE returns 409 when category has bookmarks', async () => {
    const res = await fetchApi('/api/categories/category_tools', { method: 'DELETE', headers: authHeaders })
    expect(res.status).toBe(409)
  })

  it('DELETE removes empty category', async () => {
    const create = await fetchApi('/api/categories', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '削除用', sortOrder: 9000 }),
    })
    const { data } = (await create.json()) as { data: { id: string } }
    const del = await fetchApi(`/api/categories/${data.id}`, { method: 'DELETE', headers: authHeaders })
    expect(del.status).toBe(204)
  })
})

describe('GET /api/bookmarks', () => {
  it('lists with pagination meta', async () => {
    const res = await fetchApi('/api/bookmarks?limit=2&offset=0')
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
    const res = await fetchApi('/api/bookmarks?categoryId=category_mcp')
    expect(res.status).toBe(200)
    const json = (await res.json()) as { data: { categoryId: string }[]; meta: { total: number } }
    expect(json.meta.total).toBe(3)
    json.data.forEach((b) => expect(b.categoryId).toBe('category_mcp'))
  })

  it('returns 422 for invalid limit', async () => {
    const res = await fetchApi('/api/bookmarks?limit=0')
    expect(res.status).toBe(422)
  })
})

describe('POST /api/bookmarks', () => {
  it('creates bookmark in category', async () => {
    const res = await fetchApi('/api/bookmarks', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
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
    const res = await fetchApi('/api/bookmarks', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
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

describe('GET/PUT/PATCH/DELETE /api/bookmarks/:bookmarkId', () => {
  it('GET returns bookmark', async () => {
    const res = await fetchApi('/api/bookmarks/bookmark_001')
    expect(res.status).toBe(200)
    const json = (await res.json()) as { data: { id: string } }
    expect(json.data.id).toBe('bookmark_001')
  })

  it('PUT updates bookmark', async () => {
    const res = await fetchApi('/api/bookmarks/bookmark_001', {
      method: 'PUT',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
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
    const res = await fetchApi('/api/bookmarks/bookmark_001', {
      method: 'PATCH',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Markdown2PDF' }),
    })
    expect(res.status).toBe(200)
  })

  it('DELETE removes bookmark', async () => {
    const create = await fetchApi('/api/bookmarks', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categoryId: 'category_design',
        name: 'tmp-del',
        url: 'https://example.com/tmp-del',
        sortOrder: 9998,
      }),
    })
    const { data } = (await create.json()) as { data: { id: string } }
    const del = await fetchApi(`/api/bookmarks/${data.id}`, { method: 'DELETE', headers: authHeaders })
    expect(del.status).toBe(204)
  })
})

describe('GET /api/categories/:categoryId/bookmarks', () => {
  it('returns 404 for unknown category', async () => {
    const res = await fetchApi('/api/categories/unknown_cat/bookmarks')
    expect(res.status).toBe(404)
  })

  it('returns bookmarks for category', async () => {
    const res = await fetchApi('/api/categories/category_mcp/bookmarks')
    expect(res.status).toBe(200)
    const json = (await res.json()) as { data: unknown[]; meta: { total: number } }
    expect(json.meta.total).toBe(3)
  })
})

describe('PATCH /api/categories/:categoryId/bookmarks/reorder', () => {
  it('returns 404 for unknown category', async () => {
    const res = await fetchApi('/api/categories/unknown_cat/bookmarks/reorder', {
      method: 'PATCH',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ id: 'bookmark_001', sortOrder: 1 }] }),
    })
    expect(res.status).toBe(404)
  })

  it('reorders bookmarks in category', async () => {
    const res = await fetchApi('/api/categories/category_mcp/bookmarks/reorder', {
      method: 'PATCH',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
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

describe('GET /api/bookmark-tree', () => {
  it('returns nested tree', async () => {
    const res = await fetchApi('/api/bookmark-tree')
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
    const res = await fetchApi('/api/no-such-route')
    expect(res.status).toBe(404)
    const json = (await res.json()) as { error: { code: string } }
    expect(json.error.code).toBe('NOT_FOUND')
  })
})
