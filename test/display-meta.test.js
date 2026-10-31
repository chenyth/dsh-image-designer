import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

test('DSH reads Chinese and English display names and descriptions from the installed package resources', { skip: !process.env.DSH_HOST_MODULE_DIR }, async () => {
  const { readPluginMeta } = await import(pathToFileURL(join(process.env.DSH_HOST_MODULE_DIR, '@deepseek-ai/dsh-app-boot/lib/index.js')).href);
  const meta = readPluginMeta('dsh-image-designer', new URL('../package.json', import.meta.url).href);
  assert.equal(meta.error, undefined);
  assert.equal(meta.title.en, 'Image Designer');
  assert.equal(meta.title.zh, '神火设计师');
  assert.equal(typeof meta.description.en, 'string');
  assert.equal(typeof meta.description.zh, 'string');
  assert(meta.description.en.includes('Shenhuo'));
  assert(meta.description.zh.includes('积分报价确认'));
});
