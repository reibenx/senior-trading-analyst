import type { NotificationProvider } from '@/core/adapters/contracts';
import type { AlertEvent } from '@/core/domain/trading';

function graphEndpoint(graphVersion: string, phoneNumberId: string) {
  return `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(phoneNumberId)}/messages`;
}

export class WhatsAppNotificationProvider implements NotificationProvider {
  readonly id = 'whatsapp-cloud';

  constructor(
    private readonly accessToken: string,
    private readonly phoneNumberId: string,
    private readonly recipient: string,
    private readonly graphVersion: string,
    private readonly dailyTemplateName?: string,
    private readonly dailyTemplateLanguage = 'es_AR',
  ) {}

  private async post(body: Record<string, unknown>): Promise<void> {
    const response = await fetch(
      graphEndpoint(this.graphVersion, this.phoneNumberId),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12_000),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`WhatsApp notification error: HTTP ${response.status}${detail ? ` · ${detail.slice(0, 280)}` : ''}`);
    }
  }

  async send(event: AlertEvent): Promise<void> {
    const text = `[${event.severity}] ${event.title}\n${event.message}`;
    await this.sendText(text);
  }

  async sendText(text: string): Promise<void> {
    await this.post({
      messaging_product: 'whatsapp',
      to: this.recipient,
      type: 'text',
      text: { body: text.slice(0, 4096), preview_url: false },
    });
  }

  async sendDailyReport(report: string): Promise<void> {
    if (!this.dailyTemplateName) {
      await this.sendText(report);
      return;
    }

    await this.post({
      messaging_product: 'whatsapp',
      to: this.recipient,
      type: 'template',
      template: {
        name: this.dailyTemplateName,
        language: { code: this.dailyTemplateLanguage },
        components: [{
          type: 'body',
          parameters: [{
            type: 'text',
            text: report.slice(0, 3900),
          }],
        }],
      },
    });
  }

  get dailyTemplateConfigured() {
    return Boolean(this.dailyTemplateName);
  }
}

export function getWhatsAppProvider(): WhatsAppNotificationProvider | null {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const recipient = process.env.WHATSAPP_RECIPIENT?.trim();
  const graphVersion = process.env.WHATSAPP_GRAPH_VERSION?.trim();

  if (!accessToken || !phoneNumberId || !recipient || !graphVersion) return null;
  return new WhatsAppNotificationProvider(
    accessToken,
    phoneNumberId,
    recipient,
    graphVersion,
    process.env.WHATSAPP_DAILY_TEMPLATE_NAME?.trim(),
    process.env.WHATSAPP_DAILY_TEMPLATE_LANGUAGE?.trim() || 'es_AR',
  );
}

export function getWhatsAppConfigurationStatus() {
  const required = [
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_RECIPIENT',
    'WHATSAPP_GRAPH_VERSION',
  ] as const;
  const missing = required.filter((name) => !process.env[name]?.trim());
  const templateName = process.env.WHATSAPP_DAILY_TEMPLATE_NAME?.trim();

  return {
    ready: missing.length === 0,
    missing,
    dailyReportReady: missing.length === 0 && Boolean(templateName),
    dailyTemplateConfigured: Boolean(templateName),
  };
}
