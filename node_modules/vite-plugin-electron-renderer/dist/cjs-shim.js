"use strict";
Object.defineProperties(exports, { __esModule: { value: true }, [Symbol.toStringTag]: { value: "Module" } });
function cjsShim() {
  let config;
  let isCjs;
  return {
    name: "vite-plugin-electron-renderer:cjs-shim",
    apply: "build",
    config(config2) {
      var _a, _b;
      config2.build ?? (config2.build = {});
      (_a = config2.build).cssCodeSplit ?? (_a.cssCodeSplit = false);
      (_b = config2.build).assetsDir ?? (_b.assetsDir = "");
    },
    configResolved(_config) {
      config = _config;
      const output = config.build.rollupOptions.output;
      if (output) {
        const formats = ["cjs", "commonjs"];
        if (Array.isArray(output) ? output.find((o) => formats.includes(o.format)) : formats.includes(output.format)) {
          isCjs = true;
        }
      }
    },
    transformIndexHtml(html) {
      if (!isCjs) return;
      const headRE = /(<\s*?head\s*?>)/;
      const assetsDir = config.build.assetsDir;
      if (assetsDir) {
        const requireIdShim = `<script id="shim-require-id">
; (function () {
  if (typeof require !== 'function') return;
  var Module = require('module');
  var _resolveFilename = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    // "assetsDir" is always at the same level as "index.html"
    var prefix = './';
    if (request.startsWith(prefix)) {
      try {
        // TODO: The way is more elegant.
        var newRequest = request.replace(prefix, prefix + '${assetsDir + "/"}');
        return _resolveFilename.call(this, newRequest, parent, isMain, options);
      } catch (error) { }
    }
    return _resolveFilename.call(this, request, parent, isMain, options);
  };
})();
<\/script>`;
        html = html.replace(headRE, "$1\n" + requireIdShim);
      }
      const exportsShim = `<script id="shim-exports">var exports = typeof module !== 'undefined' ? module.exports : {};<\/script>`;
      html = html.replace(headRE, "$1\n" + exportsShim);
      return html;
    }
  };
}
exports.default = cjsShim;
