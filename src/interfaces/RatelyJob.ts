/**
 * Object that users should pass to Rately for eventual execution
 *
 * @interface RatelyJob workFn is a function that can return a promise and contains
 * the work to do; cbFn is an optional function that is executed after workFn
 * returns/resolves
 */
export default interface RatelyJob {
  workFn: Function,
  cbFn?: Function
};
