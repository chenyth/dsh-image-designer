import { readFile, writeFile, mkdir, realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join, extname, parse } from 'node:path';
import { createHash } from 'node:crypto';
import { resultValue } from './mcp.js';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const within = (root, target) => { const part = relative(root, target); return part !== '..' && !part.startsWith('../') && !part.startsWith('..\\') && !isAbsolute(part); };
function assertWithin(root, target) { if (!within(root, target)) throw new Error('File must be inside the current local workspace. Copy the selected material into that workspace first.'); }
export async function workspacePath(cwd, path, { directory = false } = {}) {
  const root = await realpath(cwd);
  const target = resolve(root, path);
  assertWithin(root, target);
  if (!directory) { const actual = await realpath(target); assertWithin(root, actual); return actual; }
  let current = root;
  for (const segment of relative(root, target).split(/[\\/]/).filter(Boolean)) {
    current = join(current, segment); await mkdir(current, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
    assertWithin(root, await realpath(current));
  }
  return realpath(target);
}
export function imageType(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString())) return 'image/gif';
  return null;
}
function valueOf(result) { const value = resultValue(result); if (result.isError || value.error) throw new Error(`${value.error?.code ?? 'FILE_TRANSFER_FAILED'}: ${value.error?.message ?? 'The service rejected the operation.'}`); return value; }

export class FileTransfers {
  constructor(remote, { origin = 'https://api.shenhuoai.com', allowLocalTest = false, fetchImpl = fetch } = {}) {
    if (!allowLocalTest && origin !== 'https://api.shenhuoai.com') throw new Error('Only official Shenhuo file transfers are supported.');
    this.remote = remote; this.origin = origin; this.fetch = fetchImpl;
  }
  async request(url, options = {}) {
    const target = new URL(url);
    if (target.origin !== this.origin || !target.pathname.startsWith('/external/mcp-files/') || target.username || target.password || target.hash) throw new Error('Invalid Shenhuo file ticket origin or path.');
    // File tickets authorize exactly this transfer. Never attach OAuth credentials.
    const response = await this.fetch(url, { ...options, redirect: 'error', signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000) });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`File transfer HTTP ${response.status}. Query the original upload or request a fresh download ticket; do not regenerate images.`); }
    return response;
  }
  async upload(args, cwd, signal) {
    const path = await workspacePath(cwd, args.path);
    const info = await stat(path);
    if (!info.isFile() || info.size < 1 || info.size > 20 * 1024 * 1024) throw new Error('Upload requires a nonempty file of at most 20 MiB.');
    const bytes = await readFile(path); const sha256 = digest(bytes);
    if (this.remote.updateJournal) {
      await this.remote.connect();
      await this.remote.updateJournal(journal => {
        journal.files ??= [];
        const previous = journal.files.find(item => item.user_id === this.remote.userId && item.key === args.idempotency_key);
        if (previous && previous.sha256 !== sha256) throw new Error('IDEMPOTENCY_CONFLICT: the original upload key belongs to different file bytes.');
        if (!previous) journal.files.push({ user_id: this.remote.userId, key: args.idempotency_key, sha256 });
      });
    }
    const mime = imageType(bytes) ?? ({ '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/markdown', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }[extname(path).toLowerCase()] ?? 'application/octet-stream');
    const ticket = valueOf(await this.remote.call('create_upload', { filename: parse(path).base, mime_type: mime, role: args.role, label: args.label ?? '', idempotency_key: args.idempotency_key }, { signal }));
    const prior = valueOf(await this.remote.call('get_upload', { transfer_id: ticket.transfer_id }, { signal }));
    if (!prior.receipt?.asset_id) {
      if (bytes.length > ticket.max_bytes) throw new Error('The file exceeds the returned upload limit.');
      const response = await this.request(ticket.upload_url, { method: 'PUT', body: bytes, headers: { 'content-type': mime }, signal });
      await response.body?.cancel();
    }
    const uploaded = valueOf(await this.remote.call('get_upload', { transfer_id: ticket.transfer_id }, { signal }));
    if (!uploaded.receipt?.asset_id || uploaded.receipt.sha256 !== sha256) throw new Error('Upload receipt or SHA-256 mismatch. Do not use this file as a design asset.');
    return { transfer_id: ticket.transfer_id, receipt: uploaded.receipt, status: uploaded.status, sha256 };
  }
  async download(args, cwd, signal) {
    const directory = await workspacePath(cwd, args.directory ?? 'shenhuo-images', { directory: true });
    const ticket = valueOf(await this.remote.call('get_result', { variant_id: args.variant_id, idempotency_key: args.idempotency_key }, { signal }));
    const filename = ticket.filename;
    if (typeof filename !== 'string' || !filename || /[\\/\x00-\x1f]/.test(filename) || ['.', '..'].includes(filename)) throw new Error('The service returned an unsafe filename.');
    const response = await this.request(ticket.download_url, { signal });
    const chunks = []; let length = 0;
    for await (const chunk of response.body) { length += chunk.length; if (length > 64 * 1024 * 1024) { await response.body.cancel().catch(() => {}); throw new Error('Downloaded image exceeds 64 MiB.'); } chunks.push(chunk); }
    const bytes = Buffer.concat(chunks); const mime = imageType(bytes);
    if (!mime) throw new Error('Download is not a supported PNG, JPEG, WebP or GIF image.');
    const parsed = parse(filename);
    let path;
    for (let suffix = 0; suffix < 1000; suffix++) {
      path = join(directory, suffix ? `${parsed.name}-${suffix}${parsed.ext}` : filename);
      try { await writeFile(path, bytes, { flag: 'wx', mode: 0o600 }); break; }
      catch (error) { if (error.code !== 'EEXIST') throw error; path = null; }
    }
    if (!path) throw new Error('Could not find an unused output filename.');
    return { variant_id: args.variant_id, filename: parse(path).base, path, sha256: digest(bytes), bytes: bytes.length, mime_type: mime, downloaded: true };
  }
}
