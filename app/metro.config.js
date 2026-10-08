// Metro config. Lets the app import the shared, tested proof logic from
// ../services/proof/src without copying it (alias: @kvali/proof/*).
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const proofSrc = path.resolve(projectRoot, "../services/proof/src");
// SIMULATED sample records, imported by the engine by relative path.
const proofSamples = path.resolve(projectRoot, "../services/proof/samples");

const config = getDefaultConfig(projectRoot);

// Watch the shared folder so Metro can bundle and hot-reload it.
config.watchFolders = [...(config.watchFolders ?? []), proofSrc, proofSamples];

// Resolve `@kvali/proof/<file>` to ../services/proof/src/<file>.ts.
// (tsconfig.json has the matching `paths` entry for type-checking.)
const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith("@kvali/proof/")) {
    const file = moduleName.slice("@kvali/proof/".length);
    return { type: "sourceFile", filePath: path.join(proofSrc, `${file}.ts`) };
  }
  return upstreamResolve
    ? upstreamResolve(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
