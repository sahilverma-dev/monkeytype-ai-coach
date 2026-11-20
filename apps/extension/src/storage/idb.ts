import { DB_NAME, DB_VERSION } from "@/shared/constants";

let database: Promise<IDBDatabase> | null = null;

function upgrade(db: IDBDatabase): void {
	if (!db.objectStoreNames.contains("tests")) {
		const tests = db.createObjectStore("tests", { keyPath: "id" });
		tests.createIndex("timestamp", "timestamp");
	}
	if (!db.objectStoreNames.contains("meta")) {
		db.createObjectStore("meta", { keyPath: "key" });
	}
	if (!db.objectStoreNames.contains("conversations")) {
		const conversations = db.createObjectStore("conversations", { keyPath: "id" });
		conversations.createIndex("updatedAt", "updatedAt");
	}
}

export function openDatabase(): Promise<IDBDatabase> {
	if (database !== null) return database;
	database = new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => upgrade(request.result);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error("Failed to open database"));
		request.onblocked = () =>
			reject(new Error("Database upgrade blocked by another tab"));
	});
	return database;
}

function run<T>(
	storeName: string,
	mode: IDBTransactionMode,
	operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
	return openDatabase().then(
		(db) =>
			new Promise<T>((resolve, reject) => {
				const transaction = db.transaction(storeName, mode);
				const request = operation(transaction.objectStore(storeName));
				request.onsuccess = () => resolve(request.result);
				request.onerror = () =>
					reject(request.error ?? new Error("IndexedDB request failed"));
				transaction.onabort = () =>
					reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
			}),
	);
}

export function getAll<T>(store: string): Promise<T[]> {
	return run<T[]>(store, "readonly", (objectStore) => objectStore.getAll());
}

export function get<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
	return run<T | undefined>(store, "readonly", (objectStore) => objectStore.get(key));
}

export function put<T>(store: string, value: T): Promise<IDBValidKey> {
	return run(store, "readwrite", (objectStore) => objectStore.put(value));
}

export function putMany<T>(store: string, values: T[]): Promise<unknown> {
	return openDatabase().then(
		(db) =>
			new Promise((resolve, reject) => {
				const transaction = db.transaction(store, "readwrite");
				const objectStore = transaction.objectStore(store);
				for (const value of values) objectStore.put(value);
				transaction.oncomplete = () => resolve(undefined);
				transaction.onerror = () =>
					reject(transaction.error ?? new Error("IndexedDB write failed"));
			}),
	);
}

export function remove(store: string, key: IDBValidKey): Promise<void> {
	return run<undefined>(store, "readwrite", (objectStore) =>
		objectStore.delete(key),
	).then(() => undefined);
}

export function clear(store: string): Promise<void> {
	return run<undefined>(store, "readwrite", (objectStore) => objectStore.clear()).then(
		() => undefined,
	);
}

export function count(store: string): Promise<number> {
	return run<number>(store, "readonly", (objectStore) => objectStore.count());
}

/** Test seam: drop the cached connection so a fresh database can be opened. */
export function resetDatabaseHandle(): void {
	database = null;
}
