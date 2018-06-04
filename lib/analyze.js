'use strict';

const _ = require('lodash');

module.exports = function analyzeResults(allMeasurements) {
  console.log('Mem Test: Analyzing Results');
  if (_.isEmpty(allMeasurements)) {
    throw new Error('no measurements', allMeasurements);
  }

  const keys = Object.keys(allMeasurements[0]);

  //separate and analyze each measurement (is there a better high order function for this?)
  return _.reduce(keys, (res, key) => {
    res[key] = analyzeMetric(_.map(allMeasurements, key));
    return res;
  }, {});
};

function analyzeMetric(measurements) {
  //throw out the first 5 - usually there is a lot of growth there, then it levels out and is more accurate without those
  if (measurements.length > 5) {
    measurements = measurements.slice(5);
  }
  
  const res = {
    min: _.min(measurements),
    max: _.max(measurements),
    start: _.first(measurements),
    end: _.last(measurements),
    regression: linearRegression(_.range(0, measurements.length), measurements),
    measurements: measurements
  };

  res.diff = res.end - res.start;
  res.avg = _.mean(measurements);

  return res;
}


/**
 * Equations from Trent Richardson:
 * http://trentrichardson.com/2010/04/06/compute-linear-regressions-in-javascript/
 *
 * @param x {Array} - The set of x coordinates
 * @param y {Array} - The set of y coordinates
 *
 * @returns {Object} - A few calculations of memory usage and statistical trend.
 *
 */
function linearRegression(x, y) {
  const results = {};
  const lr = {};
  const n = y.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  let sumYY = 0;

  for (let i = 0; i < y.length; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumXX += x[i] * x[i];
    sumYY += y[i] * y[i];
  }

  lr.slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  lr.intercept = (sumY - lr.slope * sumX) / n;
  lr.r2 = Math.pow((n * sumXY - sumX * sumY) /
    Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY)), 2);

  return lr;
}