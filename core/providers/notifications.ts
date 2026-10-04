import type { NotificationProvider } from '@/core/adapters/contracts';
import { getTelegramProvider } from '@/core/providers/telegram-notifications';
import { getWhatsAppProvider } from '@/core/providers/whatsapp-notifications';

export function getNotificationProviders(): NotificationProvider[] {
  const providers: NotificationProvider[] = [];

  const telegram = getTelegramProvider();
  if (telegram) providers.push(telegram);

  const whatsapp = getWhatsAppProvider();
  if (whatsapp) providers.push(whatsapp);

  return providers;
}
