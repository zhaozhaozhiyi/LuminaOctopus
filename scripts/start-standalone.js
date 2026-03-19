const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const workspaceRoot = process.env.LUMINA_WORKSPACE_ROOT
  ? path.resolve(process.env.LUMINA_WORKSPACE_ROOT)
  : process.cwd();

const standaloneRoot = path.join(workspaceRoot, '.next', 'standalone');
const standaloneServer = path.join(standaloneRoot, 'server.js');
const sourceStaticDir = path.join(workspaceRoot, '.next', 'static');
const targetStaticDir = path.join(standaloneRoot, '.next', 'static');
const publicDir = path.join(workspaceRoot, 'public');
const targetPublicDir = path.join(standaloneRoot, 'public');

function ensureBuildExists() {
  if (!fs.existsSync(standaloneServer)) {
    console.error('Standalone build output is missing. Run `npm run build` first.');
    process.exit(1);
  }
}

function syncDir(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) return;
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  fs.cpSync(sourceDir, targetDir, { recursive: true, force: true });
}

function launchServer() {
  const child = spawn(process.execPath, [standaloneServer], {
    cwd: standaloneRoot,
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

ensureBuildExists();
syncDir(sourceStaticDir, targetStaticDir);
syncDir(publicDir, targetPublicDir);
launchServer();
