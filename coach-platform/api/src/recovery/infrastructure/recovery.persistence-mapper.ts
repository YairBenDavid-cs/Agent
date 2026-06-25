import { RecoveryDay } from '../domain/recovery-day.model';
import { RecoveryDaily } from './recovery-daily.schema';

/**
 * Pure mappers between the domain model and the persistence (DAO) shape.
 * No I/O, no side effects. Written field-by-field to prevent accidental leaks.
 */
export const toPersistence = (day: RecoveryDay): RecoveryDaily => ({
  user_id: day.userId,
  date: day.date,
  source: day.source,
  content_hash: day.contentHash,
  ingestion_status: day.ingestionStatus,
  warnings: day.warnings,
  recovery: day.metrics,
});

export const toDomain = (doc: RecoveryDaily): RecoveryDay => ({
  userId: doc.user_id,
  date: doc.date,
  source: doc.source,
  contentHash: doc.content_hash,
  ingestionStatus: doc.ingestion_status,
  warnings: doc.warnings ?? [],
  metrics: doc.recovery,
});
