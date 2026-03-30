export function logToStderr(message: string): void {
  process.stderr.write(message + "\n");
}
