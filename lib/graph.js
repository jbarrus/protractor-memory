'use strict';

const _ = require('lodash');
const path = require('path');
const phantom = require('phantom');
const fs = require('fs');
const q = require('q');
const d3graph = require('./d3graph.js');
const htmlTemplate = _.template(fs.readFileSync(path.join(__dirname, './graph-template.html')));

/**
 * writeGraph, a function to generate an image of a graph with phantomjs.
 * @param fileName - optional name of file to write graph image to.
 * @param results
 * @param units mb, gb, etc.
 */
module.exports = function writeGraph(fileName, results, units, duration) {
  console.log('Mem Test: Generating Graph');

  const points = _.map(results, function(val, key) {
    return {name: key, values: val.measurements};
  });

  const colors = {
    jsUsed: '#7cb5ec',
    jsTotal: '#e4d354',
    chromeTotal: '#f7a35c'
  };

  var ph, page;

  return phantom.create(['--web-security=no'], {dnodeOpts: {weak: false}})
    .then(instance => ph = instance)
    .then(() => ph.createPage())
    .then(pageInstance => page = pageInstance)
    .then(() => {
      page.property('viewportSize', {width: 800, height: 750});
      // Set content of page
      return page.setContent(htmlTemplate({results, colors, duration}), '');
    })
    .then(() => {
      // Inject D3 in sandboxed page
      page.injectJs(path.join(__dirname, '../node_modules/d3/d3.js'));
      return page.evaluate(d3graph, results, points, units, colors, duration);
    })
    .then(() => {
      return page.render(fileName);
    })
    .then(() => {
      ph.exit();
      return results;
    })
    .catch(error => {
      console.log('phantomjs error', error);
      ph.exit();
      return q.reject(error);
    });
};
