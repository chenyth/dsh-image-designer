import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { FileTransfers } from '../src/files.js';

test('files travel as original bytes, receipts are checked, and downloads do not overwrite a file or escape the workspace', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'dsh-files-'));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4ZkAAAAASUVORK5CYII=', 'base64');
  const hash = createHash('sha256').update(png).digest('hex');
  let received; let authorization;
  const server = createServer(async (req, res) => {
    authorization = req.headers.authorization;
    if (req.method === 'PUT') { const chunks = []; for await (const c of req) chunks.push(c); received = Buffer.concat(chunks); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ data: { receipt: { asset_id: 'asset_original', sha256: hash } }, error: null })); }
    else { res.setHeader('content-type', 'image/png'); res.end(png); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const remote = { async call(name) {
    const value = name === 'create_upload' ? { transfer_id: 'transfer', upload_url: origin + '/external/mcp-files/upload', max_bytes: 20000000 } : name === 'get_upload' ? (received ? { status: 'complete', receipt: { asset_id: 'asset_original', sha256: hash } } : { status: 'pending' }) : { download_url: origin + '/external/mcp-files/download', filename: 'design.png' };
    return { structuredContent: value };
  } };
  const files = new FileTransfers(remote, { origin, allowLocalTest: true });
  try {
    await writeFile(join(cwd, 'input.png'), png);
    const upload = await files.upload({ path: 'input.png', role: 'reference', idempotency_key: 'upload-key' }, cwd);
    assert.equal(upload.receipt.asset_id, 'asset_original'); assert.deepEqual(received, png); assert.equal(authorization, undefined);
    const a = await files.download({ variant_id: 'variant', idempotency_key: 'download-key' }, cwd);
    const b = await files.download({ variant_id: 'variant', idempotency_key: 'download-key-2' }, cwd);
    assert.notEqual(a.path, b.path); assert.deepEqual(await readFile(a.path), png);
    await assert.rejects(files.upload({ path: '../outside.png', role: 'reference', idempotency_key: 'other' }, cwd), /workspace/);
    await assert.rejects(files.download({ variant_id: 'variant', idempotency_key: 'other', directory: '../outside' }, cwd), /workspace/);
  } finally { await new Promise(resolve => server.close(resolve)); await rm(cwd, { recursive: true }); }
});
