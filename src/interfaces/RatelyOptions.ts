/**
 * Options for constructing a new Rately instance
 *
 * @interface RatelyOptions
 */
export default interface RatelyOptions {
  maxOperationsPerInterval?: number,
  rateLimitIntervalMs?: number,
  bufferMs?: number
};
