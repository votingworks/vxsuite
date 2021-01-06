export function allocate(capacity: number, data_size: number): void;
export function get_buffer(size_in_bytes: number): _pool_node_t;
export function put_buffer(node: _pool_node_t): void;
declare class _pool_node_t {
    /**
     * @param {number} size_in_bytes
     */
    constructor(size_in_bytes: number);
    /**
     * @type {_pool_node_t | undefined}
     */
    next: _pool_node_t | undefined;
    data: data_t;
    size: number;
    buffer: ArrayBuffer;
    u8: Uint8Array;
    i32: Int32Array;
    f32: Float32Array;
    f64: Float64Array;
}
import data_t from "./jsfeat_struct/data_t";
export {};
