import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('..', import.meta.url));
// sqlx::test creates isolated databases; this URL must point to a local test server.
const env = { ...process.env, DATABASE_URL: process.env.DATABASE_URL || 'postgres://lumi:lumi-local@127.0.0.1:5432/lumi' };
for (const [command, args] of [
  ['node', ['--test', 'poc/frontend.test.mjs']],
  ['npm', ['run', 'build', '-w', 'frontend']],
  ['cargo', ['test', '--manifest-path', 'backend/Cargo.toml', '--test', 'about']],
  ['cargo', ['test', '--manifest-path', 'backend/Cargo.toml', '--test', 'workspace', 'poc_stack_persists_two_weather_widgets']],
]) {
  console.log(`POC : ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('POC validé : frontend compilé, contrat public, validation et persistance PostgreSQL.');
