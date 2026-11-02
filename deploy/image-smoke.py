#!/usr/bin/env python3
"""Disposable amd64 image checks against synthetic HTTP fixtures, never real users."""
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.request
import urllib.error
import uuid

IMAGE = os.environ.get('TEST_IMAGE', 'capstone-ci:test')
PREFIX = 'capstone-fe-image-' + uuid.uuid4().hex[:12]
created = []
network = False


def docker(*args):
    result = subprocess.run(['docker', *args], capture_output=True, text=True, timeout=180)
    if result.returncode:
        raise RuntimeError('Image test Docker operation failed (output suppressed)')
    return result.stdout.strip()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


def request(port, path, method='GET', data=None, headers=None):
    req = urllib.request.Request(f'http://127.0.0.1:{port}' + path, method=method, data=data, headers=headers or {})
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=15) as response:
            return response.status, response.read(), response.headers
    except urllib.error.HTTPError as error:
        return error.code, error.read(), error.headers


def start_web(suffix, mode=None):
    name = PREFIX + suffix
    created.append(name)
    extra = ['-e', 'CAPSTONE_WEB_MODE=' + mode] if mode else []
    docker('run', '-d', '--name', name, '--network', PREFIX, '--platform', 'linux/amd64',
           '--read-only', '--tmpfs', '/tmp:rw,nosuid,size=32m', '--cap-drop', 'ALL',
           '--security-opt', 'no-new-privileges:true', '-p', '127.0.0.1::8080', *extra, IMAGE)
    port = int(docker('port', name, '8080/tcp').split(':')[-1])
    for _ in range(30):
        try:
            if request(port, '/healthz')[0] == 200:
                return port
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(1)
    raise RuntimeError('FE startup timeout')


def proxy_checks(port):
    status, body, headers = request(port, '/api/method', 'DELETE')
    assert status == 405 and json.loads(body)['error']['code'] == 'METHOD_NOT_ALLOWED'
    assert headers['Allow'] == 'GET, POST' and 'no-store' in headers['Cache-Control']
    status, body, headers = request(port, '/api/capabilities')
    assert status == 200 and json.loads(body) == {
        'analysisEnabled': False, 'graphEnabled': False, 'discoveriesEnabled': False}
    assert 'no-store' in headers['Cache-Control']
    status, body, headers = request(port, '/api/notes/fixture/analysis', 'POST')
    assert status == 503 and json.loads(body)['error']['details']['reason'] == 'NOT_DEPLOYED'
    assert 'Retry-After' not in headers and 'no-store' in headers['Cache-Control']
    status, body, headers = request(port, '/api/auth/refresh', 'POST')
    assert status == 200 and json.loads(body)['accessToken'] == 'synthetic-not-a-token'
    assert 'Path=/api/auth; HttpOnly; Secure; SameSite=Strict' in headers['Set-Cookie']
    status, body, headers = request(port, '/api/auth/logout', 'POST')
    assert status == 204 and body == b'' and 'Max-Age=0' in headers['Set-Cookie']
    status, _, headers = request(port, '/api/auth/oauth2/google/callback?code=synthetic')
    assert status == 302 and headers['Location'] == '/auth/callback?returnTo=%2Fnotes%2Ffixture'
    status, body, headers = request(port, '/api/probe?keep=yes', 'POST', b'x' * (12 * 1024 * 1024),
                                    {'Authorization': 'Bearer probe', 'Cookie': 'probe=one',
                                     'Origin': 'https://capsnote.art', 'Content-Type': 'application/json'})
    assert status == 403 and json.loads(body) == {
        'url': '/api/probe?keep=yes', 'authorization': 'Bearer probe', 'cookie': 'probe=one',
        'origin': 'https://capsnote.art', 'bodyBytes': 12 * 1024 * 1024}
    assert headers['Set-Cookie'] == 'probe=ok; HttpOnly; Secure; SameSite=Strict'


try:
    metadata = json.loads(docker('image', 'inspect', IMAGE))[0]
    assert metadata['Architecture'] == 'amd64' and metadata['Os'] == 'linux'
    assert metadata['Config']['User'].split(':')[0] not in ['', 'root', '0']
    docker('network', 'create', PREFIX)
    network = True
    port = start_web('-api')
    status, body, headers = request(port, '/auth/callback')
    assert status == 200 and b'api-only' in body and headers['Cache-Control'] == 'no-store'
    for path in ['/actuator/health', '/swagger-ui.html', '/v3/api-docs', '/internal', '/ai', '/api/auth/dev/token']:
        assert request(port, path)[0] == 404, path
    assert request(port, '/api/notes')[0] == 502
    helper = os.environ.get('PROXY_TEST_HELPER')
    if not helper:
        raise RuntimeError('PROXY_TEST_HELPER required for full image acceptance')
    backend = PREFIX + '-echo'
    created.append(backend)
    code = Path(__file__).with_name('proxy-fixture.cjs').read_text()
    docker('run', '-d', '--name', backend, '--network', PREFIX, '--network-alias', 'be',
           '--platform', 'linux/amd64', '--entrypoint', 'node', helper, '-e', code)
    for _ in range(30):
        if request(port, '/api/capabilities')[0] == 200:
            break
        time.sleep(1)
    else:
        raise RuntimeError('Synthetic backend startup timeout')
    proxy_checks(port)
    notes_port = start_web('-notes', 'notes-web')
    for path in ['/', '/auth/callback?returnTo=%2Fnotes%2Ffixture', '/notes/fixture']:
        status, body, headers = request(notes_port, path)
        assert status == 200 and b'/assets/' in body and b'api-only' not in body
        assert headers['Cache-Control'] == 'no-store'
    proxy_checks(notes_port)
    print(json.dumps({'amd64': True, 'nonRoot': True, 'apiOnlyDefault': True, 'notesWebSpa': True,
                      'apiStatusBodyAllowPreserved': True, 'noStore': True, 'refreshLogoutCookie': True,
                      'oauthRedirect': True, 'aiOff503NoRetryAfter': True, 'syntheticOnly': True}))
finally:
    for name in reversed(created):
        subprocess.run(['docker', 'rm', '-f', '-v', name], capture_output=True)
    if network:
        subprocess.run(['docker', 'network', 'rm', PREFIX], capture_output=True)
