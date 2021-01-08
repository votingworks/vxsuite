export default class matrix_t {
    /**
     * @param {number} c
     * @param {number} r
     * @param {number} data_type
     * @param {data_t=} data_buffer
     */
    constructor(c: number, r: number, data_type: number, data_buffer?: data_t | undefined);
    type: number;
    /**
     * @type {number}
     */
    channel: number;
    cols: number;
    rows: number;
    buffer: data_t;
    data: Uint8Array | Int32Array | Float32Array | Float64Array;
    allocate(): void;
    /**
     * @param {matrix_t} other
     */
    copy_to(other: matrix_t): void;
    /**
     * @param {number} c
     * @param {number} r
     * @param {number=} ch
     */
    resize(c: number, r: number, ch?: number | undefined): void;
}
import data_t from "./data_t";
