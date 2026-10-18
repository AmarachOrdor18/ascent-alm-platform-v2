// Plain (non-React) sender for in-app notifications - usable from ingestion and other library code.
import { repository } from '@/store/repositoryInstance';
import type { NotificationInput } from '@/store/repository';

/**
 * Tell the users of a scope that something happened (fan-out and "not the sender" are done by the store).
 * Never throws: a notification that cannot be sent must not fail the action it reports.
 */
export async function sendNotification(input: NotificationInput, sender: { id: string } | null): Promise<void> {
  try {
    await repository.sendNotification(input, sender);
  } catch {
    /* best effort */
  }
}
