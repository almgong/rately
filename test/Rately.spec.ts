import { expect } from 'chai';

import Rately from '../src/Rately';
import RatelyExecutor from '../src/executors/RatelyExecutor';
import SerialRatelyExecutor from '../src/executors/SerialRatelyExecutor';

describe('Rately', () => {
 it('should export an object with both executor classes', () => {
  expect(Rately).to.be.equal({ RatelyExecutor, SerialRatelyExecutor });
 });
});
