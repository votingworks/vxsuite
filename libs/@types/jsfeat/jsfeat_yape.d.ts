/**
 * @type {lev_table_t[]}
 */
export const level_tables: lev_table_t[];
export const tau: 7;
export function init(width: number, height: number, radius: number, pyramid_levels?: number | undefined): void;
export function detect(src: import("./jsfeat").matrix_t, points: import("./jsfeat").Point[], border?: number | undefined): number;
export type Point = {
    x: number;
    y: number;
    score: number;
};
export type Data = Uint8Array | Int32Array | Float32Array | Float64Array;
export type matrix_t = import("./jsfeat").matrix_t;
declare class lev_table_t {
    /**
     * @param {number} w
     * @param {number} h
     * @param {number} r
     */
    constructor(w: number, h: number, r: number);
    dirs: Int32Array;
    dirs_count: number;
    scores: Int32Array;
    radius: number;
}
export {};
