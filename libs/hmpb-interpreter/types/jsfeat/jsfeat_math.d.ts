export function get_gaussian_kernel(size: number, sigma: number, kernel: Uint8Array | Int32Array | Float32Array | Float64Array, data_type: number): void;
export function perspective_4point_transform(model: import("./jsfeat_struct/matrix_t").default, src_x0: number, src_y0: number, dst_x0: number, dst_y0: number, src_x1: number, src_y1: number, dst_x1: number, dst_y1: number, src_x2: number, src_y2: number, dst_x2: number, dst_y2: number, src_x3: number, src_y3: number, dst_x3: number, dst_y3: number): void;
export function qsort(array: Uint8Array | Int32Array | Float32Array | Float64Array, low: number, high: number, cmp: (a: number, b: number) => number): void;
export function median(array: Float32Array, low: number, high: number): number;
export type Data = Uint8Array | Int32Array | Float32Array | Float64Array;
export type matrix_t = import("./jsfeat_struct/matrix_t").default;
