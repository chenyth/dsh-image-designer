import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { PrivateStore } from './store.js';
import { OAuthSession } from './oauth.js';
import { McpConnection } from './mcp.js';
import { FileTransfers } from './files.js';
import { sharedConnection } from './shared.js';

export const name = 'dsh-image-designer';
export const inject = ['tools', 'skills'];
const SKILL_URL = new URL('../skills/shenhuo-designers/SKILL.md', import.meta.url);
const description = '委托神火 AI 设计师制作电商图、海报、社交配图、品牌与人像图片；使用个人账号 OAuth 和积分，支持素材、匹配、追问、报价确认和作品交付。';
const objectSchema = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const text = description => ({ type: 'string', description });

export function resolveCwd(exec) {
  for (const value of [exec?.agent?.cwd, exec?.agent?.meta?.cwd, exec?.agent?.session?.cwd, exec?.agent?.session?.header?.cwd]) if (typeof value === 'string' && value) return value;
  throw new Error('No local workspace is available for this DSH call. Select a workspace before transferring files.');
}
export function definition(name, description, parameters, execute) {
  return { name, description, parameters, timeoutMs: 90_000,
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute: async (args, exec) => execute(args ?? {}, exec) };
}

export async function apply(ctx, config = {}) {
  if (config.dataDir !== undefined && (typeof config.dataDir !== 'string' || !config.dataDir)) throw new Error('dataDir must be a directory path.');
  const store = new PrivateStore(config.dataDir);
  const session = new OAuthSession(store);
  const remote = new McpConnection(session, store);
  ctx.provide('shenhuoMcpConnection', sharedConnection(session, remote));
  const files = new FileTransfers(remote);
  const disposeTools = []; let remoteDisposers = []; let disposed = false;
  const register = tool => { const off = ctx.tools.register(tool); disposeTools.push(off); };
  const clearRemote = () => { for (const off of remoteDisposers.splice(0)) off(); };
  remote.onTools = tools => {
    if (disposed) return;
    clearRemote();
    try {
      for (const tool of tools) {
        const bridge = definition('shenhuo_' + tool.name, tool.description ?? tool.name, tool.inputSchema, (args, exec) => remote.call(tool.name, args, { signal: exec?.signal }));
        remoteDisposers.push(ctx.tools.register(bridge));
      }
    } catch (error) { clearRemote(); throw error; }
  };
  session.onAuthorized = () => remote.connect();
  register(definition('shenhuo_connect', '开始或恢复神火个人账号 OAuth。向用户展示返回的浏览器授权链接；授权完成后调用 shenhuo_status 验证。已有有效授权时不重复授权。', objectSchema(), async () => {
    const current = await session.status();
    if (current.status === 'authorized') {
      try { await remote.connect(); return { status: 'authorized', message: 'Existing Shenhuo authorization is ready.', tools: (await remote.tools()).map(tool => 'shenhuo_' + tool.name) }; }
      catch (error) { if ((await session.status()).status === 'authorized') throw error; }
    }
    return session.begin();
  }));
  register(definition('shenhuo_status', '核验本插件的神火 OAuth 与 MCP 连接；不显示凭证。成功后业务工具以 shenhuo_ 前缀加载。', objectSchema(), async () => {
    const state = await session.status();
    if (state.status === 'authorized') { await remote.connect(); return { ...state, account: (await remote.call('get_account', {})).structuredContent ?? null, tools: (await remote.tools()).map(tool => 'shenhuo_' + tool.name) }; }
    return state;
  }));
  register(definition('shenhuo_upload_file', '上传用户为本次设计提供的本地工作区文件原始字节，核对 SHA-256 并返回 asset_id。path 必须位于当前本地工作区；本人照片 role=subject_photo，普通参考图 role=reference。相同重试沿用原键。', objectSchema({ path: text('用户提供的工作区文件路径'), role: text('素材角色'), label: text('素材说明'), idempotency_key: text('本次上传的稳定唯一幂等键') }, ['path', 'role', 'idempotency_key']), (args, exec) => files.upload(args, resolveCwd(exec), exec?.signal)));
  register(definition('shenhuo_download_result', '下载已结算成功作品到当前本地工作区，返回真实绝对路径及哈希。只重试下载，不重新生图；使用新的领取幂等键刷新过期票据。已有文件自动加序号保留。', objectSchema({ variant_id: text('已结算作品 ID'), directory: text('工作区内输出目录，默认 shenhuo-images'), idempotency_key: text('本次结果领取的稳定唯一幂等键') }, ['variant_id', 'idempotency_key']), (args, exec) => files.download(args, resolveCwd(exec), exec?.signal)));
  register(definition('shenhuo_wait', '实际等待后继续查询原任务。生图先等15秒，前一分钟每10秒、第二分钟每15秒、之后每20秒，服务端要求更长时分段等待。本工具不提交生图、不取消任务、不新增费用。', objectSchema({ seconds: { type: 'integer', minimum: 1, maximum: 60 } }, ['seconds']), async (args, exec) => {
    if (!Number.isInteger(args.seconds) || args.seconds < 1 || args.seconds > 60) throw new Error('Wait must be 1–60 seconds.');
    await delay(args.seconds * 1000, undefined, { signal: exec?.signal });
    return { waited_seconds: args.seconds, next: 'Query the same original task ID. Continue until terminal status.' };
  }));
  register(definition('shenhuo_resume', '读取当前授权账号的本地操作记录，用原资源类型、ID、参数和幂等键恢复。记录不是实时任务状态或本次新增扣费；随后必须查询服务端。', objectSchema(), () => remote.resume()));
  const skill = (await readFile(SKILL_URL, 'utf8')).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  const offSkill = ctx.skills.register({ name: 'shenhuo-designers', description, source: 'bundled', invocation: { modelInvocable: true, userInvocable: true }, resourceBase: { kind: 'directory', path: fileURLToPath(new URL('../skills/shenhuo-designers/', import.meta.url)) }, content: skill });
  ctx.effect(() => async () => { disposed = true; clearRemote(); for (const off of disposeTools.splice(0)) off(); offSkill(); await session.dispose(); await remote.dispose(); }, 'shenhuo.lifecycle');
  // Unconnected installs load immediately. Persisted sessions discover tools before the first model turn.
  if ((await session.status()).status === 'authorized') {
    try { await remote.connect(); } catch { /* shenhuo_status exposes the recoverable connection failure on demand. */ }
  }
}
