#!/usr/bin/env node
import { PrivateStore } from './store.js';
import { OAuthSession } from './oauth.js';
import { McpConnection } from './mcp.js';

const session = new OAuthSession(new PrivateStore());
const remote = new McpConnection(session, session.store);
try {
  const command = process.argv[2] ?? 'doctor';
  if (command === 'connect') {
    console.log(JSON.stringify(await session.begin(), null, 2));
    console.log(JSON.stringify(await session.wait()));
    if ((await session.status()).status === 'authorized') console.log(JSON.stringify({ status: 'connected', tools: (await remote.tools()).map(tool => tool.name) }));
  } else if (command === 'doctor') {
    const metadata = await session.metadata();
    const status = await session.status();
    console.log(JSON.stringify({ node: process.version, oauth_discovery: metadata.issuer === session.issuer, authorization: status, data_directory: session.store.directory, tools: status.status === 'authorized' ? (await remote.tools()).map(tool => tool.name) : [], paid_calls: 0 }, null, 2));
  } else throw new Error('Usage: node src/cli.js doctor|connect');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await session.dispose(); await remote.dispose(); }
