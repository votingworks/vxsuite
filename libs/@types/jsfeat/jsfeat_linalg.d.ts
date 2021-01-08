export function lu_solve(A: matrix_t, B: matrix_t): number;
export function cholesky_solve(A: matrix_t, B: matrix_t): number;
export function svd_decompose(A: matrix_t, W: matrix_t, U: matrix_t, V: matrix_t, options?: number | undefined): void;
export function svd_solve(A: matrix_t, X: matrix_t, B: matrix_t): void;
export function svd_invert(Ai: matrix_t, A: matrix_t): void;
export function eigenVV(A: matrix_t, vects?: matrix_t | undefined, vals?: matrix_t | undefined): void;
export type Data = Uint8Array | Int32Array | Float32Array | Float64Array;
import matrix_t from "./jsfeat_struct/matrix_t";
