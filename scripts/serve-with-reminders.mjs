import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import nextEnv from '@next/env';
import { startReminderScheduler } from './reminder-scheduler.mjs';

const [mode, ...args] = process.argv.slice(2);
if (!['dev', 'start'].includes(mode)) throw new Error('Expected dev or start.');
process.env.NODE_ENV ??= mode === 'dev' ? 'development' : 'production';
nextEnv.loadEnvConfig(process.cwd(), mode === 'dev');
let rawPort = process.env.PORT ?? '3000';
for (let index = 0; index < args.length; index++) {
  if (args[index] === '--port' || args[index] === '-p') rawPort = args[++index];
  else if (args[index].startsWith('--port=')) rawPort = args[index].slice('--port='.length);
}
if (!/^\d{1,5}$/.test(rawPort ?? '') || Number(rawPort) < 1 || Number(rawPort) > 65535) throw new Error('Invalid application port.');
const secret = process.env.BILL_REMINDERS_SECRET || randomBytes(32).toString('base64url');
if (secret.length < 32) throw new Error('BILL_REMINDERS_SECRET must contain at least 32 characters.');
const require = createRequire(import.meta.url);
const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), mode, ...args, '--port', String(Number(rawPort))], {
  stdio: 'inherit', env: { ...process.env, BILL_REMINDERS_SECRET: secret },
});
const stop = process.env.BILL_REMINDERS_AUTOMATIC === '0' ? () => {} : startReminderScheduler({
  url: `http://127.0.0.1:${Number(rawPort)}/api/jobs/bill-reminders`, secret,
});
if (process.env.BILL_REMINDERS_AUTOMATIC !== '0') console.info('[reminders] Automatic in-app reminders enabled; checking every 5 minutes.');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stop(); child.kill(signal); });
child.on('error', () => { stop(); console.error('Unable to start the application server.'); process.exitCode = 1; });
child.on('exit', (code, signal) => { stop(); process.exitCode = code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1); });
