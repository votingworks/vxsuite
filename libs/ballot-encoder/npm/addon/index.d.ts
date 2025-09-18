/* eslint-disable */
import { Buffer } from 'node:buffer'
import { Uint1, Uint8 } from '../bits';

declare const uniqueKey: unique symbol;

export interface BitWriter {
  readonly [uniqueKey]: 'BitWriter';
}

export function BitWriter_new(): BitWriter;
export function BitWriter_toBytes(this: BitWriter): Buffer;
export function BitWriter_writeUint1(this: BitWriter, ...uint1s: Uint1[]): void;
export function BitWriter_writeBoolean(this: BitWriter, ...booleans: boolean[]): void;
export function BitWriter_writeUint8(this: BitWriter, ...uint8s: Uint8[]): void;
export function BitWriter_writeUintWithMax(this: BitWriter, value: number, max: number): void;
export function BitWriter_writeUintWithSize(this: BitWriter, value: number, size: number): void;
export function BitWriter_writeStringWithUtf8Encoding(this: BitWriter, value: string, writeLength: boolean, maxLength: number): void;
export function BitWriter_writeStringWithWriteInEncoding(this: BitWriter, value: string, writeLength: boolean, maxLength: number): void;
export function BitWriter_writeStringWithHexEncoding(this: BitWriter, value: string, writeLength: boolean, maxLength: number): void;
export function BitWriter_debug(this: BitWriter): void;
