import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config/env.config';
import { migrationRouter } from './routes/migration.routes';
import { connectMongo } from './config/mongo.client';

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API routes
app.use('/api/migration', migrationRouter);

// Serve static frontend build if present
const clientDist = path.resolve(__dirname, '../client/dist');
app.use(express.static(clientDist));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) {
      res.status(200).send(`
        <html>
          <head><title>50GB CounterPoint to MongoDB Migration Engine</title></head>
          <body style="font-family: sans-serif; background: #0f172a; color: #f8fafc; padding: 2rem;">
            <h1>50GB CounterPoint to MongoDB Migration Engine</h1>
            <p>Backend API is active and listening on port ${config.port}.</p>
            <p>Access the REST API at <code>/api/migration/*</code> or run the client dev server.</p>
          </body>
        </html>
      `);
    }
  });
});

async function bootstrap() {
  app.listen(config.port, () => {
    console.log(`================================================================`);
    console.log(` 50GB CounterPoint to MongoDB Migration Engine Server`);
    console.log(` Port: ${config.port}`);
    console.log(` Environment: ${config.nodeEnv}`);
    console.log(` Health: http://localhost:${config.port}/api/migration/health`);
    console.log(` Pre-Flight: http://localhost:${config.port}/api/migration/preflight`);
    console.log(`================================================================`);
  });

  // Attempt initial MongoDB connection non-fatally so server stays alive for UI
  try {
    await connectMongo();
  } catch (err: any) {
    console.warn(`[Server] Initial MongoDB connection not available: ${err.message}`);
    console.warn(`[Server] Update MONGO_URI in .env or start MongoDB. UI remains active.`);
  }
}

bootstrap();
