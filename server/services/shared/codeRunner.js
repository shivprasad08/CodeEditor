import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function resolveLanguageConfig(language, code) {
  const normalized = String(language || '').toLowerCase();

  if (normalized === 'javascript' || normalized === 'js') {
    return {
      id: 'javascript',
      fileName: 'main.js',
      dockerImage: 'node:20',
      dockerScript: 'node /workspace/main.js',
      supportsLocal: true,
    };
  }

  if (normalized === 'typescript' || normalized === 'ts') {
    return {
      id: 'typescript',
      fileName: 'main.ts',
      dockerImage: 'node:20',
      dockerScript: 'npx -y tsx /workspace/main.ts',
      supportsLocal: false,
    };
  }

  if (normalized === 'python' || normalized === 'py') {
    return {
      id: 'python',
      fileName: 'main.py',
      dockerImage: 'python:3.11',
      dockerScript: 'python /workspace/main.py',
      supportsLocal: false,
    };
  }

  if (normalized === 'cpp' || normalized === 'c++') {
    return {
      id: 'cpp',
      fileName: 'main.cpp',
      dockerImage: 'gcc:13',
      dockerScript: 'g++ /workspace/main.cpp -O2 -o /workspace/a.out && /workspace/a.out',
      supportsLocal: false,
    };
  }

  if (normalized === 'c') {
    return {
      id: 'c',
      fileName: 'main.c',
      dockerImage: 'gcc:13',
      dockerScript: 'gcc /workspace/main.c -O2 -o /workspace/a.out && /workspace/a.out',
      supportsLocal: false,
    };
  }

  if (normalized === 'go' || normalized === 'golang') {
    return {
      id: 'go',
      fileName: 'main.go',
      dockerImage: 'golang:1.22',
      dockerScript: 'go run /workspace/main.go',
      supportsLocal: false,
    };
  }

  if (normalized === 'rust' || normalized === 'rs') {
    return {
      id: 'rust',
      fileName: 'main.rs',
      dockerImage: 'rust:1.77',
      dockerScript: 'rustc /workspace/main.rs -O -o /workspace/a.out && /workspace/a.out',
      supportsLocal: false,
    };
  }

  if (normalized === 'java') {
    const classNameMatch = String(code || '').match(/public\s+class\s+([A-Za-z_][A-Za-z0-9_]*)/);
    const className = classNameMatch?.[1] || 'Main';

    return {
      id: 'java',
      fileName: `${className}.java`,
      dockerImage: 'openjdk:21',
      dockerScript: `javac /workspace/${className}.java && java -cp /workspace ${className}`,
      supportsLocal: false,
    };
  }

  return null;
}

function normalizeVolumePath(absolutePath) {
  return absolutePath.replace(/\\/g, '/');
}

function executeProcess({ command, args, cwd, input = '', timeoutMs = 10000 }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      resolve({
        ok: false,
        stdout,
        stderr: `${stderr}${stderr ? '\n' : ''}${error.message}`,
        timedOut,
        code: null,
      });
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve({
        ok: !timedOut && code === 0,
        stdout,
        stderr,
        timedOut,
        code,
      });
    });

    child.stdin.write(input || '');
    child.stdin.end();
  });
}

async function runWithDocker({ tempDir, languageConfig, input, timeoutMs }) {
  const args = [
    'run',
    '--rm',
    '-i',
    '--network',
    'none',
    '--memory',
    '256m',
    '--cpus',
    '1.0',
    '--pids-limit',
    '128',
    '-v',
    `${normalizeVolumePath(tempDir)}:/workspace`,
    languageConfig.dockerImage,
    'sh',
    '-lc',
    languageConfig.dockerScript,
  ];

  return executeProcess({
    command: 'docker',
    args,
    cwd: tempDir,
    input,
    timeoutMs,
  });
}

async function runWithLocalNode({ tempDir, languageConfig, input, timeoutMs }) {
  return executeProcess({
    command: process.execPath,
    args: [path.join(tempDir, languageConfig.fileName)],
    cwd: tempDir,
    input,
    timeoutMs,
  });
}

export async function runCode({ language, code, input = '', timeoutMs = 10000 }) {
  const languageConfig = resolveLanguageConfig(language, code);
  if (!languageConfig) {
    return {
      ok: false,
      runner: 'none',
      output: `Unsupported language: ${language}`,
    };
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'collab-run-'));

  try {
    await writeFile(path.join(tempDir, languageConfig.fileName), code || '', 'utf8');

    const mode = String(process.env.CODE_RUNNER_MODE || 'docker').toLowerCase();
    let execResult = null;
    let runner = 'docker';

    if (mode === 'local') {
      if (!languageConfig.supportsLocal) {
        return {
          ok: false,
          runner: 'local',
          output: `Language '${languageConfig.id}' requires Docker mode.`,
        };
      }

      execResult = await runWithLocalNode({
        tempDir,
        languageConfig,
        input,
        timeoutMs,
      });
      runner = 'local';
    } else {
      execResult = await runWithDocker({
        tempDir,
        languageConfig,
        input,
        timeoutMs,
      });

      if (!execResult.ok && mode === 'auto' && languageConfig.supportsLocal) {
        const fallback = await runWithLocalNode({
          tempDir,
          languageConfig,
          input,
          timeoutMs,
        });
        execResult = fallback;
        runner = 'local';
      }
    }

    const output = execResult.timedOut
      ? `Execution timed out after ${timeoutMs}ms.`
      : [execResult.stdout, execResult.stderr].filter(Boolean).join('\n').trim() || 'Execution completed with no output.';

    return {
      ok: execResult.ok,
      runner,
      output,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
