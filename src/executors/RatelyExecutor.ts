import RatelyJob from '../interfaces/RatelyJob';
import RatelyOptions from '../interfaces/RatelyOptions';

/**
 * Executes work asynchronously and in a
 * non serialized manner.
 *
 * @export RatelyExecutor class
 * @class RatelyExecutor
 */
export default class RatelyExecutor {
  intervalId: number;
  wakeUpFn: Function;

  maxOperationsPerInterval: number;
  rateLimitIntervalMs: number;
  bufferMs: number;

  // queue is an array in form: [end of q, ..., front of q]
  waitingQueue: Array<RatelyJob>;
  numOperationsActive: number;

  // purely for testing - holds the active operations as promise(s)
  _activeOperationsForTest: Array<Promise<any>> = [];

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
   * Callback to handle work on the next interval.
   * Since this occurs in the next interval, we are allowed to
   * perform the max number of operations per interval
   *
   * @memberof RatelyExecutor
   */
  onWakeUp() {
    const numWorkThatCanBeChained = this.maxOperationsPerInterval - this.numOperationsActive;
    const numWorkToChain = Math.min(this.waitingQueue.length, numWorkThatCanBeChained);

    // if there are is more work to do,
    // grab more jobs from the waiting queue
    if (numWorkToChain > 0) {
      for (let i = 0; i < numWorkToChain; i++) {
        this.numOperationsActive += 1;
        const op = this.performJob(this.waitingQueue.pop()).then(() => {
          this.numOperationsActive -= 1;

          this._activeOperationsForTest.pop();
        });

        this._activeOperationsForTest.unshift(op);
      }
    }
  }

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
   * @memberof RatelyExecutor
   */
  start() {
    if (!this.executorHasStarted()) {
      this.intervalId = setInterval(this.wakeUpFn, this.rateLimitIntervalMs + this.bufferMs);
    }
  }

  /**
   *Stops exeution of new jobs (does not cancel any active ones)
   *
   * @memberof RatelyExecutor
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
