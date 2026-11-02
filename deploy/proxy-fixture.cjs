// Synthetic local HTTP data only. This server never authenticates a real user.
require('node:http').createServer((request, response) => {
  const chunks = [];
  request.on('data', chunk => chunks.push(chunk));
  request.on('end', () => {
    const path = new URL(request.url, 'http://fixture').pathname;
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
    let status = 200;
    let body;
    if (path === '/api/capabilities') {
      body = { analysisEnabled: false, graphEnabled: false, discoveriesEnabled: false };
    } else if (path === '/api/auth/refresh') {
      headers['Set-Cookie'] = 'CAPSTONE_REFRESH=synthetic; Path=/api/auth; HttpOnly; Secure; SameSite=Strict';
      body = { accessToken: 'synthetic-not-a-token', tokenType: 'Bearer' };
    } else if (path === '/api/auth/logout') {
      headers['Set-Cookie'] = 'CAPSTONE_REFRESH=; Max-Age=0; Path=/api/auth; HttpOnly; Secure; SameSite=Strict';
      status = 204;
    } else if (path === '/api/auth/oauth2/google/callback') {
      headers.Location = '/auth/callback?returnTo=%2Fnotes%2Ffixture';
      status = 302;
    } else if (path === '/api/method') {
      headers.Allow = 'GET, POST';
      status = 405;
      body = { error: { code: 'METHOD_NOT_ALLOWED', message: 'synthetic' } };
    } else if (path === '/api/notes/fixture/analysis') {
      status = 503;
      body = { error: { code: 'AI_UNAVAILABLE', message: 'synthetic', details: { reason: 'NOT_DEPLOYED' } } };
    } else {
      status = 403;
      headers['Set-Cookie'] = 'probe=ok; HttpOnly; Secure; SameSite=Strict';
      body = { url: request.url, authorization: request.headers.authorization,
        cookie: request.headers.cookie, origin: request.headers.origin,
        bodyBytes: Buffer.concat(chunks).length };
    }
    response.writeHead(status, headers);
    response.end(body ? JSON.stringify(body) : undefined);
  });
}).listen(8080);
