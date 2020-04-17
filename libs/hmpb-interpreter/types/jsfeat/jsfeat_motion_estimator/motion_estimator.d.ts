export function ransac(params: import("./ransac_params_t").default, kernel: import("./motion_model").MotionModelKernel, from: import("../jsfeat").Point[], to: import("../jsfeat").Point[], count: number, model: matrix_t, mask: matrix_t, max_iters?: number | undefined): boolean;
export function lmeds(params: import("./ransac_params_t").default, kernel: import("./motion_model").MotionModelKernel, from: import("../jsfeat").Point[], to: import("../jsfeat").Point[], count: number, model: matrix_t, mask: matrix_t, max_iters?: number | undefined): boolean;
export type ransac_params_t = import("./ransac_params_t").default;
export type Point = {
    x: number;
    y: number;
    score: number;
};
export type Data = Uint8Array | Int32Array | Float32Array | Float64Array;
export type MotionModelKernel = {
    run: (from: import("../jsfeat").Point[], to: import("../jsfeat").Point[], model: matrix_t, count: number) => number;
    error: (from: import("../jsfeat").Point[], to: import("../jsfeat").Point[], model: matrix_t, err: Uint8Array | Int32Array | Float32Array | Float64Array, count: number) => void;
    check_subset: (from: import("../jsfeat").Point[], to: import("../jsfeat").Point[], count: number) => boolean;
};
import matrix_t from "../jsfeat_struct/matrix_t";
