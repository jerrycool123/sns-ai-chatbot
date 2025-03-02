import { appSchema, modelSchema } from '@/libs/schemas';
import { WebhookRequestBody, messagingApi, validateSignature } from '@line/bot-sdk';
import { headers } from 'next/headers';
import { z } from 'zod';

import { BaseServerModel } from '../models/base';
import { BaseServerApp } from './base';

export class LineServerApp implements BaseServerApp<'line'> {
  public readonly type = 'line';

  public config: Extract<z.infer<typeof appSchema>, { type: 'line' }>;
  public request: Request;
  public model: BaseServerModel<z.infer<typeof modelSchema>['type']>;

  private body: WebhookRequestBody | null = null;

  constructor(
    config: z.infer<typeof appSchema>,
    request: Request,
    model: BaseServerModel<z.infer<typeof modelSchema>['type']>,
  ) {
    this.config = config as Extract<z.infer<typeof appSchema>, { type: 'line' }>;
    this.request = request;
    this.model = model;
  }

  public async validateWebhookRequest() {
    try {
      const rawBody = await this.request.text();
      const headersList = await headers();
      const signature = headersList.get('x-line-signature');
      if (signature === null || !validateSignature(rawBody, this.config.channelSecret, signature)) {
        return false;
      }

      this.body = JSON.parse(rawBody) as WebhookRequestBody;

      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  public async acknowledgeWebhookRequest() {
    return new Response('OK', { status: 200 });
  }

  public async processWebhookRequest() {
    if (this.body === null) {
      throw new Error('Webhook request body is not validated');
    }
    for (const event of this.body.events) {
      if (event.type === 'message') {
        const messageEvent = event;
        if (messageEvent.message.type === 'text') {
          const input = messageEvent.message.text;
          const { output } = await this.model.invoke([{ role: 'user', content: input }]);

          const client = new messagingApi.MessagingApiClient({
            channelAccessToken: this.config.channelAccessToken,
          });

          await client.replyMessage({
            replyToken: messageEvent.replyToken,
            messages: [
              {
                type: 'text',
                text: output,
              },
            ],
          });
          return output;
        }
      }
    }
    return null;
  }
}
