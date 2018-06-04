'use strict';

const q = require('q'),
  cliArgs = require('yargs').argv,
  _ = require('lodash'),
  ProgressBar = require('progress'),
  graph = require('./graph'),
  analyze = require('./analyze'),
  mkdirp = require('mkdirp'),
  path = require('path'),
  moment = require('moment'),
  chromeMemory = require('./chrome-memory'),
  ieMemory = require('./ie-memory'),
  os = require('os');

console.log('os.platform', os.platform());

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
      chromeTotal: 0.1,
      ieTotal: 0.1,
      jsTotal: 0.1,
      jsUsed: 0.1
    }
  });

  mkdirp.sync(options.dir);

  var startTime = new Date();

  return execute(iterations, fn, options)
    .then(measurements => analyze(measurements))
    .then(results => {
      var timeString = startTime.toISOString().replace(/\W/gi, '-');
      var timeDuration = moment.utc(new Date() - startTime).format('HH:mm:ss');

      let fileName = `${options.name}-${timeString}.png`;
      if (cliArgs.tag) {
        fileName = `${options.name}-${_.kebabCase(cliArgs.tag)}-${timeString}.png`
      }
      return graph(path.join(options.dir, fileName), results, options.units, timeDuration);
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

async function execute(iterations, fn, options) {
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

  console.log('starting tests');
  await recordMemory(measurements, options.units, options.initialPostGcSleep);

  //execution fn * iterations times
  for (let i = 0; iterations > i; i++) {
    await browser.driver.call(() => {
      console.log('executing');
      var res = fn();
      return (res && res.then ? res : q.when()) //if a promise is returned, wait for it to finish
        .then(() => {
          console.log('executed');
          //bar.tick();
          return recordMemory(measurements, options.units, options.postGcSleep)
             .then(() => {
               console.log('done recording memory, tick');
               return bar.tick();
             });
        });
    });
  }

  console.log('record memory after');
  await recordMemory(measurements, options);
  return measurements;
}

function recordMemory(measurements, options) {
  console.log('record memory');
  return garbageCollect()
    .then(() => console.log('garbage collected'))
    .then(() => options.waitTime ? browser.sleep(options.waitTime) : undefined)
    .then(() => getMemory(options))
    .then(memory => {
      console.log('got memory', memory);
      measurements.push(memory);
      return memory;
    });
}

function garbageCollect() {
  return q.when();

  // return browser.driver.executeScript(function() {
  //   if (window.gc) {
  //     window.gc();
  //   }
  // });
}

/**
 * Gets js heap total and used as well as chrome process memory
 */
function getMemory(options) {
  return q.all([
    getJavascriptMemory(options.units),
    getChromeMemory(options),
    getIEMemory(options.units)
  ])
    .then(results => _.extend({}, ...results));
}

function getJavascriptMemory(units) {
  return browser.driver.executeScript(function() {return window.performance.memory;})
    .then(memory => {
      if (memory) {
        return {
          jsTotal: convertUnits(memory.totalJSHeapSize, units),
          jsUsed: convertUnits(memory.usedJSHeapSize, units)
        };
      }
    });
}

function getChromeMemory(options) {
  if (os.platform() === 'win32') {
    return q.when();
  }

  return chromeMemory.getMemory(options.chromeProcessArgs)
    .then(stats => {
      if (!stats.length) {
        console.warn('No Chrome processes found');
        return;
      }
      // // Only return the first process
      return {
        chromeTotal: convertUnits(stats[0].memory, options.units)
      };
    });
}

function getIEMemory(units) {
  if (os.platform() !== 'win32') {
    return q.when();
  }

  console.log('getiememory');
  return ieMemory.getMemory()
    .then(memory => {
      console.log('getiememory res', memory);
      return {
        ieTotal: convertUnits(memory, units)
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

  switch (units) {
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