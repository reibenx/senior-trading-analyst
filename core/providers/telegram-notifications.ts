import type { NotificationProvider } from '@/core/adapters/contracts';
import type { AlertEvent } from '@/core/domain/trading';

function formatAlert(event: AlertEvent): string {
  const icon = event.severity === 'CRITICAL' ? '🚨' : event.severity === 'ACTION' ? '⚠️' : event.severity === 'OPPORTUNITY' ? '🎯' : 'ℹ️';
  return `${icon} ${event.title}\n\n${event.message}\n\n${event.symbol} · ${event.severity}`;
}

export class TelegramNotificationProvider implements NotificationProvider {
  readonly id = 'telegram';

  constructor(
    private readonly botToken: string,
    private readonly chatId: string,
  ) {
    if (!botToken || !chatId) throw new Error('Telegram configuration is incomplete');
  }

  async send(event: AlertEvent): Promise<void> {
    const response = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: this.chatId,
        text: formatAlert(event),
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Telegram HTTP ${response.status}`);
    }
  }
}

export function getTelegramProvider(): TelegramNotificationProvider | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return null;
  return new TelegramNotificationProvider(token, chatId);
}
