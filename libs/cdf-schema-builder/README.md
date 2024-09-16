# CDF Schema Builder

Builds TypeScript enums, interfaces, and
[Zod](https://github.com/colinhacks/zod) schemas for working with
[CDF voting specifications](https://www.nist.gov/itl/voting/interoperability).

## Setup

```sh
pnpm install
pnpm build
```

## Usage

Add to your package.json (and `pnpm install` after):

```json
    "@votingworks/cdf-schema-builder": "workspace:*",
```

With the CLI:

```sh
# in a package.json script:
cdf-schema-builder schema.xsd schema.json > schema.ts

# in your terminal:
pnpx cdf-schema-builder schema.xsd schema.json > schema.ts
```

With the API:

```ts
import { buildSchema } from '@votingworks/cdf-schema-builder';
import { readFileSync, createWriteStream } from 'node:fs';

buildSchema(
  readFileSync('schema.xsd', 'utf-8'),
  readFileSync('schema.json', 'utf-8'),
  createWriteStream('schema.ts')
);
```
