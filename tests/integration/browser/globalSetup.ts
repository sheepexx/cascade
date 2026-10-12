import { BACKEND_PORT } from "./support";
import { startBackend } from "./backend";

export default async function globalSetup() {
  const backend = await startBackend(BACKEND_PORT);
  return () => backend.close();
}
