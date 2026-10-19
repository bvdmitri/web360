/**
 * The hexagonal dependency rule: the core is pure and knows no adapter; adapters know only the
 * core; tools reach the packages through their public entry points. See docs/ARCHITECTURE.md.
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    {
      name: 'core-has-no-runtime-dependencies',
      comment:
        'The core is pure TypeScript: no npm packages, no Node built-ins. Tests may use vitest and fast-check.',
      severity: 'error',
      from: { path: '^packages/core/src', pathNot: '\\.test\\.ts$' },
      to: {
        dependencyTypes: [
          'npm',
          'npm-dev',
          'npm-optional',
          'npm-peer',
          'npm-bundled',
          'npm-no-pkg',
          'npm-unknown',
          'core',
          'unknown',
        ],
      },
    },
    {
      name: 'no-undeclared-dependencies',
      comment: 'Every package declares what it imports in its own package.json.',
      severity: 'error',
      from: {},
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] },
    },
    {
      name: 'shared-is-a-leaf',
      comment: 'Units, maths, errors and bytes know nothing of the domain above them.',
      severity: 'error',
      from: { path: '^packages/core/src/shared/' },
      to: { path: '^packages/core/src/(?!shared/)' },
    },
    {
      name: 'byte-layout-stays-in-format',
      comment:
        'Only the format layer reads bytes; everything else in the core receives decoded values.',
      severity: 'error',
      from: { path: '^packages/core/src/(?!format/|shared/)', pathNot: '\\.test\\.ts$' },
      to: { path: '^packages/core/src/shared/binary/' },
    },
    {
      name: 'vendors-stay-apart',
      comment: 'Each vendor reader produces the common model; no vendor reader imports another.',
      severity: 'error',
      from: { path: '^packages/core/src/format/([^/]+)/', pathNot: '\\.test\\.ts$' },
      to: {
        path: '^packages/core/src/format/(insta360|gopro|dji)/',
        pathNot: '^packages/core/src/format/$1/',
      },
    },
    {
      name: 'core-does-not-know-outer-layers',
      severity: 'error',
      from: { path: '^packages/core/src' },
      to: { path: '^(packages/adapters|packages/web360|tools|examples)/' },
    },
    {
      name: 'adapters-depend-only-on-core',
      severity: 'error',
      from: { path: '^packages/adapters/([^/]+)/src', pathNot: '\\.test\\.ts$' },
      to: { path: '^packages/adapters/(?!$1/)' },
    },
    {
      name: 'no-orphans',
      severity: 'error',
      from: {
        orphan: true,
        pathNot: ['\\.d\\.ts$', '(^|/)(index|main|vitest\\.config|tsdown\\.config)\\.ts$'],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['(^|/)dist/', '(^|/)\\.stryker-tmp/'] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'types', 'default'],
    },
  },
};
