import { startServer } from "@firecode/server";

export interface StartOptions {
  headless?: boolean;
  port?: number;
}

export async function startCommand(options: StartOptions): Promise<void> {
  await startServer({
    headless: options.headless ?? false,
    port: options.port,
  });
}
