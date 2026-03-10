import 'dotenv/config';
import cluster from 'node:cluster';
import { createClient } from 'redis';
import { runCode } from '../shared/codeRunner.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_QUEUE_NAME = process.env.REDIS_QUEUE_NAME || 'problems';
const WORKER_COUNT = Math.max(1, Number(process.env.WORKER_COUNT) || 2);
const CODE_TIMEOUT_MS = Number(process.env.CODE_TIMEOUT_MS) || 10000;

if (cluster.isPrimary) {
  console.log(`[worker] primary ${process.pid} starting ${WORKER_COUNT} workers`);

  for (let index = 0; index < WORKER_COUNT; index += 1) {
    cluster.fork();
  }

  cluster.on('exit', (deadWorker) => {
    console.log(`[worker] child ${deadWorker.process.pid} died, restarting`);
    cluster.fork();
  });
} else {
  const queueClient = createClient({ url: REDIS_URL });
  const pubClient = createClient({ url: REDIS_URL });

  queueClient.on('error', (error) => {
    console.error(`[worker:${process.pid}] Redis queue error:`, error.message);
  });

  pubClient.on('error', (error) => {
    console.error(`[worker:${process.pid}] Redis pub error:`, error.message);
  });

  async function publishEvent(roomId, event, payload) {
    await pubClient.publish(
      roomId,
      JSON.stringify({
        event,
        payload,
      })
    );
  }

  async function processSubmission(rawSubmission) {
    const submission = JSON.parse(rawSubmission);
    const { roomId, submissionId, language, code, input = '', queuedAt } = submission;

    const startedAt = Date.now();

    await publishEvent(roomId, 'compile-status', {
      roomId,
      submissionId,
      status: 'running',
      startedAt,
      queueWaitMs: queuedAt ? startedAt - queuedAt : undefined,
    });

    const result = await runCode({
      language,
      code,
      input,
      timeoutMs: CODE_TIMEOUT_MS,
    });

    const finishedAt = Date.now();

    await publishEvent(roomId, 'compile-output', {
      roomId,
      submissionId,
      language,
      ok: result.ok,
      output: result.output,
      runner: result.runner,
      durationMs: finishedAt - startedAt,
      queueWaitMs: queuedAt ? startedAt - queuedAt : undefined,
      timestamp: new Date().toISOString(),
    });

    await publishEvent(roomId, 'compile-status', {
      roomId,
      submissionId,
      status: 'completed',
      finishedAt,
    });
  }

  async function main() {
    await queueClient.connect();
    await pubClient.connect();

    console.log(`[worker:${process.pid}] connected`);

    while (true) {
      const queueResult = await queueClient.brPop(REDIS_QUEUE_NAME, 0);
      if (!queueResult?.element) {
        continue;
      }

      try {
        await processSubmission(queueResult.element);
      } catch (error) {
        console.error(`[worker:${process.pid}] failed submission:`, error.message);
      }
    }
  }

  main().catch((error) => {
    console.error(`[worker:${process.pid}] startup failed:`, error);
    process.exit(1);
  });
}
