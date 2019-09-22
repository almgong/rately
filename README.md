# rately
A lightweight (7kb!) package for executing arbitrary functions in a rate limit compliant fashion. Intended for both front and back end JS environments.

# Installation

You can grab the latest version from NPM:

`npm install rately`

# Usage

`rately` exports two types of executors, one that executes work serially, and another that does so concurrently.

```
import { SerialRatelyExecutor, RatelyExecutor } from 'rately';

/* this will never execute more than one job at a time */
const serialExecutor = new SerialRatelyExecutor({ ...options });

/* this can run the configured max number of jobs per interval at a time */
const concurrentExecutor = new RatelyExecutor({ ...options });
```

or in Node environments

```
const Rately = require('rately');

const serialExecutor = new Rately.SerialRatelyExecutor({ ...options });
const concurrentExecutor = new Rately.RatelyExecutor({ ...options });
```

## Enqueueing jobs

Work can be supplied to executors as objects (jobs) in the form:
```
{
  workFn: () => {},
  cbFn: () => {}
}
```
`cbFn` is an optional callback function that will be called with the result/return value of `workFn`. You can also return `Promise` objects in `workFn`:

```
{
  workFn: () => Promise.resolve('work complete!')
}
```

Then, you can add work to the queue by calling `add()`:

```
/* RatelyExecutor show here, but both types have the same interface */

const executor = new RatelyExecutor({ ...options });
executor.add({ workFn: () => {} });

/* you can enqueue multiple jobs by specifying them as additional arguments */
executor.add({ workFn: () => {} }, { workFn: () => {} }, ...);
```

Note that calling `add()` will immediately start running enqueued jobs if it is not already doing so.

## Options

You are able to customize the behavior of the executors by supplying an options object to the constructor. The available options are:

```
{
  maxOperationsPerInterval?: number,  // defaults to 10
  rateLimitIntervalMs?: number,       // defaults to 10_000
  bufferMs?: number                   // defaults to 100
}
```

- `maxOperationsPerInterval` - The maximum number of jobs to run per rate limit interval
- `rateLimitIntervalMs` - Time in milliseconds that each rate limit interval lasts
- `bufferMs` - This is a safety buffer of additional time (in milliseconds) that the executor will wait until deciding when an interval ends. Given the implementation of how executors keep track of time (via `setInterval`), it is not guaranteed that work will be executed exactly when it should. For example, with the default values, rately will consider one interval 10,000 + 100 milliseconds long, and pick up more jobs when that time has elapsed.

# License

MIT
