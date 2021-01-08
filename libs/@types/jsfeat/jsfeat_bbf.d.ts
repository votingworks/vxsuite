export let interval: number;
export let scale: number;
export let next: number;
export let scale_to: number;
export function prepare_cascade(cascade: any): void;
export function build_pyramid(src: matrix_t, min_width: number, min_height: number, newInterval?: number | undefined): pyramid_t;
export function detect(pyramid: any, cascade: any): {
    x: number;
    y: number;
    width: number;
    height: number;
    neighbor: number;
    confidence: number;
}[];
export function group_rectangles(rects: import("./jsfeat").Rect[], min_neighbors?: number | undefined): {
    x: number;
    y: number;
    width: number;
    height: number;
    neighbors: number;
    confidence: number;
}[];
export type Classifier = any;
export type Rect = {
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
    neighbors: number;
};
import matrix_t from "./jsfeat_struct/matrix_t";
import pyramid_t from "./jsfeat_struct/pyramid_t";
