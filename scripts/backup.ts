import Database from 'better-sqlite3';

const destination = process.argv[2];
if (!destination) throw new Error('Usage: npm run backup -- /absolute/path/puck-backup.sqlite');
const db = new Database(process.env.DATABASE_PATH ?? 'data/puck.sqlite', { readonly: true });
await db.backup(destination);
db.close();
console.info(`Backup written to ${destination}`);
