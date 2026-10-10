#!/usr/bin/env python3
"""Isolated disposable image checks; never use AWS, real OAuth, or existing databases."""
import json
import os
import secrets
import subprocess
import time
import urllib.request
import urllib.error
import uuid

IMAGE=os.environ.get('TEST_IMAGE','capstone-ci:test')
PREFIX='capstone-image-test-'+uuid.uuid4().hex[:12]
created=[]
network=False

def docker(*args,env=None,input=None):
    result=subprocess.run(['docker',*args],capture_output=True,text=True,env=env,input=input,timeout=180)
    if result.returncode: raise RuntimeError('Image test Docker operation failed (output suppressed)')
    return result.stdout.strip()

def request(port,path,method='GET'):
    try:
        r=urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{port}'+path,method=method),timeout=3)
        with r: return r.status,r.read(),dict(r.headers)
    except urllib.error.HTTPError as e: return e.code,e.read(),dict(e.headers)

def mapped(name,port):
    return int(docker('port',name,str(port)+'/tcp').split(':')[-1])

try:
    metadata=json.loads(docker('image','inspect',IMAGE))[0]
    assert metadata['Architecture']=='amd64' and metadata['Os']=='linux'
    assert metadata['Config']['User'] not in ['', 'root','0','0:0']
    docker('network','create',PREFIX);network=True
    if False:
        db=PREFIX+'-db';created.append(db)
        password=secrets.token_urlsafe(36)
        env=dict(os.environ,POSTGRES_PASSWORD=password)
        docker('run','-d','--name',db,'--network',PREFIX,'--network-alias','db','-e','POSTGRES_PASSWORD','-e','POSTGRES_DB=capstone','--tmpfs','/var/lib/postgresql/data:rw,nosuid,size=256m','postgres:16.15@sha256:ca0bd484cb98bf4b24eb1010e73fb3fcbd6714d240fbc1a10eea5b7dbecb641d',env=env)
        for _ in range(60):
            p=subprocess.run(['docker','exec',db,'pg_isready','-U','postgres'],capture_output=True)
            if p.returncode==0: break
            time.sleep(1)
        else: raise RuntimeError('Disposable DB startup timeout')
        name=PREFIX+'-be';created.append(name)
        # Generated test secrets go through stdin to container tmpfs, never a host artifact or argument.
        props='spring.datasource.url=jdbc:postgresql://db:5432/capstone\nspring.datasource.username=postgres\nspring.datasource.password='+password+'\ncapstone.auth.jwt.secret='+secrets.token_urlsafe(48)+'\ncapstone.auth.app-url=https://capsnote.art\ncapstone.auth.google.enabled=false\ncapstone.auth.dev-token.enabled=false\n'
        docker('run','-d','--name',name,'--network',PREFIX,'--network-alias','be','--platform','linux/amd64','--read-only','--tmpfs','/tmp:rw,nosuid,size=128m','--cap-drop','ALL','--security-opt','no-new-privileges:true','-e','SPRING_PROFILES_ACTIVE=prod','-e','SPRING_CONFIG_ADDITIONAL_LOCATION=file:/tmp/be.properties','-p','127.0.0.1::8080','--entrypoint','/bin/sh',IMAGE,'-c','while test ! -f /tmp/start.marker; do sleep 1; done; exec java -jar /app/app.jar')
        docker('exec','-i',name,'/bin/sh','-c','umask 077; cat > /tmp/be.properties; touch /tmp/start.marker',input=props)
        port=mapped(name,8080)
        for _ in range(90):
            try:
                status,body,_=request(port,'/actuator/health')
                if status==200 and json.loads(body)['status']=='UP':break
            except Exception:pass
            time.sleep(2)
        else:raise RuntimeError('BE database health timeout; application output suppressed')
        assert request(port,'/api/v1/health')[0]==200
        assert request(port,'/api/notes')[0]==401
        assert request(port,'/api/auth/dev/token','POST')[0] in [404,403]
        docker('exec',name,'java','-cp','/app/health','Healthcheck')
        print(json.dumps({'amd64':True,'nonRoot':True,'flywayJpaDbHealth':True,'unauthenticatedNotes401':True,'productionDevTokenDisabled':True,'imageHealthcheck':True}))
    else:
        name=PREFIX+'-web';created.append(name)
        docker('run','-d','--name',name,'--network',PREFIX,'--platform','linux/amd64','--read-only','--tmpfs','/tmp:rw,nosuid,size=32m','--cap-drop','ALL','--security-opt','no-new-privileges:true','-p','127.0.0.1::8080',IMAGE)
        port=mapped(name,8080)
        for _ in range(30):
            try:
                if request(port,'/healthz')[0]==200:break
            except Exception:pass
            time.sleep(1)
        else:raise RuntimeError('FE startup timeout')
        status,body,headers=request(port,'/auth/callback')
        assert status==200 and b'api-only' in body and headers.get('Cache-Control')=='no-store'
        for path in ['/actuator/health','/swagger-ui.html','/v3/api-docs','/internal','/ai','/api/auth/dev/token']:
            assert request(port,path)[0]==404,path
        status,body,_=request(port,'/api/notes')
        assert status==502 and b'api-only' not in body
        if os.environ.get('PROXY_TEST_HELPER'):
            backend=PREFIX+'-echo';created.append(backend)
            code="require('node:http').createServer((q,s)=>{let chunks=[];q.on('data',c=>chunks.push(c));q.on('end',()=>{s.writeHead(403,{'Content-Type':'application/json','Set-Cookie':'probe=ok; HttpOnly; Secure; SameSite=Strict'});s.end(JSON.stringify({url:q.url,authorization:q.headers.authorization,cookie:q.headers.cookie,origin:q.headers.origin,bodyBytes:Buffer.concat(chunks).length}));});}).listen(8080)"
            docker('run','-d','--name',backend,'--network',PREFIX,'--network-alias','be','--platform','linux/amd64','--entrypoint','node',os.environ['PROXY_TEST_HELPER'],'-e',code)
            # Synthetic local HTTP markers, never real service credentials.
            req=urllib.request.Request(f'http://127.0.0.1:{port}/api/probe?keep=yes',method='POST',data=b'x'*(12*1024*1024),headers={'Authorization':'Bearer probe','Cookie':'probe=one','Origin':'https://capsnote.art','Content-Type':'application/json'})
            for _ in range(30):
                try:
                    urllib.request.urlopen(req,timeout=10)
                except urllib.error.HTTPError as e:
                    if e.code==403:
                        result=json.loads(e.read());assert result=={'url':'/api/probe?keep=yes','authorization':'Bearer probe','cookie':'probe=one','origin':'https://capsnote.art','bodyBytes':12*1024*1024}
                        assert e.headers['Set-Cookie']=='probe=ok; HttpOnly; Secure; SameSite=Strict'
                        break
                time.sleep(1)
            else:raise RuntimeError('Proxy preservation/body size check failed')
        print(json.dumps({'amd64':True,'nonRoot':True,'apiOnlyDefault':True,'spaRouting':True,'adminPathsBlocked':True,'apiDoesNotFallbackToHtml200':True,'proxyHeaderPrefixAnd12MiBBody':bool(os.environ.get('PROXY_TEST_HELPER'))}))
finally:
    for name in reversed(created):subprocess.run(['docker','rm','-f','-v',name],capture_output=True)
    if network:subprocess.run(['docker','network','rm',PREFIX],capture_output=True)
