import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const desktop = process.env.MODUS_DESKTOP === "1";

export default {
  ...(desktop && {
    output: "standalone",
    outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
    images: { unoptimized: true },
    eslint: { ignoreDuringBuilds: true },
  }),
  logging: {
    incomingRequests: { ignore: [/^\/auth\/callback(?:\/|\?|$)/] },
  },
};
