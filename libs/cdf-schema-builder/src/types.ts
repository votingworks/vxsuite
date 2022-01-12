/**
 * A type defined in an XSD file.
 */
export interface DocumentedType {
  kind: 'DocumentedType';
  type: string;
  extends?: string;
  documentation?: string;
}

/**
 * A property defined in an XSD file. May be an attribute or an element.
 */
export interface DocumentedProperty {
  kind: 'DocumentedProperty';
  type: string;
  name: string;
  documentation?: string;
}

/**
 * A type or property defined in an XSD file.
 */
export type DocumentedEntity = DocumentedType | DocumentedProperty;

/**
 * An enumeration description, i.e. equivalent to a TypeScript enum.
 */
export interface Enum {
  name: string;
  values: EnumValue[];
  documentation?: string;
}

/**
 * An enumeration value description, i.e. equivalent to a TypeScript enum value.
 */
export interface EnumValue {
  name: string;
  value: string;
  documentation?: string;
}

/**
 * An interface description, i.e. equivalent to a TypeScript interface.
 */
export interface Interface {
  name: string;
  properties: Property[];
  documentation?: string;
}

/**
 * An interface property description, i.e. equivalent to a TypeScript property.
 */
export interface Property {
  name: string;
  type: Type;
  required: boolean;
  documentation?: string;
}

/**
 * Types representable with JSON Schema.
 */
export type Type =
  | { kind: 'string'; pattern?: string; format?: string }
  | { kind: 'integer' }
  | { kind: 'number' }
  | { kind: 'boolean' }
  | { kind: 'array'; items: Type; minItems?: number }
  | { kind: 'literal'; value: string | number | boolean }
  | { kind: 'reference'; name: string }
  | { kind: 'union'; types: Type[] };

/**
 * An alias for `string`, optionally with a pattern restricting its value.
 */
export interface StringAlias {
  kind: 'string';
  name: string;
  pattern?: string;
  documentation?: string;
}
