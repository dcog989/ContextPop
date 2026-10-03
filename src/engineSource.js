// Per-source engine strategy: the single place that knows what differs between a template
// engine and a browser-provided one. The table is completed by whichever context owns each
// behavior - the background attaches open/iconSource, the options page attaches
// validate/applyTemplateField - so call sites dispatch through engineStrategy() instead of
// branching on engine.source. var/function (not const): shared bare-name globals, like the
// sibling util/storage modules.

/** @type {Record<string, EngineSourceStrategy>} */
var ENGINE_SOURCE_STRATEGIES = {
  [ENGINE_SOURCE.template]: {
    normalize: (engine) => ({ template: String(engine?.template ?? ''), browserEngineName: '' }),
    isUsable: () => true,
    validate: () => null,
    applyTemplateField: () => {},
    iconSource: () => null,
    open: async () => {
      throw new Error('Opening a template engine is only supported in the background');
    },
  },
  [ENGINE_SOURCE.browser]: {
    normalize: (engine) => ({
      template: String(engine?.template ?? ''),
      browserEngineName: String(engine?.browserEngineName ?? ''),
    }),
    isUsable: () => supportsBrowserEngineSearch(),
    validate: () => null,
    applyTemplateField: () => {},
    iconSource: () => null,
    open: async () => {
      throw new Error('Opening a browser engine is only supported in the background');
    },
  },
};

/**
 * @param {string} source
 * @returns {EngineSourceStrategy}
 */
function engineSourceStrategy(source) {
  return ENGINE_SOURCE_STRATEGIES[source] ?? ENGINE_SOURCE_STRATEGIES[ENGINE_SOURCE.template];
}

/**
 * @param {Engine} engine
 * @returns {EngineSourceStrategy}
 */
function engineStrategy(engine) {
  return engineSourceStrategy(engine.source);
}

/**
 * Attaches context-owned behavior to a source's strategy.
 * @param {string} source
 * @param {Partial<EngineSourceStrategy>} methods
 */
function extendEngineSource(source, methods) {
  Object.assign(engineSourceStrategy(source), methods);
}
