// Mock vscode module for testing
module.exports = {
  workspace: {
    getConfiguration: () => ({
      get: (_key, defaultVal) => defaultVal,
    }),
  },
  OutputChannel: class {
    appendLine() {}
    show() {}
    dispose() {}
  },
  window: {
    createOutputChannel: () => new (class {
      appendLine() {}
      show() {}
      dispose() {}
    })(),
  },
  extensions: {
    getExtension: () => undefined,
  },
};
