/**
 * @typedef {(from: import('../jsfeat').Point[], to: import('../jsfeat').Point[], model: matrix_t, count: number) => number} MotionModelKernelRun
 */
/**
 * @typedef {(from: import('../jsfeat').Point[], to: import('../jsfeat').Point[], model: matrix_t, err: import('../jsfeat_struct').Data, count: number) => void} MotionModelKernelError
 */
/**
 * @typedef {(from: import('../jsfeat').Point[], to: import('../jsfeat').Point[], count: number) => boolean} MotionModelKernelCheckSubset
 */
/**
 * @typedef {object} MotionModelKernel
 * @property {MotionModelKernelRun} run
 * @property {MotionModelKernelError} error
 * @property {MotionModelKernelCheckSubset} check_subset
 */
/**
 * @implements {MotionModelKernel}
 */
export class affine2d {
    /**
     * @param {Point[]} from
     * @param {Point[]} to
     * @param {matrix_t} model
     * @param {number} count
     * @returns {number}
     */
    run(from: import("../jsfeat").Point[], to: import("../jsfeat").Point[], model: matrix_t, count: number): number;
    /**
     *
     * @param {Point[]} from
     * @param {Point[]} to
     * @param {matrix_t} model
     * @param {Float32Array} err
     * @param {number} count
     */
    error(from: import("../jsfeat").Point[], to: import("../jsfeat").Point[], model: matrix_t, err: Float32Array, count: number): void;
    check_subset(): boolean;
}
export class homography2d {
    /**
     * @param {Point[]} from
     * @param {Point[]} to
     * @param {matrix_t} model
     * @param {number} count
     * @returns {number}
     */
    run(from: import("../jsfeat").Point[], to: import("../jsfeat").Point[], model: matrix_t, count: number): number;
    /**
     * @param {Point[]} from
     * @param {Point[]} to
     * @param {matrix_t} model
     * @param {Float32Array} err
     * @param {number} count
     */
    error(from: import("../jsfeat").Point[], to: import("../jsfeat").Point[], model: matrix_t, err: Float32Array, count: number): void;
    /**
     * @param {Point[]} from
     * @param {Point[]} to
     * @param {number} count
     * @returns {boolean}
     */
    check_subset(from: import("../jsfeat").Point[], to: import("../jsfeat").Point[], count: number): boolean;
}
export type Point = {
    x: number;
    y: number;
    score: number;
};
export type Data = Uint8Array | Int32Array | Float32Array | Float64Array;
export type MotionModelKernelRun = (from: import("../jsfeat").Point[], to: import("../jsfeat").Point[], model: matrix_t, count: number) => number;
export type MotionModelKernelError = (from: import("../jsfeat").Point[], to: import("../jsfeat").Point[], model: matrix_t, err: Uint8Array | Int32Array | Float32Array | Float64Array, count: number) => void;
export type MotionModelKernelCheckSubset = (from: import("../jsfeat").Point[], to: import("../jsfeat").Point[], count: number) => boolean;
export type MotionModelKernel = {
    run: (from: import("../jsfeat").Point[], to: import("../jsfeat").Point[], model: matrix_t, count: number) => number;
    error: (from: import("../jsfeat").Point[], to: import("../jsfeat").Point[], model: matrix_t, err: Uint8Array | Int32Array | Float32Array | Float64Array, count: number) => void;
    check_subset: (from: import("../jsfeat").Point[], to: import("../jsfeat").Point[], count: number) => boolean;
};
import matrix_t from "../jsfeat_struct/matrix_t";
