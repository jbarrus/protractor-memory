'use strict';

const q = require('q'),
  _ = require('lodash'),
  ProgressBar = require('progress'),
  graph = require('./graph'),
  analyze = require('./analyze'),
  mkdirp = require('mkdirp'),
  path = require('path'),
  moment = require('moment'),
  chromeMemory = require('./chrome-memory');

function runScenario(iterations, fn, options, callback) {
  options = options || {};
  _.defaults(options, {
    initialPostGcSleep: 500,
    finalPostGcSleep: 500,
    postGcSleep: 0,
    progressBar: true,
    dir: 'results/e2e/memory',
    name: 'memory-test',
    chromeProcessArgs: chromeMemory.defaultChromeArguments,
    units: 'MB',
    //fails test if linear regression slope is over the given values
    checkSlope: true,
    maxSlope: {
      chromeTotal: 0.01,
      jsTotal: 0.01,
      jsUsed: 0.01
    }
  });

  mkdirp.sync(options.dir);

  var startTime = new Date();

  return execute(iterations, fn, options)
    .then(measurements => analyze(measurements))
    .then(results => {
      var timeString = startTime.toISOString().replace(/\W/gi, '-');
      var timeDuration = moment.utc(new Date() - startTime).format('HH:mm:ss');

      return graph(path.join(options.dir, `${options.name}-${timeString}.png`), results, options.units, timeDuration);
    })
    .then(results => {
      if (options.checkSlope) {
        checkSlope(results, options.maxSlope);
      }
      if (callback) {
        callback(results);
      }
    });

}

function execute(iterations, fn, options) {
  const measurements = [];
  let bar;

  if (options.progressBar) {
    bar = new ProgressBar('Mem Test: Executing Tests [:bar] :percent :etas', {
      complete: '=',
      incomplete: ' ',
      width: 40,
      total: iterations
    });
  }

  recordMemory(measurements, options.units, options.initialPostGcSleep);

  //execution fn * iterations times
  for (let i = 0; iterations > i; i++) {
    browser.driver.call(() => {
      var res = fn();
      (res && res.then ? res : q.when()) //if a promise is returned, wait for it to finish
        .then(() => {
          recordMemory(measurements, options.units, options.postGcSleep)
            .then(() => bar.tick());
        });
    });
  }

  return recordMemory(measurements, options)
    .then(() => measurements);
}

function recordMemory(measurements, options) {
  return garbageCollect()
    .then(() => options.waitTime ? browser.sleep(options.waitTime) : undefined)
    .then(() => getMemory(options))
    .then(memory => {
      measurements.push(memory);
      return memory;
    });
}

function garbageCollect() {
  return browser.driver.executeScript(() => window.gc());
}

/**
 * Gets js heap total and used as well as chrome process memory
 */
function getMemory(options) {
  return q.all([getJavascriptMemory(options.units), getChromeMemory(options)])
    .then(results => {
      return _.extend({}, results[0], results[1]);
    });
}

function getJavascriptMemory(units) {
  return browser.driver.executeScript(() => window.performance.memory)
    .then(memory => {
      return {
        jsTotal: convertUnits(memory.totalJSHeapSize, units),
        jsUsed: convertUnits(memory.usedJSHeapSize, units)
      };
    });
}

function getChromeMemory(options) {
  return chromeMemory.getMemory(options.chromeProcessArgs)
    .then(stats => {
      if (!stats.length) {
        console.warn('No Chrome processes found');
        return;
      }

      // if (stats.length > 1) {
      //   console.debug('More than one Chrome process was found:', stats);
      // }

      // Only return the first process
      return {
        chromeTotal: convertUnits(stats[0].memory, options.units)
      };
    });
}

function checkSlope(results, maxSlope) {
  _.forEach(results, (val, key) => {
    expect(val.regression.slope).toBeLessThan(maxSlope[key]);
  });
}

function convertUnits(value, units) {
  units = units || 'MB';
  units = units.toUpperCase();
  let conv = 1;

  switch(units) {
    case 'GB':
      conv *= 1024;
    case 'MB':
      conv *= 1024;
    case 'KB':
      conv *= 1024;
  }

  return value / conv;
}

module.exports = {
  runScenario,
  garbageCollect,
  getMemory
};