import { gzipSync } from 'node:zlib';

export const GZIP_MIN_BYTES = 1024;

export function acceptGzip(header) {
  return /\bgzip\b/i.test(String(header || ''));
}

export function encodeBuffer(buf, acceptEncoding, { minBytes = GZIP_MIN_BYTES } = {}) {
  const body = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  if (acceptGzip(acceptEncoding) && body.length >= minBytes) {
    return { body: gzipSync(body), gzip: true };
  }
  return { body, gzip: false };
}

export function jsonResponseHeaders(gzip) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    Vary: 'Accept-Encoding'
  };
  if (gzip) headers['Content-Encoding'] = 'gzip';
  return headers;
}
