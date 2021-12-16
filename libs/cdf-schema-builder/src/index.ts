import { JSDOM } from 'jsdom';

interface EnumerationValue {
  documentation?: string;
  name: string;
  value: string;
}

interface Property {
  documentation?: string;
  name: string;
  type: string;
  minOccurs?: string;
  maxOccurs?: string;
}

/**
 * @VisibleForTesting
 */
export function camelize(kebabCaseString: string): string {
  return kebabCaseString
    .replace(/\b[a-z]/g, (match) => match.toUpperCase())
    .replace(/[^a-z\d]/gi, '');
}

/**
 * Extracts documentation for an element containing a documentation
 * `xsd:annotation` element.
 *
 * @VisibleForTesting
 */
export function extractDocumentation(element: Element): string | undefined {
  for (const childNode of element.childNodes) {
    if (childNode.nodeType !== element.ELEMENT_NODE) {
      continue;
    }

    const childElement = childNode as Element;
    if (childElement.nodeName === 'xsd:annotation') {
      for (const annotationChildNode of childElement.childNodes) {
        if (annotationChildNode.nodeType !== element.ELEMENT_NODE) {
          continue;
        }

        const annotationChildElement = annotationChildNode as Element;
        if (annotationChildElement.nodeName === 'xsd:documentation') {
          /* istanbul ignore next - the `?? undefined` is to satisfy the types but seems it can't happen */
          return annotationChildElement.textContent ?? undefined;
        }
      }
    }
  }

  return undefined;
}

/**
 * Generates an enum type from an `xsd:simpleType` element.
 */
function writeSimpleType(element: Element, out: NodeJS.WritableStream) {
  const name = element.getAttribute('name');
  const documentation = extractDocumentation(element);
  const enumerationValues: EnumerationValue[] = [];

  for (const child of element.childNodes) {
    if (child.nodeType !== element.ELEMENT_NODE) {
      continue;
    }
    const childElement = child as Element;
    switch (childElement.nodeName) {
      case 'xsd:restriction': {
        for (const restrictionChild of childElement.childNodes) {
          if (restrictionChild.nodeType !== element.ELEMENT_NODE) {
            continue;
          }
          const restrictionChildElement = restrictionChild as Element;
          if (restrictionChildElement.nodeName === 'xsd:enumeration') {
            const value = restrictionChildElement.getAttribute('value');
            if (value) {
              enumerationValues.push({
                name: camelize(value),
                value,
                documentation: extractDocumentation(restrictionChildElement),
              });
            }
          }
        }
        break;
      }

      default:
        break;
    }
  }

  if (documentation) {
    out.write(`/**\n`);
    out.write(` * ${documentation}\n`);
    out.write(` */\n`);
  }

  out.write(`export enum ${name} {`);

  if (enumerationValues.length > 0) {
    out.write(`\n`);
  }

  for (const [
    i,
    { name: enumerationName, value, documentation: enumerationDocumentation },
  ] of enumerationValues.entries()) {
    if (enumerationDocumentation) {
      out.write(`  /**\n`);
      out.write(`   * ${enumerationDocumentation}\n`);
      out.write(`   */\n`);
    }
    out.write(`  ${enumerationName} = '${value}',\n`);
    if (i < enumerationValues.length - 1) {
      out.write('\n');
    }
  }

  out.write(`}\n\n`);

  out.write(`/**\n`);
  out.write(` * Schema for {@link ${name}}.\n`);
  out.write(` */\n`);
  out.write(`export const ${name}Schema = z.nativeEnum(${name});\n\n`);
}

/**
 * @VisibleForTesting
 */
export function getZodSchemaRef(xsdType: string): string {
  switch (xsdType) {
    case 'xsd:string':
      return 'z.string()';

    case 'xsd:boolean':
      return 'z.boolean()';

    case 'xsd:decimal':
      return 'z.number()';

    case 'xsd:dateTime':
      return 'DateTimeSchema';

    case 'xsd:date':
      return 'DateSchema';

    default:
      if (xsdType.startsWith('xsd:')) {
        throw new Error(`Unsupported xsd type: ${xsdType}`);
      } else {
        // Use `lazy` because we don't control the order of the elements in the
        // schema, so we can't assume that the referenced schema will be defined
        // before this one.
        return `z.lazy(() => ${xsdType}Schema)`;
      }
  }
}

/**
 * @VisibleForTesting
 */
export function getTypeScriptTypeRef(xsdType: string): string {
  switch (xsdType) {
    case 'xsd:string':
      return 'string';

    case 'xsd:boolean':
      return 'boolean';

    case 'xsd:decimal':
      return 'number';

    case 'xsd:dateTime':
      return 'string';

    case 'xsd:date':
      return 'string';

    default:
      if (xsdType.startsWith('xsd:')) {
        throw new Error(`Unsupported xsd type: ${xsdType}`);
      } else {
        return xsdType;
      }
  }
}

/**
 * Generates an object interface from an `xsd:complexType` element.
 */
function writeComplexType(element: Element, out: NodeJS.WritableStream) {
  const name = element.getAttribute('name');
  const documentation = extractDocumentation(element);
  const properties: Property[] = [];

  for (const child of element.childNodes) {
    if (child.nodeType !== element.ELEMENT_NODE) {
      continue;
    }

    const childElement = child as Element;
    switch (childElement.nodeName) {
      case 'xsd:sequence': {
        for (const sequenceChild of childElement.childNodes) {
          if (sequenceChild.nodeType !== element.ELEMENT_NODE) {
            continue;
          }
          const sequenceChildElement = sequenceChild as Element;
          if (sequenceChildElement.nodeName === 'xsd:element') {
            const elementName = sequenceChildElement.getAttribute(
              'name'
            ) as string;
            const elementType = sequenceChildElement.getAttribute(
              'type'
            ) as string;
            const minOccurs =
              sequenceChildElement.getAttribute('minOccurs') ?? '1';
            const maxOccurs =
              sequenceChildElement.getAttribute('maxOccurs') ?? '1';
            const elementDocumentation =
              extractDocumentation(sequenceChildElement);

            properties.push({
              name: elementName,
              type: elementType,
              documentation: elementDocumentation,
              minOccurs,
              maxOccurs,
            });
          }
        }
        break;
      }

      default:
        break;
    }
  }

  if (documentation) {
    out.write(`/**\n`);
    out.write(` * ${documentation}\n`);
    out.write(` */\n`);
  }

  out.write(`export interface ${name} {\n`);

  for (const [
    i,
    {
      name: propertyName,
      type: propertyType,
      documentation: propertyDocumentation,
      minOccurs,
      maxOccurs,
    },
  ] of properties.entries()) {
    if (propertyDocumentation) {
      out.write(`  /**\n`);
      out.write(`   * ${propertyDocumentation}\n`);
      out.write(`   */\n`);
    }
    const typeScriptTypeRef = getTypeScriptTypeRef(propertyType);
    if (maxOccurs === 'unbounded') {
      out.write(`  ${propertyName}: ${typeScriptTypeRef}[];\n`);
    } else {
      out.write(
        `  ${propertyName}${
          minOccurs === '0' ? '?' : ''
        }: ${typeScriptTypeRef};\n`
      );
    }

    if (i < properties.length - 1) {
      out.write('\n');
    }
  }

  out.write('}\n\n');

  out.write(`/**\n`);
  out.write(` * Schema for {@link ${name}}.\n`);
  out.write(` */\n`);
  out.write(`export const ${name}Schema: z.ZodSchema<${name}> = z.object({\n`);
  for (const {
    name: propertyName,
    type: propertyType,
    minOccurs,
    maxOccurs,
  } of properties) {
    let propertySchemaRef = getZodSchemaRef(propertyType);
    if (maxOccurs === 'unbounded') {
      propertySchemaRef = `z.array(${propertySchemaRef})`;
      if (minOccurs === '1') {
        propertySchemaRef = `${propertySchemaRef}.nonempty()`;
      }
    } else if (minOccurs === '0') {
      propertySchemaRef = `z.optional(${propertySchemaRef})`;
    }

    out.write(`  ${propertyName}: ${propertySchemaRef},\n`);
  }
  out.write(`});\n\n`);
}

/**
 * Builds TypeScript interfaces and Zod schemas from an XSD schema.
 */
export function buildSchema(
  xsdSchema: string,
  out: NodeJS.WritableStream
): void {
  out.write(`// DO NOT EDIT THIS FILE. IT IS GENERATED AUTOMATICALLY.\n\n`);
  out.write(`/* eslint-disable */\n\n`);
  out.write(`import { z } from 'zod';\n\n`);
  out.write(`import { Iso8601Date } from '@votingworks/types';\n\n`);

  out.write(`/**\n`);
  out.write(` * Schema for xsd:datetime values.\n`);
  out.write(` */\n`);
  out.write(`export const DateTimeSchema = Iso8601Date;\n\n`);

  out.write(`/**\n`);
  out.write(` * Schema for xsd:date values.\n`);
  out.write(` */\n`);
  out.write(`export const DateSchema = Iso8601Date;\n\n`);

  const dom = new JSDOM(xsdSchema, { contentType: 'text/xml' });
  const { document } = dom.window;
  for (const childNode of document.documentElement.childNodes) {
    if (childNode.nodeType !== document.ELEMENT_NODE) {
      continue;
    }
    const element = childNode as Element;

    switch (element.nodeName) {
      case 'xsd:simpleType':
        writeSimpleType(element, out);
        break;

      case 'xsd:complexType':
        writeComplexType(element, out);
        break;

      default:
        break;
    }
  }
}
