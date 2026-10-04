import type { NotificationProvider } from '@/core/adapters/contracts';
import type { AlertEvent } from '@/core/domain/trading';

export class WhatsAppNotificationProvider implements NotificationProvider {
  readonly id = 'whatsapp-cloud';

  constructor(
    private readonly accessToken: string,
    private readonly phoneNumberId: string,
    private readonly recipient: string,
    private readonly graphVersion: string,
  ) {}

  async send(event: AlertEvent): Promise<void> {
    const text = `[${event.severity}] ${event.title}\n${event.message}`;
    const response = await fetch(
      `https://graph.facebook.com/${this.graphVersion}/${encodeURIComponent(this.phoneNumberId)}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: this.recipient,
          type: 'text',
          text: { body: text, preview_url: false },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`WhatsApp notification error: HTTP ${response.status}`);
    }
  }
}

export function getWhatsAppProvider(): WhatsAppNotificationProvider | null {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const recipient = process.env.WHATSAPP_RECIPIENT?.trim();
  const graphVersion = process.env.WHATSAPP_GRAPH_VERSION?.trim();

  if (!accessToken || !phoneNumberId || !recipient || !graphVersion) return null;
  return new WhatsAppNotificationProvider(accessToken, phoneNumberId, recipient, graphVersion);
}
