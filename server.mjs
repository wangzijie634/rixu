import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertMediaKind, createMediaStorage, MAX_MEDIA_BYTES, MediaError } from './lib/media-storage.mjs';

const projectDirectory = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon' };

function sendJson(res, statusCode, value) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
}

function requestBase(req) {
  const host = req.headers.host;
  const match = typeof host === 'string' && /^(localhost|127\.0\.0\.1|\[::1\])(?::([0-9]{1,5}))?$/i.exec(host);
  if (!match || (match[2] && (Number(match[2]) < 1 || Number(match[2]) > 65535))) throw new MediaError(403, '请通过本机地址访问工作台');
  return new URL(`http://${host}`);
}

function verifyMutation(req, base) {
  if (req.headers['sec-fetch-site'] === 'cross-site') throw new MediaError(403, '不允许跨站修改图片');
  const origin = req.headers.origin;
  if (origin !== undefined) {
    let parsed;
    try { parsed = new URL(origin); } catch { throw new MediaError(403, '请求来源无效'); }
    if (parsed.origin !== base.origin || parsed.href !== `${parsed.origin}/`) throw new MediaError(403, '不允许跨站修改图片');
  }
}

async function readUpload(req) {
  const contentType = req.headers['content-type']?.split(';')[0].trim().toLowerCase();
  if (contentType !== 'image/webp') throw new MediaError(415, '请上传 WebP 格式图片');
  const declared = req.headers['content-length'];
  if (declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > MAX_MEDIA_BYTES)) throw new MediaError(413, '图片不能超过 12 MB');
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > MAX_MEDIA_BYTES) throw new MediaError(413, '图片不能超过 12 MB');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, length);
}

export function createDaymarkServer({ rootDirectory = path.join(projectDirectory, 'dist'), dataDirectory = path.join(projectDirectory, 'data') } = {}) {
  const root = path.resolve(rootDirectory);
  const media = createMediaStorage(dataDirectory);
  return http.createServer(async (req, res) => {
    let apiRequest = false;
    try {
      const base = requestBase(req);
      if (!req.url?.startsWith('/') || req.url.startsWith('//')) throw new MediaError(400, '请求地址无效');
      const url = new URL(req.url, base);
      const pathname = decodeURIComponent(url.pathname);
      apiRequest = pathname.startsWith('/api/');
      if (pathname === '/api/appearance') {
        if (req.method !== 'GET' && req.method !== 'HEAD') throw new MediaError(405, '此请求方式不受支持');
        sendJson(res, 200, await media.appearance());
        return;
      }
      if (pathname.startsWith('/api/media/')) {
        const kind = pathname.slice('/api/media/'.length);
        assertMediaKind(kind);
        verifyMutation(req, base);
        if (req.method === 'PUT') sendJson(res, 200, await media.put(kind, await readUpload(req)));
        else if (req.method === 'DELETE') { await media.remove(kind); sendJson(res, 200, { ok: true }); }
        else throw new MediaError(405, '此请求方式不受支持');
        return;
      }
      if (apiRequest) throw new MediaError(404, '找不到此接口');
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new MediaError(405, '此请求方式不受支持');
      if (pathname.startsWith('/media/')) {
        const match = /^\/media\/(cover|wallpaper)\.webp$/.exec(pathname);
        if (!match) throw new MediaError(404, '找不到此图片');
        const content = await media.read(match[1]);
        res.writeHead(200, { 'Content-Type': 'image/webp', 'Content-Length': content.length, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
        res.end(req.method === 'HEAD' ? undefined : content);
        return;
      }
      const rel = pathname.replace(/^\/+/, '') || 'index.html';
      // Dotfiles and backslashes cannot expose project internals on Windows.
      if (rel.includes('\\') || rel.split('/').some(part => part.startsWith('.'))) throw new MediaError(403, '不允许访问此文件');
      const file = path.resolve(root, rel);
      if (file !== root && !file.startsWith(root + path.sep)) throw new MediaError(403, '不允许访问此文件');
      if (!(await stat(file)).isFile()) throw new MediaError(404, '找不到页面');
      const content = await readFile(file);
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Content-Length': content.length, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (res.headersSent || res.destroyed) { if (!res.destroyed) res.end(); return; }
      const statusCode = error.statusCode || (error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : error instanceof URIError ? 400 : 500);
      const message = error instanceof MediaError ? error.message : statusCode === 404 ? '找不到页面' : statusCode === 400 ? '请求地址无效' : '保存图片失败，请重试';
      if (apiRequest || error instanceof MediaError) sendJson(res, statusCode, { error: message });
      else res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' }).end(message);
    }
  });
}

export const createServer = createDaymarkServer;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4173);
  createDaymarkServer().listen(port, '127.0.0.1', () => console.log(`Daymark 已启动：http://127.0.0.1:${port}`));
}
