/**
 * Shared script utilities: env validation, error handling.
 */

/**
 * Validate required environment variables.
 * Exits the process with a clear error if any are missing.
 */
export function requireEnv(...vars: string[]): void {
  const missing = vars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    console.error(`\n❌ Missing required environment variables:\n`);
    for (const v of missing) {
      console.error(`   ${v} is not set`);
    }
    console.error(`\nUsage: ${missing.map(v => `${v}="..."`).join(" ")} npx tsx scripts/<script>.ts\n`);
    process.exit(1);
  }
}
