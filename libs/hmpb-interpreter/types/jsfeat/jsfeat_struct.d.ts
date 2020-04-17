/**
 * @author Eugene Zatepyakin / http://inspirit.ru/
 */
export var EPSILON: number;
export var FLT_MIN: number;
export var U8_t: number;
export var S32_t: number;
export var F32_t: number;
export var S64_t: number;
export var F64_t: number;
export var C1_t: number;
export var C2_t: number;
export var C3_t: number;
export var C4_t: number;
export function get_data_type(type: number): number;
export function get_channel(type: number): number;
export function get_data_type_size(type: number): number;
export var COLOR_RGBA2GRAY: number;
export var COLOR_RGB2GRAY: number;
export var COLOR_BGRA2GRAY: number;
export var COLOR_BGR2GRAY: number;
export var BOX_BLUR_NOSCALE: number;
export var SVD_U_T: number;
export var SVD_V_T: number;
export const U8C1_t: number;
export const U8C3_t: number;
export const U8C4_t: number;
export const F32C1_t: number;
export const F32C2_t: number;
export const S32C1_t: number;
export const S32C2_t: number;
export type Data = Uint8Array | Int32Array | Float32Array | Float64Array;
