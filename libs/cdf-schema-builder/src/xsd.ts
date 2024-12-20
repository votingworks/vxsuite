import { JSDOM } from 'jsdom';
import { DocumentedEntity } from './types';

/**
 * Gets the first child element with the given name.
 */
export function getChildOfType(
  element: Element,
  nodeName: string
): Element | undefined {
  for (const child of element.childNodes) {
    if (child.nodeType !== element.ELEMENT_NODE) {
      continue;
    }

    const childElement = child as Element;
    if (childElement.nodeName === nodeName) {
      return childElement;
    }
  }
}

/**
 * Gets all child elements with the given name.
 */
export function getChildrenOfType(
  element: Element,
  nodeName: string
): Element[] {
  const children: Element[] = [];
  for (const child of element.childNodes) {
    if (child.nodeType !== element.ELEMENT_NODE) {
      continue;
    }

    const childElement = child as Element;
    if (childElement.nodeName === nodeName) {
      children.push(childElement);
    }
  }
  return children;
}

/**
 * Extracts documentation for an element containing a documentation
 * `xsd:annotation` element.
 */
export function extractDocumentation(element: Element): string | undefined {
  for (const annotationElements of getChildrenOfType(
    element,
    'xsd:annotation'
  )) {
    const documentationElements = getChildrenOfType(
      annotationElements,
      'xsd:documentation'
    );

    if (documentationElements.length > 0) {
      return (
        (documentationElements[0] as Element).textContent ??
        /* istanbul ignore next - in practice textContent never seems to be `null` @preserve */ undefined
      );
    }
  }
}

/**
 * Extracts the documentation from an XSD schema.
 */
export function extractDocumentationForSchema(
  schema: Element
): DocumentedEntity[] {
  if (schema.nodeName !== 'xsd:schema') {
    return [];
  }

  const docs: DocumentedEntity[] = [];

  for (const simpleTypeElement of getChildrenOfType(schema, 'xsd:simpleType')) {
    const simpleTypeName = simpleTypeElement.getAttribute('name') as string;
    const documentation = extractDocumentation(simpleTypeElement);
    docs.push({
      kind: 'DocumentedType',
      type: simpleTypeName,
      documentation,
    });

    const restrictionElement = getChildOfType(
      simpleTypeElement,
      'xsd:restriction'
    );
    if (!restrictionElement) {
      continue;
    }

    const enumerationElements = getChildrenOfType(
      restrictionElement,
      'xsd:enumeration'
    );
    for (const enumerationElement of enumerationElements) {
      const enumerationValue = enumerationElement.getAttribute(
        'value'
      ) as string;
      const valueDocumentation = extractDocumentation(enumerationElement);
      docs.push({
        kind: 'DocumentedProperty',
        type: simpleTypeName,
        name: enumerationValue,
        documentation: valueDocumentation,
      });
    }
  }

  for (const complexTypeElement of getChildrenOfType(
    schema,
    'xsd:complexType'
  )) {
    const complexTypeName = complexTypeElement.getAttribute('name') as string;
    const documentation = extractDocumentation(complexTypeElement);

    const contentElement =
      getChildOfType(complexTypeElement, 'xsd:complexContent') ??
      getChildOfType(complexTypeElement, 'xsd:simpleContent');
    const extensionElement =
      contentElement && getChildOfType(contentElement, 'xsd:extension');

    docs.push({
      kind: 'DocumentedType',
      type: complexTypeName,
      extends: extensionElement?.getAttribute('base') ?? undefined,
      documentation,
    });

    const sequenceElement = getChildOfType(
      extensionElement ?? complexTypeElement,
      'xsd:sequence'
    );

    const attributeElements = getChildrenOfType(
      extensionElement ?? complexTypeElement,
      'xsd:attribute'
    );
    const elementElements = sequenceElement
      ? getChildrenOfType(sequenceElement, 'xsd:element')
      : [];
    for (const childElement of [...attributeElements, ...elementElements]) {
      const childName = childElement.getAttribute('name') as string;
      const childDocumentation = extractDocumentation(childElement);
      if (childDocumentation) {
        docs.push({
          kind: 'DocumentedProperty',
          type: complexTypeName,
          name: childName,
          documentation: childDocumentation,
        });
      }
    }

    if (!contentElement) {
      continue;
    }
  }

  return docs;
}

/**
 * Parses an XSD schema and returns the `xsd:schema` element.
 */
export function parseXsdSchema(xsdSchema: string): Element {
  const dom = new JSDOM(xsdSchema, { contentType: 'text/xml' });
  const { document } = dom.window;
  return document.documentElement;
}
