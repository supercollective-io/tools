import Database from 'better-sqlite3';

const destination = process.argv.slice(2).find((arg) => arg !== '--');
if (!destination) throw new Error('Usage: pnpm backup -- /absolute/path/puck-backup.sqlite');
const db = new Database(process.env.DATABASE_PATH ?? 'data/puck.sqlite', { readonly: true });
await db.backup(destination);
db.close();
console.info(`Backup written to ${destination}`);
