import { DocumentedEntity } from './types';
import {
  extractDocumentation,
  extractDocumentationForSchema,
  getChildOfType,
  getChildrenOfType,
  parseXsdSchema,
} from './xsd';

let schema: Element;

beforeEach(() => {
  schema = parseXsdSchema(
    `<?xml version="1.0" encoding="UTF-8"?>
   <xsd:schema elementFormDefault="qualified" targetNamespace="http://itl.nist.gov/ns/voting/1500-101/v1" version="1.0.2" xmlns="http://itl.nist.gov/ns/voting/1500-101/v1" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
     <!-- a comment -->
     <xsd:simpleType name="DayOfWeek">
       <xsd:annotation>
         <xsd:documentation>A day of the week.</xsd:documentation>
       </xsd:annotation>
       <xsd:restriction base="xsd:string">
         <xsd:enumeration value="Monday">
           <xsd:annotation>
             <xsd:documentation>The first day of the week.</xsd:documentation>
           </xsd:annotation>
         </xsd:enumeration>
         <xsd:enumeration value="Tuesday">
           <xsd:annotation>
             <xsd:documentation />
           </xsd:annotation>
         </xsd:enumeration>
         <xsd:enumeration value="Wednesday"/>
         <xsd:enumeration value="Thursday"/>
         <xsd:enumeration value="Friday"/>
         <xsd:enumeration value="Saturday"/>
         <xsd:enumeration value="Sunday"/>
       </xsd:restriction>
     </xsd:simpleType>
     <xsd:complexType name="Person">
       <xsd:annotation>
         <xsd:documentation>A person.</xsd:documentation>
       </xsd:annotation>
       <xsd:sequence>
         <xsd:element name="name" type="xsd:string" minOccurs="1" maxOccurs="1"/>
         <xsd:element name="birthday" type="xsd:date" minOccurs="1" maxOccurs="1">
           <xsd:annotation>
             <xsd:documentation>The person's birthday.</xsd:documentation>
           </xsd:annotation>
         </xsd:element>
       </xsd:sequence>
     </xsd:complexType>
     <xsd:complexType name="PersonWithAddress">
       <xsd:complexContent>
         <xsd:extension base="Person">
           <xsd:sequence>
             <xsd:element name="address" type="xsd:string" minOccurs="1" maxOccurs="1"/>
           </xsd:sequence>
         </xsd:extension>
       </xsd:complexContent>
     </xsd:complexType>
     <xsd:complexType name="Employee">
       <xsd:complexContent>
         <xsd:extension base="PersonWithAddress" />
       </xsd:complexContent>
     </xsd:complexType>
   </xsd:schema>`
  );
});

test('getChildOfType', () => {
  expect(getChildOfType(schema, 'xsd:simpleType')?.nodeName).toEqual(
    'xsd:simpleType'
  );
  expect(getChildOfType(schema, 'not-there')).toBeUndefined();
});

test('getChildrenOfType', () => {
  const simpleTypeElements = getChildrenOfType(schema, 'xsd:simpleType');
  expect(simpleTypeElements).toHaveLength(1);
  expect(
    getChildrenOfType(
      getChildrenOfType(simpleTypeElements[0]!, 'xsd:restriction')[0]!,
      'xsd:enumeration'
    )
  ).toHaveLength(7);
  expect(getChildrenOfType(schema, 'not-there')).toHaveLength(0);
});

test('extractDocumentation', () => {
  expect(extractDocumentation(schema)).toBeUndefined();

  const dayOfWeekElement = getChildOfType(schema, 'xsd:simpleType')!;
  expect(extractDocumentation(dayOfWeekElement)).toEqual('A day of the week.');

  const [mondayElement, tuesdayElement] = getChildrenOfType(
    getChildOfType(dayOfWeekElement, 'xsd:restriction')!,
    'xsd:enumeration'
  )!;
  expect(extractDocumentation(mondayElement!)).toEqual(
    'The first day of the week.'
  );
  expect(extractDocumentation(tuesdayElement!)).toEqual('');
});

test('extractDocumentationForSchema', () => {
  expect(extractDocumentationForSchema(schema.firstChild as Element)).toEqual(
    []
  );

  expect(extractDocumentationForSchema(schema)).toEqual<DocumentedEntity[]>([
    {
      kind: 'DocumentedType',
      type: 'DayOfWeek',
      documentation: 'A day of the week.',
    },
    {
      kind: 'DocumentedProperty',
      type: 'DayOfWeek',
      name: 'Monday',
      documentation: 'The first day of the week.',
    },
    {
      kind: 'DocumentedProperty',
      type: 'DayOfWeek',
      name: 'Tuesday',
      documentation: '',
    },
    {
      kind: 'DocumentedProperty',
      type: 'DayOfWeek',
      name: 'Wednesday',
    },
    {
      kind: 'DocumentedProperty',
      type: 'DayOfWeek',
      name: 'Thursday',
    },
    {
      kind: 'DocumentedProperty',
      type: 'DayOfWeek',
      name: 'Friday',
    },
    {
      kind: 'DocumentedProperty',
      type: 'DayOfWeek',
      name: 'Saturday',
    },
    {
      kind: 'DocumentedProperty',
      type: 'DayOfWeek',
      name: 'Sunday',
    },
    {
      kind: 'DocumentedType',
      type: 'Person',
      documentation: 'A person.',
    },
    {
      kind: 'DocumentedProperty',
      type: 'Person',
      name: 'birthday',
      documentation: `The person's birthday.`,
    },
    {
      kind: 'DocumentedType',
      type: 'PersonWithAddress',
      extends: 'Person',
    },
    {
      kind: 'DocumentedType',
      type: 'Employee',
      extends: 'PersonWithAddress',
    },
  ]);

  getChildOfType(
    getChildOfType(schema, 'xsd:simpleType')!,
    'xsd:restriction'
  )!.remove();

  for (const complexTypeElement of getChildrenOfType(
    schema,
    'xsd:complexType'
  )) {
    complexTypeElement.remove();
  }

  expect(extractDocumentationForSchema(schema)).toEqual<DocumentedEntity[]>([
    {
      kind: 'DocumentedType',
      type: 'DayOfWeek',
      documentation: 'A day of the week.',
    },
  ]);
});
