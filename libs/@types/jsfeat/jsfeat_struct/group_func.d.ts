export default group_func;
export type Rect = {
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
    neighbors: number;
};
declare function group_func(r1: import("../jsfeat").Rect, r2: import("../jsfeat").Rect): boolean;
