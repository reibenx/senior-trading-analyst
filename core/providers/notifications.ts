import type { NotificationProvider } from '@/core/adapters/contracts';
import { getTelegramProvider } from '@/core/providers/telegram-notifications';

export function getNotificationProviders(): NotificationProvider[] {
  const providers: NotificationProvider[] = [];
  const telegram = getTelegramProvider();
  if (telegram) providers.push(telegram);
  return providers;
}
