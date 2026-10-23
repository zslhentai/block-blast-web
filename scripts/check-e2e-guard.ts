// This command succeeds ONLY when the normal positive boot test fails for the
// expected reason after deliberately blocking the production JS bundle.
export {};
const child = Bun.spawn(['bun', 'run', 'test:e2e', '--project=desktop-chromium', '--grep',
  'production script boots, starts a real game', '--output=artifacts/guard-results'], {
  env: { ...process.env, E2E_BLOCK_SCRIPT: '1', PLAYWRIGHT_HTML_OUTPUT_DIR: 'artifacts/guard-report' }, stdout: 'pipe', stderr: 'pipe',
});
const [stdout, stderr, code] = await Promise.all([
  new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
]);
await Bun.write('artifacts/e2e-script-guard.log', stdout + stderr);
if (code !== 1 || !stdout.includes('GAME_SCRIPT_NOT_READY')) {
  console.error(stdout, stderr);
  throw new Error(`Missing-script guard did not fail for the expected boot assertion (exit ${code})`);
}
console.log('Verified: blocking production JS makes the real boot E2E fail (expected exit 1).');
