export default class pyramid_t {
    /**
     * @param {number} levels
     */
    constructor(levels: number);
    levels: number;
    data: any[];
    pyrdown: (src: matrix_t, dst: matrix_t, sx?: number | undefined, sy?: number | undefined) => void;
    /**
     * @param {number} start_w
     * @param {number} start_h
     * @param {number} data_type
     */
    allocate(start_w: number, start_h: number, data_type: number): void;
    /**
     * @param {matrix_t} input
     * @param {boolean=} skip_first_level
     */
    build(input: matrix_t, skip_first_level?: boolean | undefined): void;
}
import matrix_t from "./matrix_t";
