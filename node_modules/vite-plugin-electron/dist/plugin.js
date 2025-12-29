"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const node_module = require("node:module");
const bareImportRE = /^(?![a-zA-Z]:)[\w@](?!.*:\/\/)/;
function notBundle(options = {}) {
  let resolve;
  const ids = /* @__PURE__ */ new Map();
  return {
    name: "vite-plugin-electron:not-bundle",
    // Run before the builtin plugin 'vite:resolve'
    enforce: "pre",
    configResolved(config) {
      resolve = config.createResolver({ asSrc: false });
    },
    async resolveId(source, importer) {
      var _a;
      if (!importer)
        return;
      const external = {
        external: true,
        id: source
      };
      if (ids.get(source)) {
        return external;
      }
      if (bareImportRE.test(source)) {
        const isAlias = await resolve(source, importer, true);
        if (isAlias)
          return;
        const id = await resolve(source, importer);
        if (!id)
          return;
        if (!id.includes("/node_modules/"))
          return;
        if (((_a = options.filter) == null ? void 0 : _a.call(options, id)) === false)
          return;
        try {
          node_module.createRequire(importer)(source);
        } catch {
          return;
        }
        ids.set(source, id);
        return external;
      }
    }
  };
}
exports.bareImportRE = bareImportRE;
exports.notBundle = notBundle;
