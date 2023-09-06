// @ts-check

module.exports = {
  hooks: {
    readPackage,
  },
};

/**
 * @typedef {object} Package
 * @property {string} name
 * @property {string} version
 * @property {Record<string, string>} dependencies
 */

/**
 * Fixes package configuration in a strict non-hoisted pnpm setup. The most
 * common case is a package that implicitly depends on another. In a layout
 * with hoisted packages, implicit dependencies are typically never a problem
 * because traversing up the node_modules directories will find them. The
 * layout created by pnpm with `hoist = false` means that won't be the case.
 *
 * To ensure packages can find their implicit dependencies, we add the missing
 * ones manually here on a package-by-package basis.
 *
 * @param {Package} pkg
 * @param {{ log: typeof console.log }} context
 * @returns {Package}
 */
function readPackage(pkg, context) {
  if (pkg.name === 'fetch-mock') {
    // Cannot find module 'node-fetch' from 'server.js'
    pkg.dependencies = {
      ...pkg.dependencies,
      'node-fetch': '*',
    };
    context.log('fetch-mock implicitly depends on node-fetch');
  }

  if (pkg.name === 'react-idle-timer') {
    // Cannot find module 'prop-types' from 'index.min.js'
    pkg.dependencies = {
      ...pkg.dependencies,
      'prop-types': '*',
    };
    context.log('react-idle-timer implicitly depends on prop-types');
  }

  if (pkg.name === 'react-idle-timer') {
    // JSX element class does not support attributes because it does not have a 'props' property.
    pkg.dependencies = {
      ...pkg.dependencies,
      '@types/react': '*',
    };
    context.log('react-idle-timer implicitly depends on @types/react');
  }

  if (pkg.name === '@typescript-eslint/utils') {
    // Cannot find module '@typescript-eslint/parser'
    pkg.dependencies = {
      ...pkg.dependencies,
      '@typescript-eslint/parser': '*',
    };
    context.log(
      'eslint-module-utils requires the parser named in the eslint config, @typescript-eslint/parser'
    );
  }

  return pkg;
}
