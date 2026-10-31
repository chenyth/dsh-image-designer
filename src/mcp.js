import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createHash } from 'node:crypto';

export const BUSINESS_TOOLS = new Set(['get_account', 'list_designers', 'get_designer', 'create_upload', 'get_upload', 'match_designer', 'create_design', 'get_task', 'answer_questions', 'quote_images', 'generate_images', 'get_result']);
const WRITE_TOOLS = new Set(['create_upload', 'match_designer', 'create_design', 'answer_questions', 'quote_images', 'generate_images', 'get_result']);
const KIND = { match_designer: 'routing', create_design: 'design', answer_questions: 'design', generate_images: 'generation' };
const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, ordered(value[k])])) : value;
const fingerprint = value => createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex');

export function resultValue(result) {
  if (result.structuredContent) return result.structuredContent;
  for (const item of result.content ?? []) if (item.type === 'text') { try { return JSON.parse(item.text); } catch {} }
  throw new Error('The MCP response did not contain structured JSON.');
}

export class McpConnection {
  constructor(session, store) { this.session = session; this.store = store; }
  async connect() {
    if (this.client) return;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      const client = new Client({ name: 'dsh-image-designer', version: '0.1.0' });
      const transport = new StreamableHTTPClientTransport(new URL(this.session.resource), { fetch: (url, options) => this.session.authenticatedFetch(url, options) });
      try {
        await client.connect(transport, { timeout: 30_000 });
        const tools = []; let cursor;
        do { const page = await client.listTools(cursor ? { cursor } : {}); tools.push(...page.tools); cursor = page.nextCursor; if (tools.length > 100) throw new Error('Unexpected MCP tool catalogue.'); } while (cursor);
        this.definitions = tools.filter(tool => BUSINESS_TOOLS.has(tool.name));
        const account = resultValue(await client.callTool({ name: 'get_account', arguments: {} }));
        if (!account.user?.id) throw new Error('Shenhuo did not return an authorized personal account.');
        this.userId = account.user.id;
        this.client = client; this.transport = transport;
        this.onTools?.(this.definitions);
      } catch (error) { await client.close().catch(() => {}); throw error; }
    })();
    try { await this.connecting; } finally { this.connecting = null; }
  }
  async tools() { await this.connect(); return this.definitions; }
  async updateJournal(action) {
    return this.store.locked('tasks.json', async () => {
      const journal = await this.store.read('tasks.json') ?? { operations: [] };
      const value = await action(journal);
      await this.store.write('tasks.json', journal);
      return value;
    });
  }
  async call(name, args = {}, { signal } = {}) {
    if (!BUSINESS_TOOLS.has(name)) throw new Error('Unsupported Shenhuo tool.');
    await this.connect();
    if (!this.definitions.some(tool => tool.name === name)) throw new Error('This tool is not offered by the current Shenhuo service.');
    const write = WRITE_TOOLS.has(name);
    if (write && (typeof args.idempotency_key !== 'string' || !/^[\x21-\x7e]{1,160}$/.test(args.idempotency_key))) throw new Error('A stable ASCII idempotency_key is required before submitting this operation.');
    const hash = fingerprint({ name, args });
    if (name === 'generate_images') {
      if (args.user_confirmed !== true) throw new Error('GENERATION_QUOTE_REQUIRED: obtain explicit user confirmation for the current quote.');
      const journal = await this.store.read('tasks.json');
      const replay = journal?.operations.some(op => op.user_id === this.userId && op.key === args.idempotency_key && op.fingerprint === hash);
      const quote = journal?.operations.find(op => op.user_id === this.userId && op.quote_id === args.quote_id && op.args.design_request_id === args.design_request_id);
      const expiry = Date.parse(quote?.expires_at);
      if (!replay && (!quote || !quote.can_run || !Number.isFinite(expiry) || expiry <= Date.now())) throw new Error('GENERATION_QUOTE_STALE: obtain a valid quote for this design and ask the user to confirm it.');
    }
    if (write) await this.updateJournal(journal => {
      const existing = journal.operations.find(op => op.user_id === this.userId && op.key === args.idempotency_key);
      if (existing && existing.fingerprint !== hash) throw new Error('IDEMPOTENCY_CONFLICT: this key belongs to different parameters. Query or replay the original operation.');
      if (!existing) journal.operations.push({ user_id: this.userId, tool: name, key: args.idempotency_key, fingerprint: hash, args, kind: KIND[name] ?? null, status: 'submitted_or_unknown', created_at: new Date().toISOString() });
    });
    let result;
    try { result = await this.client.callTool({ name, arguments: args }, undefined, { signal, timeout: 60_000 }); }
    catch {
      // No mutation replay: the request may have been accepted before the connection failed.
      await this.dispose();
      throw new Error('MCP request interrupted. The original key and parameters are saved. Query the original task or replay the same operation with the same key; do not create a replacement project.');
    }
    let value; try { value = resultValue(result); } catch { /* Preserve the canonical upstream result. */ }
    if (write && value) await this.updateJournal(journal => {
      const operation = journal.operations.find(op => op.user_id === this.userId && op.key === args.idempotency_key);
      // Store only recovery fields; transfer tickets, access tokens and image bytes never enter this file.
      for (const key of ['id', 'design_request_id', 'project_id', 'routing_evaluation_id', 'status', 'quote_id', 'expires_at', 'can_run', 'project_url']) if (value[key] !== undefined) operation[key] = value[key];
      operation.status = value.error ? 'service_error' : (value.status ?? 'accepted');
      if (value.error?.code) operation.error_code = value.error.code;
    });
    return result;
  }
  async resume() {
    await this.connect();
    const journal = await this.store.read('tasks.json');
    return { account_id: this.userId, operations: (journal?.operations ?? []).filter(op => op.user_id === this.userId), message: 'These are saved operation records, not live task status or new charges. Query each original task ID with its recorded kind. Replay an unknown write only with its original parameters and key.' };
  }
  async dispose() { const client = this.client; this.client = null; this.transport = null; if (client) await client.close().catch(() => {}); }
}
