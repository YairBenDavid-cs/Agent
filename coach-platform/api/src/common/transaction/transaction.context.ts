import { AsyncLocalStorage } from 'async_hooks';
import { ClientSession } from 'mongoose';

/**
 * Ambient transaction context. TransactionManager.run* stores the active Mongo
 * session here; session-aware repositories read it transparently. This keeps
 * ClientSession out of commands, queries, and the domain — the orchestrator
 * never threads a session by hand.
 */
interface TransactionStore {
  session: ClientSession;
}

export const transactionStorage = new AsyncLocalStorage<TransactionStore>();

/** The session for the in-flight transaction, or undefined outside one. */
export const getActiveSession = (): ClientSession | undefined =>
  transactionStorage.getStore()?.session;
