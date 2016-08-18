'use strict';

var d3 = require('d3');

/**
 * d3graph, a function to generate a line graph of for an array of objects.
 * @param results -
 * @param points - array of objects containing the line name and the corresponding array of values: eg. [{name: 'Example', values: [1,2,3]}]
 * @param units - mb, gb, etc
 * @param colors - object mapping data names to colors e.g. {jsUsed: #7cb5ec}
 */
module.exports = function(results, points, units, colors) {
  var graphWidth = 800;
  var graphHeight = 600;

  var margin = {top: 20, right: 110, bottom: 30, left: 80},
    width = graphWidth - margin.left - margin.right,
    height = graphHeight - margin.top - margin.bottom;

  var x = d3.scale.linear()
    .range([0, width]);

  var y = d3.scale.linear()
    .range([height, 0]);

  var xAxis = d3.svg.axis()
    .scale(x)
    .tickFormat(d3.format('d'))
    .orient('bottom');

  var yAxis = d3.svg.axis()
    .scale(y)
    .orient('left');

  var yAxisGrid = function() {
    return d3.svg.axis()
      .scale(y)
      .orient('left');
  };

  var line = d3.svg.line()
    .interpolate('linear')
    .x(function(d, i) {
      return x(i + 1);
    })
    .y(function(d) {
      return y(d);
    });

  var svg = d3.select('body').insert('svg', ':first-child')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

  var iterations = results.jsUsed.measurements.length;

  x.domain([1, d3.max(points, function(c) {
    return d3.max(c.values, function(v, i) {
      return i + 1;
    });
  })]);

  y.domain([
    d3.min(points, function(c) {
      return d3.min(c.values, function(v) {
        return v;
      });
    }) * .9,
    d3.max(points, function(c) {
      return d3.max(c.values, function(v) {
        return v;
      });
    }) * 1.1
  ]);

  svg.append('g')
    .attr('class', 'x axis')
    .attr('transform', 'translate(0,' + height + ')')
    .call(xAxis)
    .append('text')
    .attr('y', -10)
    .attr('x', width)
    .attr('dy', '.71em')
    .style('text-anchor', 'end')
    .text('Iterations');

  svg.append('g')
    .attr('class', 'y axis')
    .call(yAxis)
    .append('text')
    .attr('transform', 'rotate(-90)')
    .attr('y', 6)
    .attr('dy', '.71em')
    .style('text-anchor', 'end')
    .text('Memory ' + units.toUpperCase());

  svg.append('g')
    .attr('class', 'grid')
    .call(yAxisGrid()
      .tickSize(-width, 0, 0)
      .tickFormat('')
    );


  var memory = svg.selectAll('.memory')
    .data(points)
    .enter().append('g')
    .attr('class', 'memory');

  memory.append('path')
    .attr('class', function(d) {
      return 'line ' + d.name;
    })
    .attr('d', function(d) {
      return line(d.values);
    });

  addRegression('jsUsed', results.jsUsed);
  addRegression('jsTotal', results.jsTotal);

  memory.append('rect')
    .datum(function(d) {
      return {name: d.name, value: d.values[d.values.length - 1]};
    })
    .attr('class', function(d) {
      return 'line ' + d.name;
    })
    .attr('transform', function(d, i) {
      return 'translate(' + (width + 2) + ',' + (5 + (height / 2) + (15 * i)) + ')';
    })
    .attr('width', 10)
    .attr('height', 2);

  memory.append('text')
    .datum(function(d) {
      return {name: d.name, value: d.values[d.values.length - 1]};
    })
    .attr('transform', function(d, i) {
      return 'translate(' + (width + 15) + ',' + ((height / 2) + (15 * i)) + ')';
    })
    .attr('x', 3)
    .attr('dy', '.71em')
    .attr('lengthAdjust', 'spacing')
    .text(function(d) {
      return d.name;
    })
    .style('font-size', '12px');

  // Graph and body styling
  d3.select('body')
    .style('background-color', 'white')
    .style('font', '10px sans-serif');

  d3.selectAll('.axis path')
    .style('fill', 'none')
    .style('stroke', '#000')
    .style('shape-rendering', 'crispEdges');

  d3.selectAll('.axis line')
    .style('fill', 'none')
    .style('stroke', '#000')
    .style('shape-rendering', 'crispEdges');

  d3.selectAll('.grid .tick')
    .style('stroke', 'lightgrey')
    .style('stroke-opacity', '0.7')
    .style('shape-rendering', 'crispEdges');

  d3.selectAll('.line')
    .style('fill', 'none')
    .style('stroke', function(d) {
      return colors[d.name];
    })
    .style('stroke-width', '1.5px');


  function addRegression(name, data) {
    var iterations = data.measurements.length;
    var lr = data.regression;

    memory.append('line')
      .attr('class', 'regression ' + name)
      .attr('x1', x(1))
      .attr('y1', y(lr.intercept))
      .attr('x2', x(iterations))
      .attr('y2', y((iterations * lr.slope) + lr.intercept))
      .style('stroke', colors[name])
      .style('stroke-dasharray', ('3, 3'));
  }
};
