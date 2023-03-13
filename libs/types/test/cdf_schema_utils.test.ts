import { err, ok } from '@votingworks/basics';
import {
  findUnusedDefinitions,
  isSubsetCdfSchema,
  validateSchema,
  validateSchemaDraft04,
} from './cdf_schema_utils';

test('validateSchema', () => {
  validateSchema({ definitions: { A: { type: 'string' } } });
  expect(() =>
    validateSchema({
      definitions: {
        A: {
          type: 'not-a-real-type',
        },
      },
    })
  ).toThrow();
});

test('validateSchemaDraft04', () => {
  validateSchemaDraft04({ definitions: { A: { type: 'string' } } });
  expect(() =>
    validateSchemaDraft04({
      definitions: {
        A: {
          type: 'not-a-real-type',
        },
      },
    })
  ).toThrow();
});

test('findUnusedDefinitions', () => {
  expect(
    findUnusedDefinitions({
      definitions: {
        A: { type: 'string' },
      },
    })
  ).toEqual(['A']);
  expect(
    findUnusedDefinitions({
      // eslint-disable-next-line vx/gts-identifiers
      $ref: '#/definitions/B',
      definitions: {
        A: { type: 'string' },
        // eslint-disable-next-line vx/gts-identifiers
        B: { $ref: '#/definitions/A' },
      },
    })
  ).toEqual([]);
  expect(
    findUnusedDefinitions({
      // eslint-disable-next-line vx/gts-identifiers
      $ref: '#/definitions/B',
      definitions: {
        A: { type: 'string' },
        B: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              p1: {
                // eslint-disable-next-line vx/gts-identifiers
                $ref: '#/definitions/A',
              },
            },
          },
        },
      },
    })
  ).toEqual([]);
  expect(
    findUnusedDefinitions({
      // eslint-disable-next-line vx/gts-identifiers
      $ref: '#/definitions/D',
      definitions: {
        A: { type: 'string' },
        B: { type: 'number' },
        C: { type: 'boolean' },
        // eslint-disable-next-line vx/gts-identifiers
        D: { $ref: '#/definitions/A' },
      },
    })
  ).toEqual(['B', 'C']);
});

test('isSubsetCdfSchema', () => {
  // Definition matching
  expect(
    isSubsetCdfSchema(
      { definitions: { B: { type: 'string' } } },
      { definitions: { A: { type: 'string' }, B: { type: 'string' } } }
    )
  ).toEqual(ok());
  expect(
    isSubsetCdfSchema(
      { definitions: { B: { type: 'string' } } },
      { definitions: { A: { type: 'string' } } }
    )
  ).toEqual(err('extra definition in subschema: B'));
  // Extra definitions prefixed with 'vx' are allowed
  expect(
    isSubsetCdfSchema(
      { definitions: { 'Namespace.vxDefinition': { type: 'string' } } },
      { definitions: { A: { type: 'string' } } }
    )
  ).toEqual(ok());

  // Basic type matching
  expect(
    isSubsetCdfSchema(
      { definitions: { A: { type: 'any' } } },
      { definitions: { A: { type: 'any' } } }
    )
  ).toEqual(ok());
  expect(
    isSubsetCdfSchema(
      { definitions: { A: { type: 'null' } } },
      { definitions: { A: { type: 'null' } } }
    )
  ).toEqual(ok());
  expect(
    isSubsetCdfSchema(
      { definitions: { A: { type: 'boolean' } } },
      { definitions: { A: { type: 'boolean' } } }
    )
  ).toEqual(ok());
  expect(
    isSubsetCdfSchema(
      { definitions: { A: { type: 'number' } } },
      { definitions: { A: { type: 'number' } } }
    )
  ).toEqual(ok());
  expect(
    isSubsetCdfSchema(
      { definitions: { A: { type: 'integer' } } },
      { definitions: { A: { type: 'integer' } } }
    )
  ).toEqual(ok());
  expect(
    isSubsetCdfSchema(
      { definitions: { A: { type: 'string' } } },
      { definitions: { A: { type: 'string' } } }
    )
  ).toEqual(ok());
  expect(
    isSubsetCdfSchema(
      { definitions: { A: { type: 'string' } } },
      { definitions: { A: { type: 'number' } } }
    )
  ).toEqual(err('definitions.A: type mismatch'));
  // No special casing for 'any'
  expect(
    isSubsetCdfSchema(
      { definitions: { A: { type: 'string' } } },
      { definitions: { A: { type: 'any' } } }
    )
  ).toEqual(err('definitions.A: type mismatch'));

  // Array matching
  expect(
    isSubsetCdfSchema(
      { definitions: { A: { type: 'array', items: { type: 'string' } } } },
      { definitions: { A: { type: 'array', items: { type: 'string' } } } }
    )
  ).toEqual(ok());
  expect(
    isSubsetCdfSchema(
      { definitions: { A: { type: 'array', items: { type: 'string' } } } },
      { definitions: { A: { type: 'array', items: { type: 'number' } } } }
    )
  ).toEqual(err('definitions.A.items: type mismatch'));

  // Object matching
  expect(
    isSubsetCdfSchema(
      {
        definitions: {
          A: { type: 'object', properties: { p1: { type: 'string' } } },
        },
      },
      {
        definitions: {
          A: { type: 'object', properties: { p1: { type: 'string' } } },
        },
      }
    )
  ).toEqual(ok());
  expect(
    isSubsetCdfSchema(
      {
        definitions: {
          A: { type: 'object', properties: { p1: { type: 'string' } } },
        },
      },
      {
        definitions: {
          A: { type: 'object', properties: { p1: { type: 'number' } } },
        },
      }
    )
  ).toEqual(err('definitions.A.properties.p1: type mismatch'));

  // Subschema can't add properties
  expect(
    isSubsetCdfSchema(
      {
        definitions: {
          A: {
            type: 'object',
            properties: { p1: { type: 'string' }, p2: { type: 'number' } },
          },
        },
      },
      {
        definitions: {
          A: { type: 'object', properties: { p1: { type: 'string' } } },
        },
      }
    )
  ).toEqual(err('definitions.A: extra property in subschema: p2'));
  // Unless it's a VX custom property
  expect(
    isSubsetCdfSchema(
      {
        definitions: {
          A: {
            type: 'object',
            properties: { p1: { type: 'string' }, vxField: { type: 'number' } },
          },
        },
      },
      {
        definitions: {
          A: { type: 'object', properties: { p1: { type: 'string' } } },
        },
      }
    )
  ).toEqual(ok());

  // Optional fields in superset schema can be removed in subset schema
  expect(
    isSubsetCdfSchema(
      {
        definitions: {
          A: { type: 'object', properties: { p1: { type: 'string' } } },
        },
      },
      {
        definitions: {
          A: {
            type: 'object',
            properties: { p1: { type: 'string' }, p2: { type: 'number' } },
          },
        },
      }
    )
  ).toEqual(ok());
  expect(
    isSubsetCdfSchema(
      {
        definitions: {
          A: {
            type: 'object',
            properties: { p1: { type: 'string' } },
            required: ['p1'],
          },
        },
      },
      {
        definitions: {
          A: {
            type: 'object',
            properties: { p1: { type: 'string' }, p2: { type: 'number' } },
            required: ['p1'],
          },
        },
      }
    )
  ).toEqual(ok());
  // Optional fields in superset schema can be made required in subset schema
  expect(
    isSubsetCdfSchema(
      {
        definitions: {
          A: {
            type: 'object',
            properties: { p1: { type: 'string' } },
            required: ['p1'],
          },
        },
      },
      {
        definitions: {
          A: {
            type: 'object',
            properties: { p1: { type: 'string' }, p2: { type: 'number' } },
          },
        },
      }
    )
  ).toEqual(ok());
  expect(
    isSubsetCdfSchema(
      {
        definitions: {
          A: {
            type: 'object',
            properties: { p1: { type: 'string' } },
          },
        },
      },
      {
        definitions: {
          A: {
            type: 'object',
            properties: { p1: { type: 'string' }, p2: { type: 'number' } },
            required: ['p2'],
          },
        },
      }
    )
  ).toEqual(err('definitions.A: subschema must require property: p2'));

  // Refs
  expect(
    isSubsetCdfSchema(
      // This schema is technically invalid because B is not defined, but we
      // don't check that B exists in this function because we assume the schema
      // was validated already
      // eslint-disable-next-line vx/gts-identifiers
      { definitions: { A: { $ref: '#/definitions/B' } } },
      // eslint-disable-next-line vx/gts-identifiers
      { definitions: { A: { $ref: '#/definitions/B' } } }
    )
  ).toEqual(ok());
  expect(
    isSubsetCdfSchema(
      // eslint-disable-next-line vx/gts-identifiers
      { definitions: { A: { $ref: '#/definitions/B' } } },
      // eslint-disable-next-line vx/gts-identifiers
      { definitions: { A: { $ref: '#/definitions/C' } } }
    )
  ).toEqual(err('definitions.A: $ref mismatch'));

  // oneOf
  expect(
    isSubsetCdfSchema(
      {
        definitions: {
          A: { oneOf: [{ type: 'string' }, { type: 'boolean' }] },
        },
      },
      {
        definitions: {
          A: { oneOf: [{ type: 'string' }, { type: 'boolean' }] },
        },
      }
    )
  ).toEqual(ok());
  // Subschema can narrow the union
  expect(
    isSubsetCdfSchema(
      {
        definitions: {
          A: { oneOf: [{ type: 'string' }] },
        },
      },
      {
        definitions: {
          A: { oneOf: [{ type: 'string' }, { type: 'boolean' }] },
        },
      }
    )
  ).toEqual(ok());
  // Subschema can narrow to a single type not using oneOf
  expect(
    isSubsetCdfSchema(
      {
        definitions: {
          A: { type: 'string' },
        },
      },
      {
        definitions: {
          A: { oneOf: [{ type: 'string' }, { type: 'boolean' }] },
        },
      }
    )
  ).toEqual(ok());
  expect(
    isSubsetCdfSchema(
      {
        definitions: {
          A: { type: 'number' },
        },
      },
      {
        definitions: {
          A: { oneOf: [{ type: 'string' }, { type: 'boolean' }] },
        },
      }
    )
  ).toEqual(err('definitions.A: subschema not found in superschema oneOf'));

  // Subschema can't expand the union
  expect(
    isSubsetCdfSchema(
      {
        definitions: {
          A: {
            oneOf: [
              { type: 'string' },
              { type: 'boolean' },
              { type: 'number' },
            ],
          },
        },
      },
      {
        definitions: {
          A: { oneOf: [{ type: 'string' }, { type: 'boolean' }] },
        },
      }
    )
  ).toEqual(err('definitions.A: oneOf mismatch'));

  // Mismatched type/$ref/oneOf
  expect(
    isSubsetCdfSchema(
      {
        definitions: {
          A: { type: 'string' },
        },
      },
      {
        definitions: {
          // eslint-disable-next-line vx/gts-identifiers
          A: { $ref: '#/definitions/B' },
        },
      }
    )
  ).toEqual(err('definitions.A: type mismatch'));
  expect(
    isSubsetCdfSchema(
      {
        definitions: {
          // eslint-disable-next-line vx/gts-identifiers
          A: { $ref: '#/definitions/B' },
        },
      },
      {
        definitions: {
          A: { type: 'string' },
        },
      }
    )
  ).toEqual(err('definitions.A: $ref mismatch'));
  expect(
    isSubsetCdfSchema(
      {
        definitions: {
          A: { oneOf: [{ type: 'string' }] },
        },
      },
      {
        definitions: {
          A: { type: 'string' },
        },
      }
    )
  ).toEqual(err('definitions.A: oneOf mismatch'));
});
