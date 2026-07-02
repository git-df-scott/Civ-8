/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies are forbidden everywhere (doc 04 §2).',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-unresolvable',
      severity: 'error',
      comment: 'Every import must resolve — an unresolvable import is a missing dependency.',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'engine-no-renderer-or-dom-deps',
      severity: 'error',
      comment:
        'The engine is a pure deterministic library: it must never import pixi.js, react, or react-dom (doc 04 §2).',
      from: { path: '^packages/engine' },
      to: {
        path: [
          '(^|/)node_modules/(pixi\\.js|react|react-dom)(/|$)',
          '^(pixi\\.js|react|react-dom)(/|$)',
        ],
      },
    },
    {
      name: 'engine-no-apps',
      severity: 'error',
      comment: 'The engine may not depend on application code.',
      from: { path: '^packages/engine' },
      to: { path: '^apps/' },
    },
    {
      name: 'engine-zero-runtime-deps',
      severity: 'error',
      comment: 'The engine has zero runtime npm dependencies (doc 04 §2).',
      from: { path: '^packages/engine/src' },
      to: { dependencyTypes: ['npm', 'npm-bundled', 'npm-optional', 'npm-peer', 'npm-unknown'] },
    },
    {
      name: 'engine-src-stays-inside',
      severity: 'error',
      comment:
        'Engine source may only import other engine source files — plus the one sanctioned edge to content schemas (doc 04 §2), policed as type-only by engine-content-type-only.',
      from: { path: '^packages/engine/src' },
      to: { pathNot: ['^packages/engine/src', '^packages/content/'] },
    },
    {
      name: 'engine-content-type-only',
      severity: 'error',
      comment:
        'Doc 04 §2 sanctions exactly one outward engine edge: engine ← content schemas, TYPE-ONLY. Any runtime import of @civ8/content from the engine breaks the zero-runtime-deps contract.',
      from: { path: '^packages/engine/src' },
      to: { path: '^packages/content/', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'ai-only-depends-on-engine',
      severity: 'error',
      comment: 'The AI package may only depend on the engine (doc 04 §2: ai ← engine).',
      from: { path: '^packages/ai' },
      to: { path: ['^packages/(?!ai/|engine/)', '^apps/'] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    exclude: { path: '\\.d\\.ts$' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
