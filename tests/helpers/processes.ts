import { fork } from 'node:child_process';
import { once } from 'node:events';

export async function startProcess(file: string, env: Record<string, string>) {
  const child = fork(file, [], { silent: true, env: {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env
  } });
  child.stdout?.resume();
  child.stderr?.resume();
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Process readiness timeout')); }, 10000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Process exited before readiness: ${code}`)); });
    child.once('message', message => {
      clearTimeout(timer);
      resolve((message as { port: number }).port);
    });
  });
  return {
    port, url: `http://127.0.0.1:${port}`,
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, 'exit'); child.kill(); await exited;
    }
  };
}
