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

// Optional peer dependencies of @privy-io/react-auth (smart wallets, Abstract, Farcaster, Solana embedded wallets).
// Kvali uses Privy only for the email code, so they are not installed; Privy's lazy chunks still import them,
// so they resolve to an empty module instead of failing the bundle.
const privyOptional = /^(permissionless|@abstract-foundation\/agw-client|@farcaster\/mini-app-solana|@solana\/kit|@solana-program\/(memo|system|token))(\/.*)?$/;

// Resolve `@kvali/proof/<file>` to ../services/proof/src/<file>.ts.
// (tsconfig.json has the matching `paths` entry for type-checking.)
const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith("@kvali/proof/")) {
    const file = moduleName.slice("@kvali/proof/".length);
    return { type: "sourceFile", filePath: path.join(proofSrc, `${file}.ts`) };
  }
  if (privyOptional.test(moduleName)) return { type: "empty" };
  // Built without a Privy app ID (no email code): leave the Privy SDK out of the bundle entirely.
  if (moduleName === "@privy-io/react-auth" && !process.env.EXPO_PUBLIC_PRIVY_APP_ID) return { type: "empty" };
  return upstreamResolve
    ? upstreamResolve(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
