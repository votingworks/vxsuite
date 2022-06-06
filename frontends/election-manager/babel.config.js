/**
 * @type {import('@babel/core').TransformOptions}
 */
module.exports = {
  presets: ['react-app'],
  plugins: [
    // `@zip.js/zip.js` uses `import.meta.url`, which Jest+Babel+NodeJS does not
    // support. This replaces it with a CommonJS-compatible version.
    'babel-plugin-transform-import-meta',
  ],
};
