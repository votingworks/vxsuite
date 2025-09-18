/* eslint-disable */
const { join } = require('node:path');

// NOTE: this only works because the build output can get to the root of the
// project in the same number of `../` as the source input:
//
//   src/hmpb-ts/addon.ts -> build/addon.node via `../../build/addon.node`
//   build/hmpb-ts/addon.js -> build/addon.node via `../../build/addon.node`
//
const root = join(__dirname, '../..');
module.exports = require(join(root, 'build', 'addon.node'));
