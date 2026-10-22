import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const MAX_MEDIA_BYTES = 12 * 1024 * 1024;
const kinds = new Set(['cover', 'wallpaper']);

export class MediaError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function assertMediaKind(kind) {
  if (!kinds.has(kind)) throw new MediaError(404, '找不到此图片类型');
}

// Check the RIFF container and actual WebP image chunks before storing bytes.
// Browsers produce either a VP8/VP8L image, optionally wrapped by VP8X metadata.
export function validateWebP(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 20) throw new MediaError(415, '图片内容不是有效的 WebP');
  if (bytes.length > MAX_MEDIA_BYTES) throw new MediaError(413, '图片不能超过 12 MB');
  if (bytes.toString('latin1', 0, 4) !== 'RIFF' || bytes.toString('latin1', 8, 12) !== 'WEBP' || bytes.readUInt32LE(4) + 8 !== bytes.length) {
    throw new MediaError(415, '图片内容不是有效的 WebP');
  }
  let offset = 12;
  let imageChunks = 0;
  let extended = false;
  const supported = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ICCP', 'EXIF', 'XMP ']);
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw new MediaError(415, '图片数据不完整');
    const type = bytes.toString('latin1', offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (!supported.has(type) || end + (length & 1) > bytes.length) throw new MediaError(415, '图片数据不完整或不受支持');
    if (type === 'VP8 ') {
      // Key-frame bit, VP8 sync code and nonzero frame dimensions.
      if (length < 10 || (bytes[start] & 1) !== 0 || bytes[start + 3] !== 0x9d || bytes[start + 4] !== 0x01 || bytes[start + 5] !== 0x2a || !(bytes.readUInt16LE(start + 6) & 0x3fff) || !(bytes.readUInt16LE(start + 8) & 0x3fff)) {
        throw new MediaError(415, '图片编码无效');
      }
      imageChunks += 1;
    } else if (type === 'VP8L') {
      // The lossless signature and version field are specified by WebP.
      if (length < 5 || bytes[start] !== 0x2f || (bytes[start + 4] & 0xe0) !== 0) throw new MediaError(415, '图片编码无效');
      imageChunks += 1;
    } else if (type === 'VP8X') {
      if (extended || offset !== 12 || length !== 10 || (bytes[start] & 0xc3) !== 0 || bytes[start + 1] || bytes[start + 2] || bytes[start + 3]) {
        throw new MediaError(415, '请上传静态 WebP 图片');
      }
      extended = true;
    }
    offset = end + (length & 1);
  }
  if (offset !== bytes.length || imageChunks !== 1) throw new MediaError(415, '图片缺少有效编码内容');
}

export function createMediaStorage(dataDirectory) {
  const mediaDirectory = path.resolve(dataDirectory, 'media');
  const pending = new Map();
  const fileFor = kind => {
    assertMediaKind(kind);
    return path.join(mediaDirectory, `${kind}.webp`);
  };
  const serialize = (kind, operation) => {
    const next = (pending.get(kind) || Promise.resolve()).catch(() => {}).then(operation);
    pending.set(kind, next);
    next.finally(() => { if (pending.get(kind) === next) pending.delete(kind); }).catch(() => {});
    return next;
  };
  async function metadata(kind) {
    const file = fileFor(kind);
    try {
      const info = await stat(file, { bigint: true });
      if (!info.isFile()) return null;
      const version = `${info.mtimeNs}-${info.size}`;
      return { url: `/media/${kind}.webp?v=${version}`, version };
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }
  return {
    metadata,
    async appearance() {
      const [cover, wallpaper] = await Promise.all([metadata('cover'), metadata('wallpaper')]);
      return { cover, wallpaper };
    },
    async read(kind) {
      try { return await readFile(fileFor(kind)); }
      catch (error) {
        if (error.code === 'ENOENT') throw new MediaError(404, '尚未上传此图片');
        throw error;
      }
    },
    async put(kind, bytes) {
      const file = fileFor(kind);
      validateWebP(bytes);
      return serialize(kind, async () => {
        await mkdir(mediaDirectory, { recursive: true });
        const temporary = path.join(mediaDirectory, `.${kind}-${randomUUID()}.tmp`);
        try {
          await writeFile(temporary, bytes, { flag: 'wx' });
          await rename(temporary, file);
        } finally {
          await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
        }
        return metadata(kind);
      });
    },
    async remove(kind) {
      const file = fileFor(kind);
      return serialize(kind, async () => {
        await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
      });
    },
  };
}
