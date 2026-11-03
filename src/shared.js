// Same-process Cordis capability for the companion Image Editor. Tokens remain
// exclusively owned by this plugin; no token getters or credential-file paths.
const ALLOWED = new Set(['get_account', 'create_upload', 'get_upload', 'quote_layer_separation', 'separate_layers', 'get_layer_separation', 'get_layer_editor', 'export_layer_psd', 'get_layer_export', 'get_layer_result', 'cancel_layer_separation']);
export function sharedConnection(session, remote) {
  return Object.freeze({
    apiVersion: 1, resource: session.resource, source: 'dsh-image-designer',
    status: () => session.status(),
    authorize: async () => {
      if ((await session.status()).status === 'authorized') { await remote.connect(); return { status: 'authorized' }; }
      return session.begin();
    },
    tools: async () => { await remote.connect(); return remote.allDefinitions.filter(t => ALLOWED.has(t.name)); },
    call: async (name, args, { signal } = {}) => {
      if (!ALLOWED.has(name)) throw new Error('Unsupported shared Shenhuo tool.');
      if (name === 'separate_layers' && args.user_confirmed !== true) throw new Error('LAYER_QUOTE_REQUIRED: explicit user confirmation is required.');
      await remote.connect();
      if (!remote.allDefinitions.some(t => t.name === name)) throw new Error('Tool unavailable on the original Shenhuo connection.');
      try { return await remote.client.callTool({ name, arguments: args }, undefined, { signal, timeout: 60000 }); }
      catch { await remote.dispose(); throw new Error('Original Shenhuo connection interrupted. Preserve task IDs, keys and parameters.'); }
    }
  });
}
