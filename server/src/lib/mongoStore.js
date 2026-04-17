import mongoose from 'mongoose';

const DEFAULT_DB_NAME = process.env.MONGO_DB_NAME || 'codeeditor';
let connectionPromise = null;

function getMongoUri() {
  return process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGO_URL || '';
}

export async function ensureMongoConnection() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!connectionPromise) {
    const uri = getMongoUri();
    if (!uri) {
      throw new Error('Missing MONGO_URI environment variable.');
    }

    connectionPromise = mongoose
      .connect(uri, { dbName: DEFAULT_DB_NAME })
      .then(() => mongoose.connection)
      .catch((error) => {
        connectionPromise = null;
        throw error;
      });
  }

  return connectionPromise;
}

const snippetSchema = new mongoose.Schema(
  {
    snippetId: { type: String, required: true, unique: true, index: true },
    code: { type: String, default: '' },
    language: { type: String, default: 'javascript' },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const savedDocumentSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    roomId: { type: String, default: 'default-room' },
    fileName: { type: String, default: '' },
    content: { type: String, default: '' },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export const Snippet = mongoose.models.Snippet || mongoose.model('Snippet', snippetSchema);
export const SavedDocument = mongoose.models.SavedDocument || mongoose.model('SavedDocument', savedDocumentSchema);