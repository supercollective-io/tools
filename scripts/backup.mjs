import { createHash } from "node:crypto";
import {
	chmod,
	copyFile,
	lstat,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	realpath,
	rm,
	writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import {
	basename,
	dirname,
	isAbsolute,
	join,
	relative,
	resolve,
	sep,
} from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

const require = createRequire(
	new URL("../apps/polymind/package.json", import.meta.url),
);
export const lockfile = require("proper-lockfile");
export const sha256 = (value) =>
	createHash("sha256").update(value).digest("hex");

export async function destinationPath(path) {
	const absolute = resolve(path);
	try {
		return await realpath(absolute);
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
		return join(await destinationPath(dirname(absolute)), basename(absolute));
	}
}
export function assertSeparate(source, target) {
	const distance = relative(source, target);
	if (
		!distance ||
		(!distance.startsWith(`..${sep}`) &&
			distance !== ".." &&
			!isAbsolute(distance))
	)
		throw new Error("The output must be outside the source directory.");
}
export async function fileList(directory, prefix = "") {
	const files = [];
	for (const name of (await readdir(join(directory, prefix))).sort()) {
		const path = join(prefix, name),
			stat = await lstat(join(directory, path));
		if (stat.isSymbolicLink())
			throw new Error(
				"Symbolic links are not permitted in private data snapshots.",
			);
		if (stat.isDirectory()) {
			if (name.endsWith(".lock"))
				throw new Error(
					"A journal lock remains; stop its writer before taking a backup.",
				);
			files.push(...(await fileList(directory, path)));
		} else if (stat.isFile()) files.push(path.split(sep).join("/"));
		else
			throw new Error("Only ordinary files and directories can be backed up.");
	}
	return files.sort();
}
export async function privateCopy(source, target) {
	await mkdir(dirname(target), { recursive: true, mode: 0o700 });
	await copyFile(source, target);
	await chmod(target, 0o600);
}
export const sqliteFile = (path) => /\.(?:sqlite|sqlite3|db)$/i.test(path);
const sqliteSidecar = (path) =>
	/\.(?:sqlite|sqlite3|db)-(?:wal|shm|journal)$/i.test(path);

export async function backupData({ source, target }) {
	const input = await realpath(source),
		output = await destinationPath(target);
	assertSeparate(input, output);
	try {
		await lstat(output);
		throw new Error(
			"Choose a new backup directory; existing output is never overwritten.",
		);
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	const unlock = await lockfile.lock(input, { retries: 0, stale: 30000 });
	let created = false,
		unlockOutput;
	try {
		const paths = (await fileList(input)).filter(
			(path) => !sqliteSidecar(path),
		);
		if (!paths.includes("sessions.sqlite"))
			throw new Error("The source has no sessions.sqlite database.");
		await mkdir(dirname(output), { recursive: true, mode: 0o700 });
		await mkdir(output, { mode: 0o700 });
		created = true;
		unlockOutput = await lockfile.lock(output, { retries: 0, stale: 30000 });
		const files = [];
		for (const path of paths) {
			const from = join(input, path),
				to = join(output, path);
			await mkdir(dirname(to), { recursive: true, mode: 0o700 });
			if (sqliteFile(path)) {
				// Never open the source itself: SQLite can create sidecars even in read-only mode.
				const scratch = await mkdtemp(
					join(tmpdir(), "polymind-sqlite-backup-"),
				);
				let db;
				try {
					await chmod(scratch, 0o700);
					await privateCopy(from, join(scratch, "input.sqlite"));
					try {
						await privateCopy(`${from}-wal`, join(scratch, "input.sqlite-wal"));
					} catch (error) {
						if (error.code !== "ENOENT") throw error;
					}
					db = new DatabaseSync(join(scratch, "input.sqlite"), {
						readOnly: true,
					});
					await backup(db, to);
				} finally {
					db?.close();
					await rm(scratch, { recursive: true, force: true });
				}
				await chmod(to, 0o600);
			} else await privateCopy(from, to);
			const bytes = await readFile(to);
			files.push({ path, bytes: bytes.length, sha256: sha256(bytes) });
		}
		const manifest = {
			schemaVersion: 1,
			createdAt: new Date().toISOString(),
			files,
		};
		await writeFile(
			join(output, "backup-manifest.json"),
			`${JSON.stringify(manifest, null, 2)}\n`,
			{ mode: 0o600, flag: "wx" },
		);
		return { directory: output, files: files.length };
	} catch (error) {
		if (created) await rm(output, { recursive: true, force: true });
		if (unlockOutput) {
			await unlockOutput();
			unlockOutput = undefined;
		}
		throw error;
	} finally {
		await unlockOutput?.();
		await unlock();
	}
}

export async function verifyManifest(directory) {
	const manifest = JSON.parse(
		await readFile(join(directory, "backup-manifest.json"), "utf8"),
	);
	if (
		manifest.schemaVersion !== 1 ||
		!Array.isArray(manifest.files) ||
		!manifest.files.length
	)
		throw new Error("Unsupported or empty backup manifest.");
	const seen = new Set();
	for (const file of manifest.files) {
		if (
			!file ||
			typeof file.path !== "string" ||
			!file.path ||
			file.path.includes("\\") ||
			file.path.includes("\0") ||
			isAbsolute(file.path) ||
			file.path
				.split("/")
				.some((part) => !part || part === "." || part === "..") ||
			file.path === "backup-manifest.json" ||
			seen.has(file.path) ||
			!Number.isSafeInteger(file.bytes) ||
			file.bytes < 0 ||
			!/^[a-f0-9]{64}$/.test(file.sha256)
		)
			throw new Error("Invalid backup manifest entry.");
		seen.add(file.path);
	}
	const actual = (await fileList(directory)).filter(
		(path) => path !== "backup-manifest.json",
	);
	if (JSON.stringify(actual) !== JSON.stringify([...seen].sort()))
		throw new Error("Backup file inventory differs from its manifest.");
	for (const file of manifest.files) {
		const bytes = await readFile(join(directory, file.path));
		if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256)
			throw new Error("Backup checksum mismatch.");
	}
	return manifest;
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
	const args = process.argv.slice(2);
	if (args.length !== 4 || args[0] !== "--source" || args[2] !== "--target") {
		console.error(
			"Usage: node scripts/backup.mjs --source DATA_DIR --target NEW_BACKUP_DIR",
		);
		process.exitCode = 1;
	} else {
		try {
			console.log(
				JSON.stringify(await backupData({ source: args[1], target: args[3] })),
			);
		} catch {
			console.error(
				"Backup failed. Stop the writer and check the explicit source/output paths and permissions. Existing backups are never replaced.",
			);
			process.exitCode = 1;
		}
	}
}
