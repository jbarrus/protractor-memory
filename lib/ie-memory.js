'use strict';

const tasklist = require('tasklist');
const _ = require('lodash');

module.exports.getMemory = () => {
  return tasklist({filter: ['Imagename eq iexplore.exe']})
    .then(tasks => _(tasks).map('memUsage').max());
};
