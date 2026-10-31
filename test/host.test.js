import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { apply } from '../src/index.js';

test('DSH registers an invocable bundled skill and six bootstrap tools without requiring authorization', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-plugin-'));
  const tools = new Map(); const skills = new Map(); const effects = [];
  const ctx = {
    tools: { register(tool) { assert(tool.output.schema); assert.equal(tool.parameters.type, 'object'); if (tools.has(tool.name)) throw new Error('duplicate'); tools.set(tool.name, tool); return () => tools.delete(tool.name); } },
    skills: { register(skill) { skills.set(skill.name, skill); return () => skills.delete(skill.name); } },
    effect(factory) { effects.push(factory()); },
  };
  try {
    await apply(ctx, { dataDir: directory });
    assert.equal(tools.size, 6);
    const status = await tools.get('shenhuo_status').execute({}, {});
    assert.equal(status.status, 'not_connected');
    const skill = skills.get('shenhuo-designers');
    assert(skill.invocation.modelInvocable && skill.invocation.userInvocable);
    assert(skill.content.includes('match_designer'));
    assert(skill.content.includes('shenhuo_wait'));
    assert(!skill.content.includes('@@'));
    await assert.rejects(tools.get('shenhuo_upload_file').execute({ path: 'x' }, {}), /workspace/);
  } finally { for (const cleanup of effects) await cleanup(); await rm(directory, { recursive: true }); }
  assert.equal(tools.size, 0); assert.equal(skills.size, 0);
});

test('published DSH 0.2.1-rc.5 validates actual plugin tool and skill registrations', { skip: !process.env.DSH_HOST_MODULE_DIR }, async () => {
  const base = process.env.DSH_HOST_MODULE_DIR;
  const load = name => import(pathToFileURL(join(base, '@deepseek-ai', name, 'lib/index.js')).href);
  const { Context } = await load('cordis');
  const toolsModule = await load('dsh-tools'); const skillsModule = await load('dsh-skill');
  const ctx = new Context();
  const directory = await mkdtemp(join(tmpdir(), 'dsh-real-host-'));
  try {
    await ctx.plugin((await load('dsh-system-prompt')).default).await();
    await ctx.plugin(toolsModule.default).await(); await ctx.plugin(skillsModule.default).await();
    const scope = ctx.plugin({ name: 'test-shenhuo', apply: c => apply(c, { dataDir: directory }), inject: ['tools', 'skills'] });
    await scope.await();
    const tools = ctx.tools.schemas();
    assert(tools.some(t => t.name === 'shenhuo_connect'));
    const catalog = await ctx.skills.list({});
    assert(catalog.some(s => s.name === 'shenhuo-designers'));
  } finally { await ctx.fiber.dispose(); await rm(directory, { recursive: true }); }
});
