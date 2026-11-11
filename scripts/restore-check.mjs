import { chmod, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import {
	lockfile,
	privateCopy,
	sqliteFile,
	verifyManifest,
} from "./backup.mjs";

export async function checkRestore({ backup }) {
	const source = await realpath(backup);
	const unlock = await lockfile.lock(source, { retries: 0, stale: 30000 });
	let restored;
	try {
		const manifest = await verifyManifest(source);
		restored = await mkdtemp(join(tmpdir(), "polymind-restore-check-"));
		await chmod(restored, 0o700);
		for (const file of manifest.files)
			await privateCopy(join(source, file.path), join(restored, file.path));
		let databases = 0,
			journals = 0;
		for (const file of manifest.files) {
			if (!sqliteFile(file.path)) continue;
			const db = new DatabaseSync(join(restored, file.path), {
				readOnly: true,
			});
			try {
				if (
					db
						.prepare("PRAGMA integrity_check")
						.all()
						.some((row) => Object.values(row)[0] !== "ok") ||
					db.prepare("PRAGMA foreign_key_check").all().length
				)
					throw new Error("Restored database integrity check failed.");
				if (file.path === "sessions.sqlite") {
					if (db.prepare("PRAGMA user_version").get().user_version !== 1)
						throw new Error("Unsupported session schema.");
					const { readLiveRun } = await import(
						"../apps/polymind/src/live-runs.ts"
					);
					for (const row of db.prepare("SELECT id FROM voice_runs").all()) {
						if (!/^[a-f0-9-]{36}$/i.test(row.id))
							throw new Error("Invalid voice journal identifier.");
						const journal = `voice-${row.id}.jsonl`;
						if (!manifest.files.some((file) => file.path === journal))
							throw new Error("A voice journal is missing from the backup.");
						await readLiveRun(join(restored, journal));
						journals++;
					}
				}
				databases++;
			} finally {
				db.close();
			}
		}
		if (
			!databases ||
			!manifest.files.some((file) => file.path === "sessions.sqlite")
		)
			throw new Error("No session database was restored.");
		// Re-read the immutable archive after inspection; all SQLite queries ran on the isolated copy.
		await verifyManifest(source);
		return {
			status: "passed",
			files: manifest.files.length,
			databases,
			journals,
			isolatedCopyRemoved: true,
		};
	} finally {
		if (restored) await rm(restored, { recursive: true, force: true });
		await unlock();
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
	const args = process.argv.slice(2);
	if (args.length !== 2 || args[0] !== "--backup") {
		console.error("Usage: node scripts/restore-check.mjs --backup BACKUP_DIR");
		process.exitCode = 1;
	} else {
		try {
			console.log(JSON.stringify(await checkRestore({ backup: args[1] })));
		} catch {
			console.error(
				"Restore check failed: manifest, database integrity or journal validation did not pass. The archive and live data were not changed.",
			);
			process.exitCode = 1;
		}
	}
}
