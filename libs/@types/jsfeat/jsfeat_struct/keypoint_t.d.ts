export default class keypoint_t {
    /**
     * @param {number=} x
     * @param {number=} y
     * @param {number=} score
     * @param {number=} level
     * @param {number=} angle
     */
    constructor(x?: number | undefined, y?: number | undefined, score?: number | undefined, level?: number | undefined, angle?: number | undefined);
    x: number;
    y: number;
    score: number;
    level: number;
    angle: number;
}
