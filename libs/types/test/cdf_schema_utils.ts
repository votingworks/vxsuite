import {
  Result,
  err,
  ok,
  throwIllegalValue,
  assert,
} from '@votingworks/basics';
import Ajv, { AnySchema } from 'ajv';
import AjvDraft04, { AnySchema as AnySchemaDraft04 } from 'ajv-draft-04';

// Limited types for the kinds of JSON schemas that we see in CDF

// CDF schemas are just a collection of definitions - there's no top-level schema
export interface CdfRootJsonSchema {
  // eslint-disable-next-line vx/gts-identifiers
  $ref?: string;
  definitions: Record<string, CdfDefinitionJsonSchema>;
}

// Type for the kinds of schemas we see in these definitions
export type CdfDefinitionJsonSchema =
  | { type: 'null' | 'boolean' | 'number' | 'integer' | 'string' | 'any' }
  | { type: 'array'; items: CdfDefinitionJsonSchema }
  | {
      type: 'object';
      properties: Record<string, CdfDefinitionJsonSchema>;
      required?: string[];
    }
  | { oneOf: CdfDefinitionJsonSchema[] }
  // eslint-disable-next-line vx/gts-identifiers
  | { $ref: string };

/**
 * Validates that a schema is a valid JSON schema.
 * @throws if the schema is invalid
 */
export function validateSchema(schema: AnySchema): void {
  // Allow some custom keywords/formats that the NIST schema uses
  const ajv = new Ajv({
    keywords: ['refTypes'],
    formats: {
      uri: true,
      date: true,
      time: true,
      'date-time': true,
    },
  });
  ajv.compile(schema);
}

/**
 * Validates that a schema is a valid JSON schema.
 * @throws if the schema is invalid
 */
export function validateSchemaDraft04(schema: AnySchemaDraft04): void {
  // Allow some custom keywords/formats that the NIST schema uses
  const ajv = new AjvDraft04({
    keywords: ['refTypes'],
    formats: {
      uri: true,
      date: true,
      time: true,
      'date-time': true,
      byte: true,
    },
  });
  ajv.compile(schema);
}

/**
 * Returns any definitions in the schema that are not used by any other definition.
 */
export function findUnusedDefinitions(rootSchema: CdfRootJsonSchema): string[] {
  function findUsedDefinitions(schema: CdfDefinitionJsonSchema): string[] {
    if ('oneOf' in schema) {
      return schema.oneOf.flatMap(findUsedDefinitions);
    }
    if ('$ref' in schema) {
      return [schema.$ref];
    }
    if (schema.type === 'array') {
      return findUsedDefinitions(schema.items);
    }
    if (schema.type === 'object') {
      return Object.values(schema.properties).flatMap(findUsedDefinitions);
    }
    return [];
  }
  const usedDefinitions = new Set([
    ...Object.values(rootSchema.definitions).flatMap(findUsedDefinitions),
    rootSchema.$ref,
  ]);
  return Object.keys(rootSchema.definitions).filter(
    (definition) => !usedDefinitions.has(`#/definitions/${definition}`)
  );
}

/**
 * Checks if a CDF schema accepts a subset of the values accepted by another CDF
 * schema. We particularly are interested in ensuring that after we modify the VX
 * CDF schema to constrain what we accept, the values our modified schema
 * accepts are still accepted by the original NIST CDF schema.
 *
 * Due to this specialized use case, this function expects that the subset schema
 * was produced by modifying the superset schema with only the following changes:
 * - Fields removed
 * - Optional fields made required
 * - Definitions removed
 * - oneOf options removed
 * - Custom VX fields added (prefixed with `vx`) - this is a special case, since
 *   strictly a subset schema shouldn't have new fields.
 */
export function isSubsetCdfSchema(
  rootSubSchema: CdfRootJsonSchema,
  rootSuperSchema: CdfRootJsonSchema
): Result<void, string> {
  function isSubsetDefinitionSchema(
    subSchema: CdfDefinitionJsonSchema,
    superSchema: CdfDefinitionJsonSchema,
    path: string
  ): Result<void, string> {
    function fail(message: string): Result<void, string> {
      return err(`${path}: ${message}`);
    }

    if ('oneOf' in subSchema) {
      if (!('oneOf' in superSchema)) {
        return fail(`oneOf mismatch`);
      }
      for (const subSchemaOption of subSchema.oneOf) {
        const result = superSchema.oneOf.find((superSchemaOption) =>
          isSubsetDefinitionSchema(
            subSchemaOption,
            superSchemaOption,
            `${path}.oneOf`
          ).isOk()
        );
        if (!result) {
          return fail(`oneOf mismatch`);
        }
      }
      return ok();
    }

    if ('oneOf' in superSchema) {
      const result = superSchema.oneOf.find((superSchemaOption) =>
        isSubsetDefinitionSchema(subSchema, superSchemaOption, path).isOk()
      );
      if (!result) {
        return fail(`subschema not found in superschema oneOf`);
      }
      return ok();
    }

    if ('$ref' in subSchema) {
      if (!('$ref' in superSchema) || subSchema.$ref !== superSchema.$ref) {
        return fail(`$ref mismatch`);
      }
      return ok();
    }

    if (!('type' in superSchema) || subSchema.type !== superSchema.type) {
      return fail('type mismatch');
    }

    switch (subSchema.type) {
      case 'any': // 'any' should technically be a special case, but it's not really used in CDF
      case 'null':
      case 'boolean':
      case 'number':
      case 'integer':
      case 'string':
        return ok();

      case 'array':
        assert(superSchema.type === 'array');
        // Items in subSchema must be subset of items in superSchema
        return isSubsetDefinitionSchema(
          subSchema.items,
          superSchema.items,
          `${path}.items`
        );

      case 'object':
        assert(superSchema.type === 'object');
        // All properties in subSchema must be subsets of the same properties in superSchema
        for (const key of Object.keys(subSchema.properties)) {
          if (key.startsWith('vx')) continue;
          if (!superSchema.properties[key]) {
            return fail(`extra property in subschema: ${key}`);
          }
          const result = isSubsetDefinitionSchema(
            subSchema.properties[key],
            superSchema.properties[key],
            `${path}.properties.${key}`
          );
          if (result.isErr()) {
            return result;
          }
        }

        // All required properties in superSchema must be required in subSchema
        for (const key of superSchema.required ?? []) {
          if (!subSchema.required?.includes(key)) {
            return fail(`subschema must require property: ${key}`);
          }
        }

        return ok();

      /* istanbul ignore next */
      default:
        throwIllegalValue(subSchema);
    }
  }

  // Every definition in subSchema must be a subset of the same definition in superSchema
  for (const [key, subDefinition] of Object.entries(
    rootSubSchema.definitions
  )) {
    // carve out for additional custom definitions
    const [, keyName] = key.split('.');
    if (keyName && keyName.startsWith('vx')) continue;

    const superDefinition = rootSuperSchema.definitions[key];
    if (!superDefinition) {
      return err(`extra definition in subschema: ${key}`);
    }
    const result = isSubsetDefinitionSchema(
      subDefinition,
      superDefinition,
      `definitions.${key}`
    );
    if (result.isErr()) {
      return result;
    }
  }
  return ok();
}
