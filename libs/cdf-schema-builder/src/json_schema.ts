import { assert, Result } from '@votingworks/basics';
import { JSONSchema4 } from 'json-schema';
import { Enum, EnumValue, Interface, Property, Type } from './types';
import { makeIdentifier } from './util';
import { safeParseJson } from './parse_json';

/**
 * Parse a JSON Schema.
 *
 * @see https://json-schema.org
 */
export function parseJsonSchema(
  jsonSchema: string
): Result<JSONSchema4, SyntaxError> {
  const jsonParseResult = safeParseJson(jsonSchema);
  return jsonParseResult as Result<JSONSchema4, SyntaxError>;
}

/**
 * Generates an enum type from a JSON schema `enum` property.
 */
export function createEnumFromDefinition(
  name: string,
  def: JSONSchema4
): Enum | undefined {
  if (!def.enum || def.type !== 'string') {
    return undefined;
  }

  const values: EnumValue[] = [];
  for (const value of def.enum) {
    assert(typeof value === 'string');
    values.push({
      name: makeIdentifier(value),
      value,
    });
  }

  return {
    name,
    values,
    documentation: def.description,
  };
}

/**
 * Converts a JSON Schema type to a TypeScript-compatible type.
 */
export function convertToGenericType(def: JSONSchema4): Type {
  switch (def.type) {
    case 'string': {
      if (def.enum) {
        return {
          kind: 'union',
          types: def.enum.map((value) => ({
            kind: 'literal',
            value: value as string,
          })),
        };
      }
      return { kind: 'string', pattern: def.pattern, format: def.format };
    }

    case 'integer':
    case 'number':
    case 'boolean': {
      return { kind: def.type };
    }

    case 'array': {
      assert(def.items);
      return {
        kind: 'array',
        items: convertToGenericType(def.items),
        minItems: def.minItems,
      };
    }

    default:
      if (def.$ref) {
        const [, name] = def.$ref.split('#/definitions/');
        assert(typeof name === 'string');
        return { kind: 'reference', name: name.split('.').pop() as string };
      }

      if (def.oneOf) {
        const types: Type[] = [];
        for (const subDef of def.oneOf) {
          types.push(convertToGenericType(subDef));
        }
        return { kind: 'union', types };
      }

      throw new Error(`Unsupported schema type: ${def.type}`);
  }
}

/**
 * Creates an interface from a JSON schema definition.
 */
export function createInterfaceFromDefinition(
  name: string,
  def: JSONSchema4
): Interface | undefined {
  assert(def.type === 'object', 'Expected an object schema');
  assert(
    def.additionalProperties === false,
    'Expected no additional properties'
  );

  const properties: Property[] = [];

  for (const [propertyName, propertyDef] of Object.entries(
    def.properties ?? []
  )) {
    properties.push({
      name: propertyName,
      type: convertToGenericType(propertyDef),
      required:
        Array.isArray(def.required) && def.required.includes(propertyName),
      documentation: propertyDef.description,
    });
  }

  return { name, properties, documentation: def.description };
}
