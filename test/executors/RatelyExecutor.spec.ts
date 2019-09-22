import { expect } from 'chai';
import * as sinon from 'sinon';

import RatelyExecutor from '../../src/executors/RatelyExecutor';
import { generateJob, generatePromiseJob } from '../helpers/jobGenerators';

describe('RatelyExecutor', () => {
  let sandboxInstance : sinon.SinonSandbox;
  let clock : sinon.SinonFakeTimers;

  beforeEach(() => {
    sandboxInstance = sinon.createSandbox();
    clock = sinon.useFakeTimers();
  });

  afterEach(() => {
    sandboxInstance.restore();
    clock.restore();
  });

  describe('#new', () => {
    it('should set correct defaults', () => {
      const executor = new RatelyExecutor();

      expect(executor.maxOperationsPerInterval).to.be.equal(10);
      expect(executor.rateLimitIntervalMs).to.be.equal(10000);
      expect(executor.bufferMs).to.be.equal(200);
    });

    it('should respect options', () => {
      const options = {
        maxOperationsPerInterval: 456,
        rateLimitIntervalMs: 123,
        bufferMs: 789,
        executeSerially: true
      };
      const executor = new RatelyExecutor(options);

      expect(executor.maxOperationsPerInterval).to.be.equal(456);
      expect(executor.rateLimitIntervalMs).to.be.equal(123);
      expect(executor.bufferMs).to.be.equal(789);
    });
  });

  describe('#start', () => {
    it('should invoke setInterval and store the interval id if there is not already one', () => {
      const executor = new RatelyExecutor();
      const dummyTimeout = 1 as unknown as NodeJS.Timeout;

      const setIntervalStub = sandboxInstance.stub(global, 'setInterval').withArgs(
        executor.wakeUpFn,
        executor.rateLimitIntervalMs + executor.bufferMs
      ).returns(dummyTimeout);

      executor.start();

      expect(executor.intervalId).to.be.equal(dummyTimeout);

      setIntervalStub
    });

    it('should not invoke setInterval and store the interval id if there is already one', () => {
      const executor = new RatelyExecutor();
      executor.intervalId = 12345;

      const setIntervalSpy = sandboxInstance.spy(global, 'setInterval');

      executor.start();

      expect(setIntervalSpy.called).to.be.false;
      expect(executor.intervalId).to.be.equal(12345);
    });
  });

  describe('#stop', () => {
    it('should clearInterval if there is a stored intervalId', () => {
      const executor = new RatelyExecutor();
      executor.intervalId = 1;

      const clearIntervalSpy = sandboxInstance.spy(global, 'clearInterval');

      executor.stop();

      expect(clearIntervalSpy.called).to.be.true;
      expect(executor.intervalId).to.be.null;
    });

    it('should not clearInterval if there is not a stored intervalId', () => {
      const executor = new RatelyExecutor();
      executor.intervalId = null;

      const clearIntervalSpy = sandboxInstance.spy(global, 'clearInterval');

      executor.stop();

      expect(clearIntervalSpy.called).to.be.false;
      expect(executor.intervalId).to.be.null;
    });
  });

  describe('#executorHasStarted', () => {
    it('should return true if there is an intervalId', () => {
      const executor = new RatelyExecutor();
      executor.intervalId = 1;

      expect(executor.executorHasStarted()).to.be.true;
    });

    it('should return false if there is an intervalId', () => {
      const executor = new RatelyExecutor();
      executor.intervalId = null;

      expect(executor.executorHasStarted()).to.be.false;
    });
  });

  describe('#add', () => {
    it('should prepend the specified job to the waiting queue', () => {
      const executor = new RatelyExecutor();
      const work = { workFn: () => {} };

      // set a fake interval id to prevent the jobs from being immediately consumed
      executor.intervalId = 1;
      executor.add(work);

      expect(executor.waitingQueue).to.be.eql([work]);
    });

    it('should prepend the specified jobs to the waiting queue if more specified', () => {
      const executor = new RatelyExecutor();
      const work1 = { workFn: () => {} };
      const work2 = { workFn: () => {} };

      // set a fake interval id to prevent the jobs from being immediately consumed
      executor.intervalId = 1;
      executor.add(work1, work2);

      expect(executor.waitingQueue).to.be.eql([work2, work1]);
    });

    it('should not invoke wakeUpFn() or start() if executor has already started', () => {
      const executor = new RatelyExecutor();
      const wakeUpSpy = sandboxInstance.spy(executor, 'wakeUpFn');
      const startSpy = sandboxInstance.spy(executor, 'start');
      const work = { workFn: () => {} };

      executor.intervalId = 1;
      executor.add(work);

      expect(wakeUpSpy.called).to.be.false;
      expect(startSpy.called).to.be.false;
    });

    it('should invoke wakeUpFn() and start() if executor has not started', () => {
      const executor = new RatelyExecutor();
      const wakeUpSpy = sandboxInstance.spy(executor, 'wakeUpFn');
      const startSpy = sandboxInstance.spy(executor, 'start');
      const work = { workFn: () => {} };

      executor.intervalId = null;
      executor.add(work);

      expect(wakeUpSpy.called).to.be.true;
      expect(startSpy.called).to.be.true;
    });
  });

  describe('#onWakeUp', () => {
    it('should correctly execute work over time', async () => {
      const promiseCallbackSpy = sandboxInstance.spy();
      const functionCallbackSpy = sandboxInstance.spy();

      const functionsExecuted = [];
      const work = [
        generatePromiseJob({
          workFn: () => {
            functionsExecuted.push('p-1');
            return Promise.resolve('promise 1 done!');
          },
          cbFn: promiseCallbackSpy
        }),
        generatePromiseJob({
          workFn: () => {
            functionsExecuted.push('p-2')
            return Promise.resolve('promise 2 done!');
          },
          cbFn: null
        }),
        generateJob({
          workFn: () => {
            functionsExecuted.push('f-1');
            return 'function 1 done!';
          }
        }),
        generatePromiseJob({
          workFn: () => {
            functionsExecuted.push('p-3');
            return Promise.resolve('promise 3 done!');
          }
        }),
        generateJob({
          workFn: () => {
            functionsExecuted.push('f-2');
            return 'function 2 done!';
          },
          cbFn: functionCallbackSpy
        })
      ];

      const executor = new RatelyExecutor({ maxOperationsPerInterval: 2, rateLimitIntervalMs: 3000, bufferMs: 100 });
      executor.add(...work);

      // wait for initial promises to complete
      await Promise.all(executor._activeOperationsForTest);

      // immediately executes the first 2 since this executor has not yet started
      expect(functionsExecuted).to.be.eql(['p-1', 'p-2']);
      expect(promiseCallbackSpy.calledWith('promise 1 done!')).to.be.true;

      // almost tick 3000 + 100 - 1, nothing more has executed yet
      clock.tick(3099);
      expect(functionsExecuted).to.be.eql(['p-1', 'p-2']);

      // // tick 1ms, the next 2 jobs should execute now
      clock.tick(1);
      expect(functionsExecuted).to.be.eql(['p-1', 'p-2', 'f-1', 'p-3']);

      // wait for the second set of promise(s) to complete
      await Promise.all(executor._activeOperationsForTest);

      // almost tick again
      clock.tick(3099);
      expect(functionsExecuted).to.be.eql(['p-1', 'p-2', 'f-1', 'p-3']);
      expect(functionCallbackSpy.called).to.be.false;

      // final tick
      clock.tick(1);
      expect(functionsExecuted).to.be.eql(['p-1', 'p-2', 'f-1', 'p-3', 'f-2']);
      expect(functionCallbackSpy.calledWith('function 2 done!')).to.be.true;
    });

    it('should handle jobs that carry over to next wakeUp', async () => {
      const functionsExecuted = [];
      const work = [
        generatePromiseJob({
          workFn: () => {
            functionsExecuted.push('p-1');
            return Promise.resolve('promise 1 done!');
          }
        }),
        generatePromiseJob({
          workFn: () => {
            return new Promise((res, _rej) => {
              setTimeout(() => {
                functionsExecuted.push('p-2');
                res('promise 2 done!');
              }, 4000);
            });
          }
        }),
        generateJob({
          workFn: () => {
            functionsExecuted.push('f-1');
            return 'function 1 done!';
          }
        }),
        generateJob({
          workFn: () => {
            functionsExecuted.push('f-2');
            return 'function 2 done!';
          }
        })
      ];

      const executor = new RatelyExecutor({ maxOperationsPerInterval: 2, rateLimitIntervalMs: 3000, bufferMs: 100 });
      executor.add(...work);

      // wait for first promise to complete
      await executor._activeOperationsForTest[1];

      // immediately executes the first 2 since this executor has not yet started
      // though since the second promise will carry over, only the first value will appear
      expect(functionsExecuted).to.be.eql(['p-1']);

      // almost tick 3000 + 100 - 1, nothing more has executed yet
      clock.tick(3099);
      expect(functionsExecuted).to.be.eql(['p-1']);
      expect(executor._activeOperationsForTest.length).to.be.equal(1);

      // tick 1ms, the next job in line should execute now
      // we add only one more job since there is still one ongoing
      clock.tick(1);
      expect(executor._activeOperationsForTest.length).to.be.equal(2);

      // t = 4000
      clock.tick(900);

      await executor._activeOperationsForTest[1];

      expect(functionsExecuted).to.be.eql(['p-1', 'f-1', 'p-2']);
      expect(executor._activeOperationsForTest.length).to.be.equal(0);

      // almost tick again, t = 6199
      clock.tick(2199);
      expect(functionsExecuted).to.be.eql(['p-1', 'f-1', 'p-2']);
      expect(executor._activeOperationsForTest.length).to.be.equal(0);

      // final tick, t = 6200
      clock.tick(1);
      expect(functionsExecuted).to.be.eql(['p-1', 'f-1', 'p-2', 'f-2']);
    });
  });
});
