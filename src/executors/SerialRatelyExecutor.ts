import RatelyJob from '../interfaces/RatelyJob';
import RatelyOptions from '../interfaces/RatelyOptions';

/**
 * Executes work asynchronously but in a
 * serialized manner.
 *
 * @export SerialRatelyExecutor class
 * @class SerialRatelyExecutor
 */
export default class SerialRatelyExecutor {
  intervalId: number;
  executeSerially: boolean;
  wakeUpFn: Function;

  maxOperationsPerInterval: number;
  rateLimitIntervalMs: number;
  bufferMs: number;

  // queue is an array in form: [end of q, ..., front of q]
  waitingQueue: Array<RatelyJob>;
  numOperationsActive: number;

  serialPromise: Promise<any>;

  constructor(options = {}) {
    const defaultOptions : RatelyOptions = {
      maxOperationsPerInterval: 10,
      rateLimitIntervalMs: 10000,
      bufferMs: 200
    };

    const finalOptions = Object.assign(defaultOptions, options)

    this.maxOperationsPerInterval = finalOptions.maxOperationsPerInterval;
    this.rateLimitIntervalMs = finalOptions.rateLimitIntervalMs;
    this.bufferMs = finalOptions.bufferMs;

    this.waitingQueue = [];
    this.numOperationsActive = 0;

    this.serialPromise = Promise.resolve();

    this.wakeUpFn = this.onWakeUp.bind(this);
  }

  add(...jobs: Array<RatelyJob>) {
    jobs.forEach((job) => this.waitingQueue.unshift(job));

    if (this.executorHasStarted()) {
      // if the executor has already set an interval,
      // the safest thing to do is to enqueue the job.
      //
      // otherwise, it's possible that during a wakeUpFn() (which modifies
      // the current number of remaining operations for the interval)
      // add() can be called which leads to more than the max number
      // of operations running in the current interval.
      //
      // this branch is intentionally left blank to document this reasoning.
    } else {
      // otherwise, trigger a wake up and start the executor
      this.wakeUpFn();
      this.start();
    }
  }

  /**
   * Executes work serially, meaning at most one workFn is executed at a time
   *
   * @memberof SerialRatelyExecutor
   */
  onWakeUp() {
    const numWorkThatCanBeChained = this.maxOperationsPerInterval - this.numOperationsActive;
    const numWorkToChain = Math.min(this.waitingQueue.length, numWorkThatCanBeChained);

    if (numWorkToChain > 0) {
      for (let i = 0; i < numWorkToChain; i++) {
        this.numOperationsActive += 1;

        this.serialPromise = this.serialPromise.then(() => {
          return this.performJob(this.waitingQueue.pop());
        }).then(() => {
          this.numOperationsActive -= 1;
        });
      }
    }
  }

  /**
   * Executes the job, calling an optional callback. Always returns a promise
   * that wraps the original job
   *
   * @param {RatelyJob} job
   * @returns {Promise<any>}
   * @memberof SerialRatelyExecutor
   */
  async performJob(job: RatelyJob) : Promise<any> {
    // execute the job!
    const workResult = job.workFn();
    const cbFnExists = typeof job.cbFn === 'function';

    // handle callback function (if any)
    if (typeof workResult === 'object' && typeof workResult.then === 'function') {
      return workResult.then((result) => {
        if (cbFnExists) job.cbFn(result);
      });
    } else {
      if (cbFnExists) job.cbFn(workResult);
      return Promise.resolve();
    }
  }

  /**
   *Begins executing queued jobs, respecting the rate limit interval
   *
   * @memberof SerialRatelyExecutor
   */
  start() {
    if (!this.executorHasStarted()) {
      this.intervalId = setInterval(this.wakeUpFn, this.rateLimitIntervalMs + this.bufferMs);
    }
  }

  /**
   *Stops exeution of new jobs (does not cancel any active ones)
   *
   * @memberof SerialRatelyExecutor
   */
  stop() {
    if (this.executorHasStarted()) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  executorHasStarted() {
    return !!this.intervalId;
  }
}
