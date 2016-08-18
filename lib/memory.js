'use strict';

const q = require('q');
const _ = require('lodash');
const ProgressBar = require('progress');
const graph = require('./graph');
const analyze = require('./analyze');
const plugin = require('./plugin');
const mkdirp = require('mkdirp');
const path = require('path');

function runScenario(iterations, fn, options) {
  options = options || {};
  _.defaults(options, {
    initialPostGcSleep: 500,
    finalPostGcSleep: 500,
    postGcSleep: 0,
    progressBar: true,
    dir: 'results',
    name: 'memory-test',
    units: 'MB'
  });

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
  return q.when({
    // chromeUsed: convertUnits(_.random(1024*1024*10, 1024*1024*1000), units),
    // chromeTotal: convertUnits(_.random(1024*1024*10, 1024*1024*1000), units)
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