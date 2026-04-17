import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { createClient } from 'redis';
import { SavedDocument, Snippet, ensureMongoConnection } from './lib/mongoStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });
if (!process.env.MONGO_URI && !process.env.MONGODB_URI && !process.env.MONGO_URL) {
  dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
}
if (!process.env.MONGO_URI && !process.env.MONGODB_URI && !process.env.MONGO_URL) {
  dotenv.config({ path: path.resolve(__dirname, '../../../.env.example') });
}

const PORT = Number(process.env.PORT) || 3000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_QUEUE_NAME = process.env.REDIS_QUEUE_NAME || 'problems';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors({ origin: CLIENT_ORIGIN }));

const redisClient = createClient({ url: REDIS_URL });

redisClient.on('error', (error) => {
  console.error('[submit-api] Redis error:', error.message);
});

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

  const resolvedRoom = roomId || 'default-room';
  const resolvedFile = fileName || `room-${resolvedRoom}-${Date.now()}.txt`;

  try {
    await ensureMongoConnection();

    const key = `rooms/${resolvedRoom}/${resolvedFile}`;
    await SavedDocument.findOneAndUpdate(
      { key },
      {
        key,
        roomId: resolvedRoom,
        fileName: resolvedFile,
        content: typeof content === 'string' ? content : '',
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.status(200).json({
      message: 'Saved to MongoDB.',
      key,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to save file to MongoDB.',
      error: error.message,
    });
  }
});

app.post('/snippets', async (req, res) => {
  const { code, language } = req.body || {};

  try {
    await ensureMongoConnection();

    const snippetId = `snippet-${Date.now()}${getExtension(language)}`;
    await Snippet.findOneAndUpdate(
      { snippetId },
      {
        snippetId,
        code: typeof code === 'string' ? code : '',
        language: typeof language === 'string' ? language : 'javascript',
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.status(200).json({ snippetId });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to save snippet' });
  }
});

app.get('/snippets/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await ensureMongoConnection();

    const snippet = await Snippet.findOne({ snippetId: id }).lean();

    if (!snippet) {
      return res.status(404).json({ error: 'Snippet not found' });
    }

    return res.status(200).json({
      code: snippet.code || '',
      language: snippet.language || getLanguageFromSnippetId(id),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to load snippet' });
  }
});

app.delete('/snippets/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await ensureMongoConnection();

    await Snippet.deleteOne({ snippetId: id });

    return res.status(200).json({ message: 'Snippet deleted successfully' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to delete snippet' });
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
