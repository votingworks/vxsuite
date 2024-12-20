import { throwIllegalValue } from '@votingworks/basics';
import { Type } from './types';

/**
 * Determines whether a string matches a semver pattern.
 */
export function isVersionString(version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version);
}

/**
 * Creates a valid uppercase identifier from a kebab-case string.
 */
export function makeIdentifier(kebabCaseString: string): string {
  if (isVersionString(kebabCaseString)) {
    return `v${kebabCaseString.replace(/\./g, '_')}`;
  }

  const result = kebabCaseString
    .replace(/\./g, '_')
    .replace(/\b[a-z]/g, (match) => match.toUpperCase())
    .replace(/[^a-z\d_]/gi, '');
  return /^\d/.test(result) ? `_${result}` : result;
}

/**
 * Determines whether `identifier` is a valid JavaScript identifier.
 */
export function isValidIdentifier(identifier: string): boolean {
  return /^[a-z_$][a-z\d_$]*$/i.test(identifier);
}

/**
 * Converts a generic type to a string that can be used in a type declaration.
 */
export function renderTypeAsDeclaration(type: Type): string {
  switch (type.kind) {
    case 'string':
      return type.format ? makeIdentifier(type.format) : 'string';

    case 'boolean':
    case 'integer':
    case 'number':
      return type.kind;

    case 'literal':
      return typeof type.value === 'string'
        ? `'${type.value}'`
        : `${type.value}`;

    case 'array': {
      const item = renderTypeAsDeclaration(type.items);
      return isValidIdentifier(item)
        ? `readonly ${item}[]`
        : `ReadonlyArray<${item}>`;
    }

    case 'union':
      return type.types.map(renderTypeAsDeclaration).join(' | ');

    case 'reference':
      return type.name;

    default:
      throwIllegalValue(type);
  }
}

/**
 * Converts a generic type to a Zod schema.
 */
export function renderTypeAsZodSchema(type: Type): string {
  switch (type.kind) {
    case 'string':
      return type.format
        ? `${makeIdentifier(type.format)}Schema`
        : 'z.string()';

    case 'boolean':
      return 'z.boolean()';

    case 'number':
      return 'z.number()';

    case 'integer':
      return 'integerSchema';

    case 'literal':
      return `z.literal(${
        typeof type.value === 'string' ? `'${type.value}'` : `${type.value}`
      })`;

    case 'array':
      return `z.array(${renderTypeAsZodSchema(type.items)})${
        type.minItems ? `.min(${type.minItems})` : ''
      }`;

    case 'union':
      if (type.types.length === 1) {
        return renderTypeAsZodSchema(type.types[0] as Type);
      }

      return `z.union([${type.types.map(renderTypeAsZodSchema).join(', ')}])`;

    case 'reference':
      return `z.lazy(/* istanbul ignore next - @preserve */ () => ${type.name}Schema)`;

    default:
      throwIllegalValue(type);
  }
}
