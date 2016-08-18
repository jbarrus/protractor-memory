'use strict';

let pid = null;

exports.getChromePID = () => pid;
exports.setup = () => {
  const context = this;
  pid = Math.random();

  // console.log('find pid, context=', context);
  console.log('test pid set to', pid);
};
