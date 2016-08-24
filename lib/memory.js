'use strict';

const q = require('q'),
  _ = require('lodash'),
  ProgressBar = require('progress'),
  graph = require('./graph'),
  analyze = require('./analyze'),
  plugin = require('./plugin'),
  mkdirp = require('mkdirp'),
  path = require('path'),
  exec = require('child_process').exec,
  pusage = require('pidusage');

/**
 * A set of checks to use when searching for a running Chrome process
 *
 * @typedef {{includes:boolean, text:string}[]} ValidChromeArgs
 */
let chromeArguments;

/**
 * The default ValidChromeArgs
 *
 * @type {ValidChromeARgs}
 */
const defaultChromeArguments = [
  {includes: true, text: 'test-type=protractor-memory'},
  {includes: false, text: 'extension-process'}
];

/**
 * Find all windows that are running via Protractor and calculate
 * the current memory usage for each process.  Returns an array
 * of process information (sorted with the most recently started
 * process first)
 *
 * @returns {Promise} Promise that, when resolved, gives an array of Chrome process information
 */
function getChromeProcessMemory() {
  const promise = protractor.promise.defer();
  let foundProcesses, statCallbackCount;

  exec('ps -Ao pid,etime,args', function(err, stdout, stderr) {
    if (stderr) promise.reject(stderr);

    // One process per line
    foundProcesses = stdout.split('\n').reduce((array, line) => {
      if (isValid(line)) {
        const tokens = line.split(/[ ]+/);

        // First element is the pid
        array.push({pid: tokens[0], etime: tokens[1], args: tokens[2]});
      }
      return array;
    }, []);

    // Wait for the proper amount of statistics to come back
    statCallbackCount = foundProcesses.length;

    // Sort by start time (most recent first)
    foundProcesses = foundProcesses.sort(p => p.etime).reverse();

    // Get the memory usage for each process
    foundProcesses.forEach(process => {
      // Need a closure here to keep track of processes
      getUsedMemory(process);
    });
  });

  return promise;

  // We only care about chrome processes that have the correct flags passed to them.
  function isValid(args) {
    var valid = args.includes('Google Chrome Helper');

    if (valid) {
      _.forEach(chromeArguments, arg => {
        const includes = args.includes(arg.text);
        return valid = arg.includes ? includes : !includes; // Break out if valid is false
      });
    }

    return valid;
  }

  // For a given process, calculate the used memory
  function getUsedMemory(process) {
    pusage.stat(process.pid, (e, stat) => {
      if (e) promise.reject(e);
      process.memory = stat.memory;

      // Resolve the promise if this is the last one.
      if (!--statCallbackCount) promise.fulfill(foundProcesses);
    });
  }
};

function runScenario(iterations, fn, options) {
  options = options || {};
  _.defaults(options, {
    initialPostGcSleep: 500,
    finalPostGcSleep: 500,
    postGcSleep: 0,
    progressBar: true,
    dir: 'results',
    name: 'memory-test',
    chromeProcessArgs: defaultChromeArguments,
    units: 'MB'
  });

  chromeArguments = options.chromeProcessArgs;

  var time = new Date().toISOString().replace(/\W/gi, '-');
  mkdirp.sync(options.dir);

  return execute(iterations, fn, options)
    .then(measurements => analyze(measurements))
    .then(results => graph(path.join(options.dir, `${options.name}-${time}.png`), results, options.units));
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

  return recordMemory(measurements, options.units, options.finalPostGcSleep)
    .then(() => measurements);
}

function recordMemory(measurements, units, waitTime) {
  return garbageCollect()
    .then(() => waitTime ? browser.sleep(waitTime) : undefined)
    .then(() => getMemory(units))
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
function getMemory(units) {
  return q.all([getJavascriptMemory(units), getChromeMemory(units)])
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

function getChromeMemory(units) {
  return getChromeProcessMemory().then(stats => {
    if (!stats.length) {
      console.log('\nWARNING: No Chrome process found with the following arguments:')
      console.log(chromeArguments);
      return;
    }
    if (stats.length > 1) {
      console.log('\nWARNING: More than one Chrome process was found with the following arguments:')
      console.log(chromeArguments);
      console.log(stats);
    }

    // Only return the first process
    return {
      chromeTotal: convertUnits(stats[0].memory, units)
    };
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