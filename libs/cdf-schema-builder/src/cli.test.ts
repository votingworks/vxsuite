import { fakeReadable, fakeWritable } from '@votingworks/test-utils';
import { writeFile } from 'fs/promises';
import { tmpNameSync } from 'tmp';
import { main, parseOptions, Stdio } from './cli';

test('help prints usage', async () => {
  const stdio: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  const exitCode = await main(
    ['node', '/path/to/cdf-schema-builder', '--help'],
    stdio
  );
  expect({
    exitCode,
    stdout: stdio.stdout.toString(),
    stderr: stdio.stderr.toString(),
  }).toMatchInlineSnapshot(`
    Object {
      "exitCode": 0,
      "stderr": "",
      "stdout": "Usage: cdf-schema-builder <schema.xml> <schema.json>
    ",
    }
  `);
});

test('error prints usage and error message', async () => {
  const stdio: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  const exitCode = await main(
    ['node', '/path/to/cdf-schema-builder', '--unknown-option'],
    stdio
  );
  expect({
    exitCode,
    stdout: stdio.stdout.toString(),
    stderr: stdio.stderr.toString(),
  }).toMatchInlineSnapshot(`
    Object {
      "exitCode": 1,
      "stderr": "error: unknown option: --unknown-option

    Usage: cdf-schema-builder <schema.xml> <schema.json>
    ",
      "stdout": "",
    }
  `);
});

test('--help/-h', () => {
  for (const arg of ['--help', '-h']) {
    expect(parseOptions(['node', '/path/to/cdf-schema-builder', arg])).toEqual({
      type: 'help',
    });
  }
});

test('invalid option', () => {
  expect(
    parseOptions(['node', '/path/to/cdf-schema-builder', '--invalid'])
  ).toEqual({
    type: 'error',
    error: new Error('unknown option: --invalid\n'),
  });
});

test('unknown file extension', () => {
  expect(
    parseOptions(['node', '/path/to/cdf-schema-builder', 'schema.invalid'])
  ).toEqual({
    type: 'error',
    error: new Error('unknown file extension: schema.invalid\n'),
  });
});

test('missing XSD or JSON schema file path', () => {
  expect(parseOptions(['node', '/path/to/cdf-schema-builder'])).toEqual({
    type: 'error',
    error: new Error('missing XSD or JSON schema file path\n'),
  });
});

test('valid options', () => {
  expect(
    parseOptions([
      'node',
      '/path/to/cdf-schema-builder',
      'schema.xsd',
      'schema.json',
    ])
  ).toEqual({
    type: 'build',
    xsdSchemaFilePath: 'schema.xsd',
    jsonSchemaFilePath: 'schema.json',
  });
});

test('successful build', async () => {
  const stdio: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  const xsdSchemaFilePath = tmpNameSync({ postfix: '.xsd' });
  const jsonSchemaFilePath = tmpNameSync({ postfix: '.json' });
  await writeFile(
    xsdSchemaFilePath,
    `<?xml version="1.0" encoding="UTF-8"?>
    <xsd:schema elementFormDefault="qualified" targetNamespace="http://itl.nist.gov/ns/voting/1500-101/v1" version="1.0.2" xmlns="http://itl.nist.gov/ns/voting/1500-101/v1" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
      <xsd:complexType name="Person">
        <xsd:annotation>
          <xsd:documentation xml:lang="en">A person with a name and stuff.</xsd:documentation>
        </xsd:annotation>
        <xsd:sequence>
          <xsd:element name="firstName" type="xsd:string">
            <xsd:annotation>
              <xsd:documentation xml:lang="en">The person's first name.</xsd:documentation>
            </xsd:annotation>
          </xsd:element>
          <xsd:element name="lastName" type="xsd:string">
            <xsd:annotation>
              <xsd:documentation xml:lang="en">The person's last name.</xsd:documentation>
            </xsd:annotation>
          </xsd:element>
          <xsd:element name="age" type="xsd:integer">
            <xsd:annotation>
              <xsd:documentation xml:lang="en">The person's age.</xsd:documentation>
            </xsd:annotation>
          </xsd:element>
        </xsd:sequence>
      </xsd:complexType>
    </xsd:schema>
    `
  );
  await writeFile(
    jsonSchemaFilePath,
    JSON.stringify({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      definitions: {
        Person: {
          $id: 'https://example.com/person.schema.json',
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          title: 'Person',
          type: 'object',
          properties: {
            firstName: {
              type: 'string',
            },
            lastName: {
              type: 'string',
            },
            age: {
              type: 'integer',
              minimum: 0,
            },
          },
          additionalProperties: false,
          required: ['firstName', 'lastName'],
        },
      },
    })
  );

  const exitCode = await main(
    [
      'node',
      '/path/to/cdf-schema-builder',
      xsdSchemaFilePath,
      jsonSchemaFilePath,
    ],
    stdio
  );
  expect({
    exitCode,
    stdout: stdio.stdout.toString(),
    stderr: stdio.stderr.toString(),
  }).toMatchInlineSnapshot(`
    Object {
      "exitCode": 0,
      "stderr": "",
      "stdout": "// DO NOT EDIT THIS FILE. IT IS GENERATED AUTOMATICALLY.

    /* eslint-disable */

    import { z } from 'zod';

    import { Iso8601Date } from '@votingworks/types';

    /**
     * Type for xsd:datetime values.
     */
    export type DateTime = z.TypeOf<typeof Iso8601Date>;

    /**
     * Schema for {@link DateTime}.
     */
    export const DateTimeSchema = Iso8601Date;

    /**
     * Type for xsd:date values.
     */
    export type Date = z.TypeOf<typeof Iso8601Date>;

    /**
     * Schema {@link Date}.
     */
    export const DateSchema = Iso8601Date;

    /**
     * A URI/URL.
     */
    export type Uri = string;

    /**
     * Schema for {@link Uri}.
     */
    export const UriSchema = z.string();

    /**
     * Byte data stored in a string.
     */
    export type Byte = string;

    /**
     * Schema for {@link Byte}.
     */
    export const ByteSchema = z.string();

    /**
     * An integer number, i.e. a whole number without fractional part.
     */
    export type integer = number;

    /**
     * Schema for {@link integer}.
     */
    export const integerSchema = z.number().int();

    /**
     * A person with a name and stuff.
     */
    export interface Person {
      /**
       * The person's first name.
       */
      readonly firstName: string;

      /**
       * The person's last name.
       */
      readonly lastName: string;

      /**
       * The person's age.
       */
      readonly age?: integer;
    }

    /**
     * Schema for {@link Person}.
     */
    export const PersonSchema: z.ZodSchema<Person> = z.object({
      firstName: z.string(),
      lastName: z.string(),
      age: z.optional(integerSchema),
    });

    ",
    }
  `);
});
