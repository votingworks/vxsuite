/**
 * @typedef {import('./jsfeat').Classifier} Classifier
 * @typedef {import('./jsfeat').Rect} Rect
 */
export const edges_density: 0.07;
export function detect_single_scale(int_sum: number[], int_sqsum: number[], int_tilted: number[], int_canny_sum: number[], width: number, height: number, scale: number, classifier: any): import("./jsfeat").Rect[];
export function detect_multi_scale(int_sum: number[], int_sqsum: number[], int_tilted: number[], int_canny_sum: number[], width: number, height: number, classifier: any, scale_factor?: number | undefined, scale_min?: number | undefined): import("./jsfeat").Rect[];
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
