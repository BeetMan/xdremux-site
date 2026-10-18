// xdremux.app edge proxy (temp): serves the GitHub Pages build at the custom domain.
// Content still comes from BeetMan/xdremux-site via GitHub Actions -> GitHub Pages.
const ORIGIN = 'https://beetman.github.io'
const BASE = '/xdremux-site'
const APEX = 'xdremux.app'

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    if (url.protocol !== 'https:' || url.hostname === `www.${APEX}`) {
      url.protocol = 'https:'
      url.hostname = APEX
      return Response.redirect(url.toString(), 301)
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } })
    }
    const cache = caches.default
    const key = new Request(url.toString())
    const hit = await cache.match(key)
    if (hit) return hit
    const target = new URL(BASE + url.pathname + url.search, ORIGIN)
    const upstream = await fetch(target.toString(), {
      method: request.method,
      headers: {
        accept: request.headers.get('accept') || '*/*',
        'user-agent': request.headers.get('user-agent') || 'xdremux-edge',
      },
      redirect: 'follow',
    })
    const headers = new Headers(upstream.headers)
    for (const h of ['content-encoding', 'transfer-encoding', 'connection', 'set-cookie']) headers.delete(h)
    const isAsset = /\.[a-z0-9]{2,5}$/i.test(url.pathname)
    headers.set('cache-control', isAsset ? 'public, max-age=3600, s-maxage=86400' : 'no-cache, s-maxage=300')
    const res = new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers })
    if (res.status === 200) ctx.waitUntil(cache.put(key, res.clone()))
    return res
  },
}
