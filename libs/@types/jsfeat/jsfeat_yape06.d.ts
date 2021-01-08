export const laplacian_threshold: 30;
export const min_eigen_value_threshold: 25;
export function detect(src: import("./jsfeat").matrix_t, points: import("./jsfeat").Point[], border: number): number;
export type Point = {
    x: number;
    y: number;
    score: number;
};
export type Data = Uint8Array | Int32Array | Float32Array | Float64Array;
export type matrix_t = import("./jsfeat").matrix_t;
