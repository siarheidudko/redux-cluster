module.exports = {
  env: {
    node: true,
    commonjs: true,
    es2021: true
  },
  extends: [
    '../eslint.config.js'
  ],
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'script'
  },
  rules: {
    // Allow console in test files
    'no-console': 'off',
    // Allow require in CommonJS
    '@typescript-eslint/no-var-requires': 'off'
  }
};
