// Entry point for the Munkel→Matrix gateway. Run on Node 24 (rust-crypto WASM):
//   source infra/matrix/dev.env
//   PORT=8787 node apps/matrix-gateway/src/index.ts
// Then point the app/CLI at it: MUNKEL_RELAY_URL=ws://localhost:8787
import { startGateway } from "./gateway.ts";

const port = Number(process.env.PORT ?? 8787);
const matrixBaseUrl = process.env.MATRIX_BASE_URL ?? "http://localhost:8008";
const serverName = process.env.MATRIX_SERVER_NAME ?? "munkel.localhost";
const sharedSecret = process.env.MATRIX_REGISTRATION_SHARED_SECRET ?? "munkel-dev-shared-secret-change-me";
const pwPepper = process.env.MATRIX_PW_PEPPER ?? "munkel-dev-pw-pepper-change-me";

const gateway = await startGateway({ port, matrixBaseUrl, serverName, sharedSecret, pwPepper });
// eslint-disable-next-line no-console
console.log(`munkel matrix-gateway on ws://localhost:${gateway.port}  ->  ${matrixBaseUrl} (${serverName})`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void gateway.close().then(() => process.exit(0));
  });
}
