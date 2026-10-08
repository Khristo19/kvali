// web3.js and Anchor expect Node's Buffer (and process.env) as globals. Import this FIRST in any module that imports them.
import { Buffer } from "buffer";

const g = globalThis as unknown as { Buffer?: typeof Buffer; process?: { env?: Record<string, string | undefined> } };
if (!g.Buffer) g.Buffer = Buffer;
if (!g.process) g.process = { env: {} };
