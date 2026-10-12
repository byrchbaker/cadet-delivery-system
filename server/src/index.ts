import { config } from './config';
import { initDb, closeDb } from './db';
import { createApp } from './app';
import { startJobs, stopJobs } from './jobs';

initDb(config.dbPath);
const app = createApp();
const server = app.listen(config.port, config.host, () => {
  console.log(`Cadet Delivery System listening on http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
  console.log(`Data directory: ${config.dataDir}`);
});
startJobs();

function shutdown(signal: string) {
  console.log(`${signal} received — shutting down`);
  stopJobs();
  server.close(() => {
    closeDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
