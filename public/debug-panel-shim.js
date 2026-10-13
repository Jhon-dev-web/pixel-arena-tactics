// window.DebugPanel is normally injected by the deploy platform the game was prototyped on; src/game/tunables.ts reads it at import time.
// This stand-in just collapses the schema to its values. Kept as a same-origin file (not inline) so the page can run under a strict CSP.
window.DebugPanel = {
  define(schema) {
    function resolve(node) {
      if (node && typeof node === 'object') {
        if ('value' in node) return node.value;
        const out = {};
        for (const k in node) out[k] = resolve(node[k]);
        return out;
      }
      return node;
    }
    return resolve(schema);
  },
};
