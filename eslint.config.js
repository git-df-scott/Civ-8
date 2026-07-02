// ESLint 9 flat config for the whole monorepo.
// Determinism rules (Math.random, Date.now, ...) apply ONLY to packages/engine
// and packages/ai — see doc 04 §3.3.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/test-results/**', '**/playwright-report/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // CommonJS config files (e.g. .dependency-cruiser.cjs)
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        module: 'writable',
        require: 'readonly',
        __dirname: 'readonly',
        process: 'readonly',
      },
    },
  },
  {
    // Engine & AI must be deterministic: no wall clocks, no ambient randomness,
    // no nondeterministic iteration order.
    files: ['packages/engine/**/*.{ts,mts,cts,tsx}', 'packages/ai/**/*.{ts,mts,cts,tsx}'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Object',
          property: 'keys',
          message:
            'Raw Object.keys iteration order is insertion-dependent. Use sortedKeys() (serialize/canonical) — the only sanctioned door (doc 04 §3.3).',
        },
        {
          object: 'Math',
          property: 'random',
          message: 'Nondeterministic. Use the engine PCG32 RNG (rng/pcg32) substreams.',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'Wall-clock time is nondeterministic and banned in engine/ai.',
        },
        {
          object: 'performance',
          property: 'now',
          message: 'Wall-clock time is nondeterministic and banned in engine/ai.',
        },
        {
          object: 'crypto',
          property: 'getRandomValues',
          message: 'Nondeterministic. Use the engine PCG32 RNG (rng/pcg32) substreams.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ForInStatement',
          message:
            'for...in iteration order is not guaranteed deterministic. Use sortedKeys() or explicit arrays.',
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Wall-clock time is nondeterministic and banned in engine/ai.',
        },
      ],
    },
  },
  prettier,
);
