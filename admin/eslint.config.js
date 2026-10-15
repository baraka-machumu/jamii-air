import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'src/api/schema.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  // The plugin's top-level `recommended-latest` is still the eslintrc shape; the flat one is here.
  reactHooks.configs.flat['recommended-latest'],
  reactRefresh.configs.vite,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        project: ['./tsconfig.app.json', './tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Config and scripts are outside the app's tsconfig, so they are linted without type info.
    // The spread comes first: it carries its own languageOptions, which would otherwise replace
    // the Node globals set here.
    files: ['scripts/**/*.mjs', 'vite.config.ts', 'eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: { ...tseslint.configs.disableTypeChecked.languageOptions, globals: globals.node },
  },
  {
    // shadcn/ui components are added by its CLI and export their `cva` variants beside the
    // component, which the fast-refresh rule forbids. They are vendored files: left as the CLI
    // writes them, so the next `shadcn add` does not fight the linter.
    files: ['src/components/ui/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
);
