/* eslint-disable quote-props */

module.exports = {
  root: true,
  env: {
    browser: true
  },
  parser: '@typescript-eslint/parser',
  plugins: [
    'import',
    '@typescript-eslint'
  ],
  extends: [
    'eslint:recommended',
    'airbnb-base',
    'plugin:import/errors',
    'plugin:import/warnings',
    'plugin:import/typescript',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended'
  ],
  settings: {
    'import/resolver': {
      typescript: {}
    }
  },
  rules: {
    'camelcase': 'off',
    'import/no-unresolved': 'error',
    'import/extensions': 'off',
    'no-underscore-dangle': 'off',
    'import/order': 'off',
    'no-fallthrough': 'off',
    'max-classes-per-file': 'off',
    'no-use-before-define': 'off',
    'prefer-promise-reject-errors': 'off',
    '@typescript-eslint/ban-types': 'off',
    '@typescript-eslint/indent': ['error', 2],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-member-accessibility': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-empty-interface': 'off',
    '@typescript-eslint/no-this-alias': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    'import/prefer-default-export': 'off',
    'import/no-extraneous-dependencies': 'off',
    'import/no-cycle': 'off',
    'import/first': 'off',
    'comma-dangle': ['error', {
      functions: 'never'
    }],
    'prefer-destructuring': 'off',
    'semi': ['error', 'always'],
    'class-methods-use-this': 'off',
    'block-scoped-var': 'error',
    'no-debugger': 'error',
    'no-lonely-if': 'error',
    'no-plusplus': 'off',
    'lines-between-class-members': 'off',
    'max-len': 'off',
    'complexity': [ 'error', { max: 40 } ],
    'arrow-parens': [ 'error', 'always' ],
    'arrow-body-style': 'off',
    'object-shorthand': 'off',
    'guard-for-in': 'off',
    'no-nested-ternary': 'off',
    'object-curly-newline': 'off',
    'array-bracket-spacing': [ 'error', 'never' ],
    'no-param-reassign': 'off',
    'default-case': 'off',
    'no-shadow': 'off',
    'no-restricted-syntax': 'off',
    'no-prototype-builtins': 'off',
    'space-before-function-paren': 'off',
    'no-var': 'error',
    'padding-line-between-statements': [
      'error',
      { 'blankLine': 'always', 'prev': 'block-like', 'next': '*' },
      { 'blankLine': 'always', 'prev': '*', 'next': 'block-like' },
      { 'blankLine': 'any', 'prev': 'block-like', 'next': ['block-like', 'break'] },
      // require blank lines before all return statements
      { 'blankLine': 'always', 'prev': '*', 'next': 'return' },
      // require blank lines after every sequence of variable declarations
      { 'blankLine': 'always', 'prev': ['const', 'let', 'var'], 'next': '*'},
      { 'blankLine': 'any',    'prev': ['const', 'let', 'var'], 'next': ['const', 'let', 'var']},
      // require blank lines after all directive prologues
      { 'blankLine': 'always', 'prev': 'directive', 'next': '*' },
      { 'blankLine': 'any',    'prev': 'directive', 'next': 'directive' }
    ]
  }
}
