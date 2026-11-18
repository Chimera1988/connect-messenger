const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Keep our modules real; replace only external services at their boundary.
module.exports = function loader(externals = {}, globals = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const requireModule = name => {
      if (Object.hasOwn(externals, name)) return externals[name];
      if (name.startsWith('.')) {
        const base = path.resolve(path.dirname(file), name);
        return load([base, base + '.ts', base + '.tsx', base + '.cjs'].find(f => fs.existsSync(f) && fs.statSync(f).isFile()));
      }
      return require(name);
    };
    vm.runInNewContext(code, { module, exports: module.exports, require: requireModule,
      process, console, Buffer, URL, Request, Response, Headers, AbortController, AbortSignal,
      setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, fetch, crypto, ...globals }, { filename: file });
    return module.exports;
  }
  return load;
};
