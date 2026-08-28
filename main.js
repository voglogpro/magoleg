'use strict';

const { startBot } = require('./index');

startBot().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
