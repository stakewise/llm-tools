import js from '@eslint/js'
import globals from 'globals'
import tsEslint from 'typescript-eslint'
import importPlugin from 'eslint-plugin-import'
import { globalIgnores } from 'eslint/config'


export default [
  js.configs.recommended,
  ...tsEslint.configs.recommended,
  {
    files: [ 'scripts/**/*.{js,mjs,cjs}' ],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: [ '**/*.{js,ts}' ],
    plugins: {
      import: importPlugin,
    },
    rules: {
      ...importPlugin.configs.recommended.rules,
      ...importPlugin.configs.errors?.rules,
      ...importPlugin.configs.warnings?.rules,
    },
  },
  {
    files: [ '**/*.{js,ts}' ],

    rules: {
      // Common
      'no-empty': 0,
      'no-empty-pattern': 0,
      'no-loss-of-precision': 0,
      'no-trailing-spaces': 1,
      semi: [ 'error', 'never' ],
      'no-irregular-whitespace': 0,
      'no-extra-boolean-cast': 'off',
      'max-len': [ 'warn', { code: 140 } ],
      'object-curly-spacing': [ 'error', 'always' ],
      'array-bracket-spacing': [ 'error', 'always' ],
      'no-multiple-empty-lines': [ 'error', { max: 2 } ],
      'comma-dangle': [
        'warn',
        {
          arrays: 'always-multiline',
          objects: 'always-multiline',
          imports: 'always-multiline',
          exports: 'always-multiline',
          functions: 'never',
        },
      ],

      // TypeScript
      '@typescript-eslint/no-namespace': 0,
      '@typescript-eslint/ban-ts-comment': 0,
      '@typescript-eslint/no-explicit-any': 0,
      '@typescript-eslint/no-require-imports': 0,
      '@typescript-eslint/no-empty-object-type': 0,
      '@typescript-eslint/no-unnecessary-type-constraint': 0,
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // Import
      'import/named': 0,
      'import/first': 0,
      'import/extensions': 0,
      'import/no-unresolved': 0,
      'import/no-dynamic-require': 0,
      'import/prefer-default-export': 0,
      'import/no-webpack-loader-syntax': 0,
      'import/no-named-as-default-member': 1,
      'import/no-extraneous-dependencies': 0,
      'import/no-anonymous-default-export': 0,
      'import/newline-after-import': [ 'error', { count: 2 } ],
    },
  },

  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
  ]),
]
