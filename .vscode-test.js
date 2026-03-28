const path = require('path');

module.exports = {
  tests: [
    {
      label: 'e2e',
      workspaceFolder: path.resolve(__dirname, 'tests/e2e/workspace'),
      files: path.resolve(__dirname, 'tests/e2e/suite.js'),
      env: {
        CODECLAW_ALLOW_LOCALHOST: '1',
      },
      mocha: {
        ui: 'bdd',
        timeout: 60000,
      },
    },
  ],
};
