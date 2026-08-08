type BackupRestorePhase =
  "prepared" | "writing" | "written" | "committed" | "rolling-back"

export type StorageKeySnapshot = {
  values: Record<string, unknown>
  missing: string[]
}

export type BackupRestoreJournal = {
  schemaVersion: 1
  transactionId: string
  mode: "merge" | "replace"
  phase: BackupRestorePhase
  createdAt: number
  updatedAt: number
  localKeys: string[]
  syncKeys: string[]
  localBefore: StorageKeySnapshot
  syncBefore: StorageKeySnapshot
  expectedAfterDigest: string
}

export type RestoreJournalStore = {
  read: () => Promise<BackupRestoreJournal | null>
  write: (journal: BackupRestoreJournal) => Promise<void>
  clear: () => Promise<void>
}

const DATABASE_NAME = "tabplex-backup-restore"
const STORE_NAME = "journal"
const ACTIVE_JOURNAL_KEY = "active"

const requestResult = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error("restore-journal-request-failed"))
  })

const transactionComplete = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () =>
      reject(
        transaction.error ?? new Error("restore-journal-transaction-failed")
      )
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("restore-journal-aborted"))
  })

const openJournalDatabase = (factory: IDBFactory) =>
  new Promise<IDBDatabase>((resolve, reject) => {
    let blocked = false
    const request = factory.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => {
      const database = request.result
      if (blocked) {
        database.close()
        return
      }
      database.onversionchange = () => database.close()
      resolve(database)
    }
    request.onerror = () =>
      reject(request.error ?? new Error("restore-journal-open-failed"))
    request.onblocked = () => {
      blocked = true
      reject(new Error("restore-journal-open-blocked"))
    }
  })

const withStore = async <T>(
  factory: IDBFactory,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
) => {
  const database = await openJournalDatabase(factory)
  try {
    const transaction = database.transaction(STORE_NAME, mode)
    const resultPromise = requestResult(
      operation(transaction.objectStore(STORE_NAME))
    )
    const [result] = await Promise.all([
      resultPromise,
      transactionComplete(transaction)
    ])
    return result
  } finally {
    database.close()
  }
}

export const createIndexedDbRestoreJournalStore = (
  factory: IDBFactory | undefined = globalThis.indexedDB
): RestoreJournalStore => {
  const requireFactory = () => {
    if (!factory) throw new Error("restore-journal-indexeddb-unavailable")
    return factory
  }

  return {
    async read() {
      const result = await withStore(requireFactory(), "readonly", (store) =>
        store.get(ACTIVE_JOURNAL_KEY)
      )
      return (result as BackupRestoreJournal | undefined) ?? null
    },
    async write(journal) {
      await withStore(requireFactory(), "readwrite", (store) =>
        store.put(journal, ACTIVE_JOURNAL_KEY)
      )
    },
    async clear() {
      await withStore(requireFactory(), "readwrite", (store) =>
        store.delete(ACTIVE_JOURNAL_KEY)
      )
    }
  }
}
