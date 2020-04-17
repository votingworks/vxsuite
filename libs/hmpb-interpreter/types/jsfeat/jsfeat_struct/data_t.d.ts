export default class data_t {
    /**
     * @param {number} size_in_bytes
     */
    constructor(size_in_bytes: number);
    size: number;
    buffer: ArrayBuffer;
    u8: Uint8Array;
    i32: Int32Array;
    f32: Float32Array;
    f64: Float64Array;
}
