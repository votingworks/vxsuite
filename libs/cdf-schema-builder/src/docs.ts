import { DocumentedEntity, DocumentedProperty, DocumentedType } from './types';

/**
 * Finds the documentation for a given type.
 */
export function findDocForType(
  docs: DocumentedEntity[],
  typeName: string
): DocumentedType | undefined {
  return docs.find(
    (doc): doc is DocumentedType =>
      doc.kind === 'DocumentedType' && doc.type === typeName
  );
}

/**
 * Finds the documentation for a given property.
 */
export function findDocForProperty(
  docs: DocumentedEntity[],
  typeName: string,
  propertyName: string
): DocumentedProperty | undefined {
  const directDoc = docs.find(
    (doc): doc is DocumentedProperty =>
      doc.kind === 'DocumentedProperty' &&
      doc.type === typeName &&
      doc.name === propertyName
  );

  if (directDoc) {
    return directDoc;
  }

  const typeDoc = findDocForType(docs, typeName);
  if (typeDoc?.extends) {
    return findDocForProperty(docs, typeDoc.extends, propertyName);
  }
}
