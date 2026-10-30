// Run from the FE root after building with VITE_API_BASE_URL=/api.
// PLAYWRIGHT_MODULE may point to an existing Playwright install; no runtime download.
// TEST_BASE_URL optionally targets an already running localhost container.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const http = require('node:http'),
  fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict')
;(async () => {
  const dir = path.resolve(process.env.FE_REPO_PATH || '.')
  const { createStore } = await import(path.join(dir, 'mock/server.mjs'))
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://local').pathname
    let file = path.join(dir, 'dist', pathname)
    if (!file.startsWith(path.join(dir, 'dist'))) {
      res.writeHead(403)
      return res.end()
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory())
      file = path.join(dir, 'dist/index.html')
    const ext = path.extname(file)
    res.setHeader(
      'Content-Type',
      {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
      }[ext] || 'application/octet-stream',
    )
    res.end(fs.readFileSync(file))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = process.env.TEST_BASE_URL || `http://127.0.0.1:${server.address().port}`
  assert.equal(new URL(base).hostname, '127.0.0.1', 'synthetic browser smoke is localhost-only')
  let browser
  const results = []
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    for (const scenario of process.env.SCENARIO
      ? [process.env.SCENARIO]
      : [
          'disabled',
          'pending',
          'failed',
          'malformed',
          'unavailable_after_pending',
          'cached_true_then_disabled',
          'cached_true_then_failed',
          'cached_true_then_pending',
        ]) {
      console.log('Scenario: ' + scenario)
      const context = await browser.newContext(),
        page = await context.newPage()
      const store = createStore()
      const requests = [],
        errors = []
      let updates = 0,
        analysisCalls = 0,
        capabilityCalls = 0,
        releaseCapability
      const capWait = new Promise((resolve) => (releaseCapability = resolve))
      page.on('pageerror', (e) => errors.push(e.stack))
      if (process.env.DEBUG_SMOKE) {
        page.on('request', (r) => {
          if (r.url().includes('/api/')) console.log('request', r.url())
        })
        page.on('response', (r) => {
          if (r.url().includes('/api/')) console.log('response', r.status(), r.url())
        })
      }
      await page.route('**/*', async (route) => {
        const req = route.request(),
          url = new URL(req.url()),
          pathname = url.pathname
        if (url.origin !== base) return route.abort()
        if (!pathname.startsWith('/api/')) return route.continue()
        requests.push(req.method() + ' ' + pathname)
        let body,
          status = 200
        if (pathname === '/api/auth/refresh')
          body = {
            accessToken: 'synthetic',
            tokenType: 'Bearer',
            expiresIn: 1800,
            user: {
              id: 'fixture-user',
              displayName: 'GCP 합성 사용자',
              email: null,
              providers: ['google'],
            },
          }
        else if (pathname === '/api/auth/logout') status = 204
        else if (pathname === '/api/auth/providers')
          body = { providers: [{ id: 'google', name: 'Google' }], devTokenEnabled: false }
        else if (pathname === '/api/capabilities') {
          capabilityCalls++
          if (
            scenario === 'pending' ||
            (scenario === 'cached_true_then_pending' && capabilityCalls > 1)
          )
            await capWait
          body = { analysisEnabled: false, graphEnabled: false, discoveriesEnabled: false }
          if (
            scenario === 'failed' ||
            (scenario === 'cached_true_then_failed' && capabilityCalls > 1)
          ) {
            status = 503
            body = { error: { code: 'AI_UNAVAILABLE', message: 'synthetic capability failure' } }
          }
          if (scenario === 'malformed') body = { analysisEnabled: 'false', graphEnabled: 'false' }
          if (
            scenario === 'unavailable_after_pending' ||
            (scenario.startsWith('cached_true') && capabilityCalls === 1)
          )
            body = { analysisEnabled: true, graphEnabled: false, discoveriesEnabled: false }
        } else if (pathname.endsWith('/analysis')) {
          analysisCalls++
          if (
            scenario.startsWith('cached_true') ||
            (scenario === 'unavailable_after_pending' && analysisCalls === 1)
          )
            body = {
              job: {
                id: 'fixture-job',
                noteId: pathname.split('/')[3],
                noteVersion: 1,
                status: 'pending',
                errorMessage: null,
                createdAt: new Date().toISOString(),
                startedAt: null,
                finishedAt: null,
              },
            }
          else {
            status = 503
            body = {
              error: {
                code: 'AI_UNAVAILABLE',
                message: 'AI is off',
                details: { reason: 'NOT_DEPLOYED' },
              },
            }
          }
        } else if (pathname.endsWith('/graph')) {
          status = 503
          body = { error: { code: 'AI_UNAVAILABLE', message: 'AI is off' } }
        } else if (pathname === '/api/topics') body = store.listTopics()
        else if (pathname === '/api/notes' && req.method() === 'GET')
          body = store.listNotes(url.searchParams)
        else if (pathname === '/api/notes' && req.method() === 'POST') {
          body = store.createNote(req.postDataJSON())
          status = 201
        } else if (pathname.startsWith('/api/notes/') && req.method() === 'GET')
          body = store.getNote(pathname.split('/').at(-1))
        else if (pathname.startsWith('/api/notes/') && req.method() === 'PUT') {
          body = store.updateNote(pathname.split('/').at(-1), req.postDataJSON())
          updates++
        } else throw Error('Unexpected request ' + req.method() + ' ' + pathname)
        await route.fulfill({
          status,
          contentType: 'application/json',
          headers: { 'Cache-Control': 'no-store' },
          ...(body ? { body: JSON.stringify(body) } : {}),
        })
      })
      if (scenario.startsWith('cached_true')) await page.clock.install()
      await page.goto(base + '/auth/callback?returnTo=%2F')
      await page.getByRole('button', { name: '계정: GCP 합성 사용자' }).waitFor()
      await page.getByRole('button', { name: '새 노트', exact: true }).first().click()
      await page.getByRole('textbox', { name: '제목', exact: true }).fill('AI-off ' + scenario)
      const saved = page.waitForResponse(
        (r) => r.url().includes('/api/notes/') && r.request().method() === 'PUT',
      )
      await page.getByRole('textbox', { name: '제목', exact: true }).press('Tab')
      await saved
      assert.ok(updates > 0)
      assert.equal(await page.getByRole('complementary', { name: '개념·관계' }).count(), 0)
      assert.equal(await page.getByRole('button', { name: '다시 분석', exact: true }).count(), 0)
      if (scenario === 'pending') {
        assert.equal(analysisCalls, 0)
        releaseCapability()
        await page.waitForResponse((r) => r.url().endsWith('/capabilities'))
      }
      if (scenario.startsWith('cached_true')) {
        await page.clock.fastForward(31000)
        const refreshed = page.waitForResponse((r) => r.url().endsWith('/capabilities'))
        const refreshing = page.waitForRequest((r) => r.url().endsWith('/capabilities'))
        await page.evaluate(() => {
          Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'hidden',
          })
          window.dispatchEvent(new Event('visibilitychange'))
          Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'visible',
          })
          window.dispatchEvent(new Event('visibilitychange'))
        })
        await refreshing
        if (scenario === 'cached_true_then_pending') {
          await new Promise((r) => setTimeout(r, 100))
          const during = analysisCalls
          await page.clock.fastForward(6200)
          await new Promise((r) => setTimeout(r, 100))
          assert.equal(
            analysisCalls,
            during,
            'cached true must not authorize requests during failed/pending refresh',
          )
          releaseCapability()
        }
        await refreshed
        await new Promise((r) => setTimeout(r, 100))
        const count = analysisCalls
        await page.clock.fastForward(6200)
        await new Promise((r) => setTimeout(r, 100))
        assert.equal(
          analysisCalls,
          count,
          'cached true must not survive disabled/failed capability',
        )
      } else if (scenario === 'unavailable_after_pending') {
        await page.waitForResponse((r) => r.url().endsWith('/analysis') && r.status() === 503)
        const count = analysisCalls
        await page.waitForTimeout(6200)
        assert.equal(analysisCalls, count, 'cached pending job must stop polling on AI_UNAVAILABLE')
      } else {
        await page.waitForTimeout(2200)
        assert.equal(analysisCalls, 0)
      }
      assert.equal(requests.filter((x) => x.includes('/graph')).length, 0)
      await page.getByRole('button', { name: '계정: GCP 합성 사용자' }).click()
      const loggedOut = page.waitForResponse((r) => r.url().endsWith('/auth/providers'))
      await page.getByRole('menuitem', { name: '로그아웃' }).click()
      await loggedOut
      await page.getByRole('button', { name: 'Google로 계속하기' }).waitFor()
      await new Promise((r) => setTimeout(r, 100))
      assert.equal(requests.filter((x) => x.endsWith('/auth/refresh')).length, 1)
      assert.equal(requests.filter((x) => x.endsWith('/auth/logout')).length, 1)
      assert.deepEqual(errors, [])
      results.push({
        scenario,
        noteCreatedAndSaved: updates > 0,
        graphPanelHidden: true,
        graphRequests: 0,
        analysisCalls,
        refreshCalls: 1,
        logoutCalls: 1,
        pageErrors: [...errors],
        capabilityRequests: requests.filter((x) => x.endsWith('/capabilities')).length,
      })
      await context.close()
    }
    const result = {
      scope: 'local FE runtime + synthetic routed API; not GCP or OAuth-provider acceptance',
      results,
    }
    if (process.env.BROWSER_SMOKE_REPORT)
      fs.writeFileSync(process.env.BROWSER_SMOKE_REPORT, JSON.stringify(result, null, 2) + '\n')
    console.log(JSON.stringify(result))
  } finally {
    if (browser) await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})().catch((e) => {
  console.error(e.stack)
  process.exitCode = 1
})
