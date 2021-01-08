/**
 * @author Eugene Zatepyakin / http://inspirit.ru/
 *
 */
export default class ransac_params_t {
    /**
     * @param {number=} size
     * @param {number=} thresh
     * @param {number=} eps
     * @param {number=} prob
     */
    constructor(size?: number | undefined, thresh?: number | undefined, eps?: number | undefined, prob?: number | undefined);
    size: number;
    thresh: number;
    eps: number;
    prob: number;
    /**
     * @param {number} _eps
     * @param {number} max_iters
     */
    update_iters(_eps: number, max_iters: number): number;
}
