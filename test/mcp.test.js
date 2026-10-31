import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpConnection, resultValue } from '../src/mcp.js';
import { PrivateStore } from '../src/store.js';
import { setTimeout as delay } from 'node:timers/promises';

test('real MCP wire discovery preserves schemas, writes once with the same key, and keeps recovery records free of tickets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-mcp-'));
  const calls = [];
  const schema = { type: 'object', properties: { brief: { type: 'string' }, idempotency_key: { type: 'string' } }, required: ['brief', 'idempotency_key'] };
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
    let body = ''; for await (const c of req) body += c;
    const message = JSON.parse(body);
    if (!('id' in message)) { res.writeHead(202); res.end(); return; }
    let result;
    if (message.method === 'initialize') result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } };
    else if (message.method === 'tools/list') result = { tools: [{ name: 'create_design', description: 'create a design', inputSchema: schema }, { name: 'get_account', inputSchema: { type: 'object' } }] };
    else {
      calls.push(message.params);
      const data = message.params.name === 'get_account' ? { user: { id: 'user-a' } } : { id: 'drq_original', project_id: 'prj_original', upload_url: 'https://secret-ticket.example/never-store' };
      result = { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
    }
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const resource = `http://127.0.0.1:${server.address().port}/mcp`;
  const remote = new McpConnection({ resource, authenticatedFetch: fetch }, new PrivateStore(dir));
  try {
    assert.deepEqual((await remote.tools()).find(t => t.name === 'create_design').inputSchema, schema);
    const args = { brief: 'My exact original brief', idempotency_key: 'original-key' };
    const response = await remote.call('create_design', args);
    assert.equal(resultValue(response).id, 'drq_original');
    await remote.call('create_design', args);
    await assert.rejects(remote.call('create_design', { ...args, brief: 'changed' }), /IDEMPOTENCY_CONFLICT/);
    assert.equal(calls.filter(c => c.name === 'create_design').length, 2);
    assert(calls.filter(c => c.name === 'create_design').every(c => c.arguments.idempotency_key === 'original-key'));
    const journal = await readFile(join(dir, 'tasks.json'), 'utf8');
    assert(journal.includes('drq_original')); assert(!journal.includes('secret-ticket'));
    assert.equal((await remote.resume()).operations[0].kind, 'design');
  } finally { await remote.dispose(); await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true }); }
});

test('generation requires its current affordable quote and explicit confirmation; an old accepted request can replay with its original key', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-quotes-'));
  let generations = 0;
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
    let body = ''; for await (const chunk of req) body += chunk;
    const message = JSON.parse(body);
    if (!('id' in message)) { res.writeHead(202); res.end(); return; }
    let result;
    if (message.method === 'initialize') result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'quote-fixture', version: '1' } };
    else if (message.method === 'tools/list') result = { tools: ['get_account', 'quote_images', 'generate_images'].map(name => ({ name, inputSchema: { type: 'object' } })) };
    else {
      const { name, arguments: args } = message.params;
      let value;
      if (name === 'get_account') value = { user: { id: 'quote-user' } };
      else if (name === 'quote_images') value = { quote_id: 'quote-' + args.design_request_id, design_request_id: args.design_request_id, can_run: args.design_request_id !== 'insufficient', expires_at: new Date(Date.now() + (args.design_request_id === 'expired' ? -1000 : 200)).toISOString() };
      else { generations++; value = { id: 'gen_original', status: 'processing' }; }
      result = { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value };
    }
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const remote = new McpConnection({ resource: `http://127.0.0.1:${server.address().port}/mcp`, authenticatedFetch: fetch }, new PrivateStore(dir));
  try {
    const args = { design_request_id: 'ready', quote_id: 'quote-ready', user_confirmed: true, idempotency_key: 'generation-original' };
    await assert.rejects(remote.call('generate_images', args), /QUOTE_STALE/);
    await remote.call('quote_images', { design_request_id: 'ready', idempotency_key: 'quote-ready-key' });
    await assert.rejects(remote.call('generate_images', { ...args, user_confirmed: false }), /QUOTE_REQUIRED/);
    assert.equal(resultValue(await remote.call('generate_images', args)).id, 'gen_original');
    await delay(250);
    assert.equal(resultValue(await remote.call('generate_images', args)).id, 'gen_original');
    await assert.rejects(remote.call('generate_images', { ...args, idempotency_key: 'new-generation' }), /QUOTE_STALE/);
    for (const id of ['expired', 'insufficient']) {
      await remote.call('quote_images', { design_request_id: id, idempotency_key: 'quote-key-' + id });
      await assert.rejects(remote.call('generate_images', { design_request_id: id, quote_id: 'quote-' + id, user_confirmed: true, idempotency_key: 'gen-' + id }), /QUOTE_STALE/);
    }
    assert.equal(generations, 2);
  } finally { await remote.dispose(); await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true }); }
});
