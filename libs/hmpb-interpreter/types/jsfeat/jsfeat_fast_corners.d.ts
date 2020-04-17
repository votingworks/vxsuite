export function set_threshold(threshold: number): number;
export function detect(src: import("./jsfeat").matrix_t, corners: import("./jsfeat").Point[], border?: number | undefined): number;
export type Point = {
    x: number;
    y: number;
    score: number;
};
export type Data = Uint8Array | Int32Array | Float32Array | Float64Array;
export type matrix_t = import("./jsfeat").matrix_t;
