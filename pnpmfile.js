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
  if (pkg.name === 'any-observable') {
    // Error: Cannot find any-observable implementation nor global.Observable. You must install polyfill or call require("any-observable/register") with your preferred implementation, e.g. require("any-observable/register")('rxjs') on application load prior to any require("any-observable").
    pkg.dependencies = {
      ...pkg.dependencies,
      rxjs: '*',
    };
    context.log('any-observable implicitly depends on rxjs');
  }

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

  if (pkg.name === 'styled-components') {
    // Cannot find module 'react-is' from '../../node_modules/.pnpm/styled-components@5.2.1_react-dom@17.0.1+react@17.0.1/node_modules/styled-components/dist/styled-components.cjs.js'
    pkg.dependencies = {
      ...pkg.dependencies,
      'react-is': '*',
    };
    context.log('styled-components implicitly depends on react-is');
  }

  if (pkg.name === '@votingworks/qrcode.react') {
    // JSX element class does not support attributes because it does not have a 'props' property.
    pkg.dependencies = {
      ...pkg.dependencies,
      '@types/react': '*',
    };
    context.log('@votingworks/qrcode.react implicitly depends on @types/react');
  }

  if (pkg.name === 'react-idle-timer') {
    // JSX element class does not support attributes because it does not have a 'props' property.
    pkg.dependencies = {
      ...pkg.dependencies,
      '@types/react': '*',
    };
    context.log('react-idle-timer implicitly depends on @types/react');
  }

  if (pkg.name === 'eslint-module-utils') {
    // Cannot find module '@typescript-eslint/parser'
    pkg.dependencies = {
      ...pkg.dependencies,
      '@typescript-eslint/parser': '*',
    };
    context.log(
      'eslint-module-utils requires the parser named in the eslint config, @typescript-eslint/parser'
    );
  }

  if (pkg.name === 'jest-circus') {
    // Cannot find module 'prettier'
    pkg.dependencies = {
      ...pkg.dependencies,
      prettier: '*',
    };
    context.log(
      'jest-circus requires prettier to format code for inline snapshots'
    );
  }

  if (pkg.name === '@testing-library/user-event') {
    // Cannot find module '@testing-library/dom'
    pkg.dependencies = {
      ...pkg.dependencies,
      '@testing-library/dom': '*',
    };
    context.log('@testing-library/user-event requires @testing-library/dom');
  }

  if (pkg.name === '@types/react-dom') {
    pkg.dependencies = {
      ...pkg.dependencies,
      '@types/react': '17.0.39',
    };
    context.log('@types/react version is pinned to 17.0.39');
  }

  if (/^\^?4\.2\./.test(pkg.dependencies['graceful-fs'])) {
    // Object prototype may only be an Object or null: undefined
    // Caused by https://github.com/isaacs/node-graceful-fs/commit/c55c1b8cb32510f92bd33d7c833364ecd3964dea
    //
    // Also avoids the issue fixed by https://github.com/isaacs/node-graceful-fs/pull/220
    // where jest thinks it cannot find `ts-jest`.
    pkg.dependencies['graceful-fs'] = '4.2.10';
    context.log(
      `${pkg.name}@${pkg.version} may use Object.setPrototypeOf with fs.read, which is undefined in the browser, which crashes`
    );
  }

  return pkg;
}
