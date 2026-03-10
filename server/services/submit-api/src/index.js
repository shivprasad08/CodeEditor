import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { createClient } from 'redis';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const PORT = Number(process.env.PORT) || 3000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_QUEUE_NAME = process.env.REDIS_QUEUE_NAME || 'problems';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors({ origin: CLIENT_ORIGIN }));

const redisClient = createClient({ url: REDIS_URL });
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined,
});

redisClient.on('error', (error) => {
  console.error('[submit-api] Redis error:', error.message);
});

function getSnippetBucket() {
  return process.env.AWS_S3_BUCKET_NAME || process.env.AWS_S3_BUCKET;
}

function getExtension(language) {
  switch (language) {
    case 'javascript':
      return '.js';
    case 'python':
      return '.py';
    case 'cpp':
      return '.cpp';
    case 'java':
      return '.java';
    case 'rust':
      return '.rs';
    case 'go':
      return '.go';
    default:
      return '.txt';
  }
}

function getLanguageFromSnippetId(id) {
  let language = 'javascript';
  if (id.endsWith('.py')) language = 'python';
  if (id.endsWith('.cpp')) language = 'cpp';
  if (id.endsWith('.java')) language = 'java';
  if (id.endsWith('.rs')) language = 'rust';
  if (id.endsWith('.go')) language = 'go';
  return language;
}

app.get('/api/health', async (_req, res) => {
  try {
    const queueLength = await redisClient.lLen(REDIS_QUEUE_NAME);
    res.json({ ok: true, queueLength });
  } catch {
    res.status(500).json({ ok: false });
  }
});

app.post('/api/submit', async (req, res) => {
  const { roomId, code, language, input } = req.body || {};
  if (!roomId || !language || typeof code !== 'string') {
    return res.status(400).json({
      ok: false,
      message: 'Missing required fields: roomId, language, code',
    });
  }

  const submissionId = `submission-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const payload = {
    submissionId,
    roomId,
    code,
    language,
    input: input || '',
    queuedAt: Date.now(),
  };

  try {
    await redisClient.lPush(REDIS_QUEUE_NAME, JSON.stringify(payload));

    await redisClient.publish(
      roomId,
      JSON.stringify({
        event: 'compile-status',
        payload: {
          roomId,
          submissionId,
          status: 'queued',
          queuedAt: payload.queuedAt,
        },
      })
    );

    return res.status(202).json({
      ok: true,
      status: 'queued',
      submissionId,
      roomId,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Failed to enqueue submission',
      error: error.message,
    });
  }
});

app.post('/api/save-to-cloud', async (req, res) => {
  const { roomId, content, fileName } = req.body || {};

  if (!process.env.AWS_S3_BUCKET) {
    return res.status(500).json({
      message: 'Missing AWS_S3_BUCKET environment variable.',
    });
  }

  const resolvedRoom = roomId || 'default-room';
  const resolvedFile = fileName || `room-${resolvedRoom}-${Date.now()}.txt`;

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: `rooms/${resolvedRoom}/${resolvedFile}`,
    Body: content || '',
    ContentType: 'text/plain',
  });

  try {
    await s3.send(command);
    return res.status(200).json({
      message: 'Saved to cloud storage.',
      key: `rooms/${resolvedRoom}/${resolvedFile}`,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to save file to S3.',
      error: error.message,
    });
  }
});

app.post('/snippets', async (req, res) => {
  const { code, language } = req.body || {};
  const bucket = getSnippetBucket();

  if (!bucket) {
    return res.status(500).json({ error: 'Missing AWS_S3_BUCKET_NAME or AWS_S3_BUCKET environment variable.' });
  }

  try {
    const snippetId = `snippet-${Date.now()}${getExtension(language)}`;
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: snippetId,
      Body: code || '',
      ContentType: 'text/plain',
    });

    await s3.send(command);
    return res.status(200).json({ snippetId });
  } catch {
    return res.status(500).json({ error: 'Failed to save snippet' });
  }
});

app.get('/snippets/:id', async (req, res) => {
  const { id } = req.params;
  const bucket = getSnippetBucket();

  if (!bucket) {
    return res.status(500).json({ error: 'Missing AWS_S3_BUCKET_NAME or AWS_S3_BUCKET environment variable.' });
  }

  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: id,
    });

    const response = await s3.send(command);
    const code = await response.Body?.transformToString();

    return res.status(200).json({
      code,
      language: getLanguageFromSnippetId(id),
    });
  } catch {
    return res.status(404).json({ error: 'Snippet not found' });
  }
});

app.delete('/snippets/:id', async (req, res) => {
  const { id } = req.params;
  const bucket = getSnippetBucket();

  if (!bucket) {
    return res.status(500).json({ error: 'Missing AWS_S3_BUCKET_NAME or AWS_S3_BUCKET environment variable.' });
  }

  try {
    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: id,
    });

    await s3.send(command);
    return res.status(200).json({ message: 'Snippet deleted successfully' });
  } catch {
    return res.status(500).json({ error: 'Failed to delete snippet' });
  }
});

async function main() {
  await redisClient.connect();

  app.listen(PORT, () => {
    console.log(`[submit-api] listening on ${PORT}`);
  });
}

main().catch((error) => {
  console.error('[submit-api] startup failed:', error);
  process.exit(1);
});
