import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { runCode } from './codeRunner.js';

export class CompilePipeline {
  constructor({ onStatus, onResult }) {
    this.queue = [];
    this.activeWorkers = 0;
    this.workerCount = Math.max(1, Number(process.env.WORKER_COUNT) || Math.max(2, Math.min(4, os.cpus().length || 2)));
    this.onStatus = onStatus;
    this.onResult = onResult;
  }

  getQueueLength() {
    return this.queue.length;
  }

  getActiveWorkers() {
    return this.activeWorkers;
  }

  enqueue({ roomId, code, language, input }) {
    const submission = {
      submissionId: `submission-${Date.now()}-${randomUUID().slice(0, 8)}`,
      roomId,
      code,
      language,
      input: input || '',
      queuedAt: Date.now(),
    };

    this.queue.push(submission);
    this.onStatus?.({
      roomId: submission.roomId,
      submissionId: submission.submissionId,
      status: 'queued',
      queuedAt: submission.queuedAt,
      queueLength: this.queue.length,
    });

    this.pump();
    return submission;
  }

  pump() {
    while (this.activeWorkers < this.workerCount && this.queue.length > 0) {
      const nextSubmission = this.queue.shift();
      if (!nextSubmission) {
        return;
      }

      this.activeWorkers += 1;
      this.process(nextSubmission)
        .catch(() => {})
        .finally(() => {
          this.activeWorkers -= 1;
          this.pump();
        });
    }
  }

  async process(submission) {
    const startedAt = Date.now();

    this.onStatus?.({
      roomId: submission.roomId,
      submissionId: submission.submissionId,
      status: 'running',
      startedAt,
      queueLength: this.queue.length,
    });

    const result = await runCode({
      language: submission.language,
      code: submission.code,
      input: submission.input,
      timeoutMs: Number(process.env.CODE_TIMEOUT_MS) || 10000,
    });

    const finishedAt = Date.now();

    this.onResult?.({
      roomId: submission.roomId,
      submissionId: submission.submissionId,
      language: submission.language,
      ok: result.ok,
      output: result.output,
      runner: result.runner,
      durationMs: finishedAt - startedAt,
      queueWaitMs: startedAt - submission.queuedAt,
      finishedAt,
    });
  }
}
