import RatelyJob from '../../src/interfaces/RatelyJob';

export function generateJob({ workFn = () => '1', cbFn = () => {} }) : RatelyJob {
  return {
    workFn,
    cbFn
  };
}

export function generatePromiseJob({ workFn = () => Promise.resolve('value'), cbFn = () => {} }) : RatelyJob {
  return {
    workFn,
    cbFn
  };
}
