import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sharedConnection } from '../src/shared.js';

test('companion uses owner-managed MCP without adding layer tools to the designer or exposing credentials', async () => {
  let connected = 0, authorizations = 0, calls = 0;
  const remote = { allDefinitions: ['get_account', 'separate_layers', 'get_layer_editor', 'generate_images'].map(name => ({ name })), connect: async () => { connected++; }, client: { callTool: async call => { calls++; return { structuredContent: { tool: call.name } }; } } };
  const session = { resource: 'https://api.shenhuoai.com/external/mcp', status: async () => ({ status: 'authorized' }), begin: async () => { authorizations++; } };
  const shared = sharedConnection(session, remote);
  assert.equal((await shared.authorize()).status, 'authorized');
  assert.equal(authorizations, 0);
  assert.deepEqual((await shared.tools()).map(t => t.name), ['get_account', 'separate_layers', 'get_layer_editor']);
  await assert.rejects(shared.call('generate_images', {}), /Unsupported/);
  await assert.rejects(shared.call('separate_layers', { user_confirmed: false }), /QUOTE_REQUIRED/);
  await shared.call('get_layer_editor', { separation_id: 'sep-1' });
  assert.equal(calls, 1); assert(connected > 0);
  assert(!Object.keys(shared).some(k => /token|session|store/i.test(k)));
});
