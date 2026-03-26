export interface StartOptions {
  headless?: boolean;
  port?: number;
}

export async function startCommand(options: StartOptions): Promise<void> {
  const { startServer } = await import("@firecode/server");
  await startServer({
    headless: options.headless ?? false,
    port: options.port,
  });
}
