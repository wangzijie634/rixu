import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createDaymarkServer } from '../server.mjs';
import { MAX_MEDIA_BYTES, validateWebP } from '../lib/media-storage.mjs';

const opaqueWebP = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64');
const losslessWebP = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64');

function request(base, pathname, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(new URL(pathname, base), { method, headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const bytes = Buffer.concat(chunks);
        let json;
        try { json = JSON.parse(bytes.toString('utf8')); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, bytes, json });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('media API persists fixed files, rejects unsafe uploads, and restores defaults', async t => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'daymark-media-test-'));
  const rootDirectory = path.join(temporaryRoot, 'public');
  const dataDirectory = path.join(temporaryRoot, 'data');
  await mkdir(rootDirectory);
  await writeFile(path.join(rootDirectory, 'index.html'), '<!doctype html><title>test</title>');
  let server;
  let base;
  const start = async () => {
    server = createDaymarkServer({ rootDirectory, dataDirectory });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${server.address().port}`;
  };
  const close = async () => {
    if (!server?.listening) return;
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  };
  t.after(async () => {
    await close();
    // Only clean the exact isolated test directory created above.
    assert.equal(path.dirname(path.resolve(temporaryRoot)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temporaryRoot).startsWith('daymark-media-test-'));
    await rm(temporaryRoot, { recursive: true, force: true });
  });
  await start();
  const upload = (kind, bytes, extraHeaders = {}) => request(base, `/api/media/${kind}`, {
    method: 'PUT', headers: { 'Content-Type': 'image/webp', Origin: base, ...extraHeaders }, body: bytes,
  });

  await t.test('starts with default appearance and keeps static pages available', async () => {
    assert.deepEqual((await request(base, '/api/appearance')).json, { cover: null, wallpaper: null });
    assert.equal((await request(base, '/media/cover.webp')).status, 404);
    assert.equal((await request(base, '/')).status, 200);
    assert.equal((await request(base, '/api/missing')).status, 404);
  });

  await t.test('stores upload bytes and returns a versioned image URL', async () => {
    const response = await upload('cover', opaqueWebP);
    assert.equal(response.status, 200);
    assert.match(response.json.url, /^\/media\/cover\.webp\?v=/);
    assert.equal(typeof response.json.version, 'string');
    assert.deepEqual(await readFile(path.join(dataDirectory, 'media', 'cover.webp')), opaqueWebP);
    const served = await request(base, response.json.url);
    assert.equal(served.headers['content-type'], 'image/webp');
    assert.equal(served.headers['cache-control'], 'no-cache');
    assert.equal(served.headers['x-content-type-options'], 'nosniff');
    assert.deepEqual(served.bytes, opaqueWebP);
    const head = await request(base, response.json.url, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.bytes.length, 0);
    assert.equal(Number(head.headers['content-length']), opaqueWebP.length);
  });

  await t.test('replaces the previous file without accumulating uploads', async () => {
    const before = (await request(base, '/api/appearance')).json.cover;
    const response = await upload('cover', losslessWebP);
    assert.equal(response.status, 200);
    assert.notEqual(response.json.version, before.version);
    assert.deepEqual(await readFile(path.join(dataDirectory, 'media', 'cover.webp')), losslessWebP);
    assert.deepEqual(await readdir(path.join(dataDirectory, 'media')), ['cover.webp']);
    assert.equal((await upload('wallpaper', opaqueWebP)).status, 200);
    assert.deepEqual(await readFile(path.join(dataDirectory, 'media', 'wallpaper.webp')), opaqueWebP);
  });

  await t.test('rejects forged types and malformed image chunks while preserving the previous image', async () => {
    const brokenFrame = Buffer.from(opaqueWebP);
    brokenFrame[23] = 0;
    const brokenContainer = Buffer.from(opaqueWebP);
    brokenContainer.writeUInt32LE(0xfffffff0, 16);
    for (const bytes of [Buffer.alloc(0), Buffer.from('<html>not an image</html>'), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), brokenFrame, brokenContainer, opaqueWebP.subarray(0, -1)]) {
      const response = await upload('cover', bytes);
      assert.equal(response.status, 415);
      assert.equal(typeof response.json.error, 'string');
    }
    assert.equal((await upload('cover', opaqueWebP, { 'Content-Type': 'image/svg+xml' })).status, 415);
    assert.equal((await upload('unknown', opaqueWebP)).status, 404);
    assert.deepEqual(await readFile(path.join(dataDirectory, 'media', 'cover.webp')), losslessWebP);
    assert.deepEqual((await readdir(path.join(dataDirectory, 'media'))).sort(), ['cover.webp', 'wallpaper.webp']);
  });

  await t.test('enforces the size limit before replacing the previous image', async () => {
    assert.equal((await upload('cover', Buffer.alloc(MAX_MEDIA_BYTES + 1))).status, 413);
    assert.deepEqual(await readFile(path.join(dataDirectory, 'media', 'cover.webp')), losslessWebP);
  });

  await t.test('blocks cross-site mutations and invalid hosts', async () => {
    assert.equal((await upload('cover', opaqueWebP, { Origin: 'https://other.example' })).status, 403);
    assert.equal((await upload('cover', opaqueWebP, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await upload('cover', opaqueWebP, { Origin: 'null' })).status, 403);
    assert.equal((await upload('cover', opaqueWebP, { Host: 'other.example' })).status, 403);
    assert.equal((await request(base, '/api/media/cover', { method: 'DELETE', headers: { Origin: 'https://other.example' } })).status, 403);
    assert.equal((await request(base, '/api/appearance', { headers: { Host: '127.0.0.1:99999' } })).status, 403);
    assert.equal((await request(base, '/%2e%2e%5cserver.mjs')).status, 403);
    assert.equal((await request(base, '/.hidden')).status, 403);
    assert.deepEqual(await readFile(path.join(dataDirectory, 'media', 'cover.webp')), losslessWebP);
  });

  await t.test('retains uploaded files across server restarts', async () => {
    const before = (await request(base, '/api/appearance')).json;
    await close();
    await start();
    assert.deepEqual((await request(base, '/api/appearance')).json, before);
    assert.deepEqual((await request(base, before.cover.url)).bytes, losslessWebP);
  });

  await t.test('restores one default independently and allows repeated restore', async () => {
    const response = await request(base, '/api/media/cover', { method: 'DELETE', headers: { Origin: base } });
    assert.equal(response.status, 200);
    assert.deepEqual(response.json, { ok: true });
    const appearance = (await request(base, '/api/appearance')).json;
    assert.equal(appearance.cover, null);
    assert.ok(appearance.wallpaper);
    assert.equal((await request(base, '/media/cover.webp')).status, 404);
    assert.equal((await request(base, '/api/media/cover', { method: 'DELETE' })).status, 200);
    assert.deepEqual(await readdir(path.join(dataDirectory, 'media')), ['wallpaper.webp']);
  });
});

test('WebP validation accepts actual lossy/lossless fixtures and rejects missing frames', () => {
  validateWebP(opaqueWebP);
  validateWebP(losslessWebP);
  const missingFrame = Buffer.from('524946461600000057454250565038580a00000000000000000000000000', 'hex');
  assert.throws(() => validateWebP(missingFrame), /编码内容/);
});
