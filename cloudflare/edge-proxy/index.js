/**
 * xdremux.app edge proxy.
 *
 * The site itself is built and published by GitHub Actions to GitHub Pages
 * (see .github/workflows/deploy-pages.yml). This Worker exists only so that
 * https://xdremux.app is served from Cloudflare with DNS + TLS managed by
 * Cloudflare, without duplicating the deployment. Responses are cached with
 * the Cache API, so only a cache miss reaches GitHub Pages.
 */
const ORIGIN = 'https://beetman.github.io'
const BASE_PATH = '/xdremux-site'
const APEX = 'xdremux.app'

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    // http -> https, www -> apex
    if (url.protocol !== 'https:' || url.hostname === `www.${APEX}`) {
      url.protocol = 'https:'
      url.hostname = APEX
      return Response.redirect(url.toString(), 301)
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { allow: 'GET, HEAD', 'content-type': 'text/plain; charset=utf-8' },
      })
    }

    const cache = caches.default
    const cacheKey = new Request(url.toString())
    const cached = await cache.match(cacheKey)
    if (cached) return cached

    const target = new URL(BASE_PATH + url.pathname + url.search, ORIGIN)
    const upstream = await fetch(target.toString(), {
      method: request.method,
      headers: {
        accept: request.headers.get('accept') || '*/*',
        'user-agent': request.headers.get('user-agent') || 'xdremux-edge-proxy',
      },
      redirect: 'follow',
    })

    const headers = new Headers(upstream.headers)
    for (const h of ['content-encoding', 'transfer-encoding', 'connection', 'set-cookie']) {
      headers.delete(h)
    }
    const isAsset = /\.[a-z0-9]{2,5}$/i.test(url.pathname)
    headers.set(
      'cache-control',
      isAsset ? 'public, max-age=3600, s-maxage=86400' : 'public, max-age=60, s-maxage=300',
    )
    headers.set('x-xdremux-origin', 'github-pages')

    const response = new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    })

    if (response.status === 200) {
      ctx.waitUntil(cache.put(cacheKey, response.clone()))
    }
    return response
  },
}
