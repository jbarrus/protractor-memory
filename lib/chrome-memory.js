'use strict';

const exec = require('child_process').exec,
  _ = require('lodash'),
  pusage = require('pidusage');

/**
 * A set of checks to use when searching for a running Chrome process
 *
 * @typedef {{includes:boolean, text:string}[]} ValidChromeArgs
 */
module.exports.defaultChromeArguments = [
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
module.exports.getMemory = function getChromeProcessMemory(validArgs) {
  const promise = protractor.promise.defer();
  let foundProcesses, statCallbackCount;
  if (!validArgs) validArgs = module.exports.defaultChromeArguments;

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
      _.forEach(validArgs, arg => {
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