/**
 * @author Eugene Zatepyakin / http://inspirit.ru/
 */
export const REVISION: 'ALPHA'
export { default as data_t } from './jsfeat_struct/data_t'
export { default as keypoint_t } from './jsfeat_struct/keypoint_t'
export { default as matrix_t } from './jsfeat_struct/matrix_t'
export { default as pyramid_t } from './jsfeat_struct/pyramid_t'
export * from './jsfeat_struct'
export * as cache from './jsfeat_cache'
export * as math from './jsfeat_math'
export * as matmath from './jsfeat_mat_math'
export * as linalg from './jsfeat_linalg'
export * as motion_estimator from './jsfeat_motion_estimator/motion_estimator'
export * as motion_model from './jsfeat_motion_estimator/motion_model'
export { default as ransac_params_t } from './jsfeat_motion_estimator/ransac_params_t'
export * as imgproc from './jsfeat_imgproc'
export * as fast_corners from './jsfeat_fast_corners'
export * as yape06 from './jsfeat_yape06'
export * as yape from './jsfeat_yape'
export * as orb from './jsfeat_orb'
export * as optical_flow_lk from './jsfeat_optical_flow_lk'
export * as haar from './jsfeat_haar'
export * as bbf from './jsfeat_bbf'
export type Point = {
  x: number
  y: number
}
export type Rect = {
  x: number
  y: number
  width: number
  height: number
}
export type Classifier = any
