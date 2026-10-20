// In-app notifications (the header bell). Rows are per recipient; the database fans one event out to every
// user with access to the affected scope (app.notify) and adds its own for approval decisions and an
// affiliate going Live. The app sends: market data loaded, GL committed / signed off.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { repository } from '@/store/repositoryInstance';
import type { NotificationInput } from '@/store/repository';
import { sendNotification } from './notify';

export type { NotificationInput };
export { sendNotification };

export const notificationKeys = {
  mine: (userId: string) => ['inAppNotifications', userId] as const,
  all: ['inAppNotifications'] as const,
};

/** The signed-in user's notifications, newest first. Polled every minute so others' events arrive. */
export function useMyNotifications() {
  const { user } = useAuth();
  return useQuery({
    queryKey: notificationKeys.mine(user?.id ?? ''),
    queryFn: () => repository.listNotifications(user!.id),
    enabled: !!user,
    refetchInterval: 60_000,
  });
}

export function useUnreadNotificationCount(): number {
  const { data = [] } = useMyNotifications();
  return data.filter((n) => !n.read).length;
}

export function useMarkNotificationsRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => repository.markNotificationsRead(ids),
    onSuccess: () => client.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

export function useClearNotifications() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => repository.clearNotifications(ids),
    onSuccess: () => client.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

export function useSendNotification() {
  const { user } = useAuth();
  const client = useQueryClient();
  return async (input: NotificationInput) => {
    await sendNotification(input, user);
    void client.invalidateQueries({ queryKey: notificationKeys.all });
  };
}
