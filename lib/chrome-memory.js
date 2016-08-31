'use strict';

const Promise = require('bluebird'),
  _ = require('lodash');
const exec = Promise.promisify(require('child_process').exec);
const stat = Promise.promisify(require('pidusage').stat);

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
module.exports.getMemory = function getChromeProcessMemory(expectedArgs) {
  if (!expectedArgs) expectedArgs = module.exports.defaultChromeArguments;

  return exec('ps -Ao pid,etime,args')
    .then(function(stdout, stderr) {
      return Promise.all(
        stdout
          .split('\n') // One process per line
          .filter(isRelevantProcess)
          .map(line => {
            // Split by columns (whitespace) and filter out empty results
            const tokens = line.split(/[ ]+/).filter(Boolean);

            // First element is the pid
            return {pid: tokens[0], etime: tokens[1], args: tokens[2]};
          })
          .sort(p => p.etime) // Sort by start time (most recent first)
          .reverse()
          .map(getUsedMemory)
      );
  });
};

// We only care about chrome processes that have the correct flags passed to them.
function isRelevantProcess(args, expectedArgs) {
  var valid = args.includes('Google Chrome Helper') || args.includes('/chrome');

  if (valid) {
    _.forEach(expectedArgs, arg => {
      const includes = args.includes(arg.text);
      return valid = arg.includes ? includes : !includes; // Break out if valid is false
    });
  }

  return valid;
}

// For a given process, calculate the used memory
function getUsedMemory(process) {
  return stat(process.pid)
    .then(stat => {
      process.memory = stat.memory;
      return process;
    });
}