import {
  Controller, Post, Req, HttpCode, HttpStatus, UnauthorizedException, Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import * as crypto from 'crypto';
import { PayrollPaymentService } from '../services/payroll-payment.service';

/** Maps Razorpay payout event names to internal payment statuses */
const RAZORPAY_EVENT_STATUS_MAP: Record<string, 'processing' | 'paid' | 'failed' | 'reversed'> = {
  'payout.initiated': 'processing',
  'payout.processed': 'paid',
  'payout.reversed': 'reversed',
  'payout.failed': 'failed',
  'payout.rejected': 'failed',
};

@ApiTags('Webhooks')
@Controller('payroll')
export class RazorpayWebhookController {
  private readonly logger = new Logger(RazorpayWebhookController.name);

  constructor(private readonly paymentService: PayrollPaymentService) {}

  @Post('webhooks/razorpay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Razorpay payout webhook receiver' })
  async handleWebhook(@Req() req: any): Promise<{ received: boolean }> {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? '';
    const signature = req.headers['x-razorpay-signature'] as string | undefined;
    const rawBody: Buffer | undefined = req.rawBody;

    if (secret && signature) {
      const bodyStr = rawBody?.toString('utf-8') ?? JSON.stringify(req.body);
      if (!this.verifySignature(bodyStr, signature, secret)) {
        throw new UnauthorizedException('Invalid Razorpay webhook signature');
      }
    }

    const event = req.body as { event?: string; payload?: any };
    const eventName = event?.event;

    if (!eventName) {
      this.logger.warn('Received Razorpay webhook with no event field');
      return { received: true };
    }

    const newStatus = RAZORPAY_EVENT_STATUS_MAP[eventName];
    if (!newStatus) {
      this.logger.debug(`Ignoring unhandled Razorpay event: ${eventName}`);
      return { received: true };
    }

    const payout = event.payload?.payout?.entity;
    if (!payout?.id) {
      this.logger.warn(`Razorpay ${eventName} event missing payload.payout.entity.id`);
      return { received: true };
    }

    this.logger.log(`Razorpay webhook: ${eventName} for payout ${payout.id}`);

    try {
      await this.paymentService.handleGatewayEvent(payout.id, newStatus, {
        razorpay_event: eventName,
        payout_id: payout.id,
        payout_status: payout.status,
        description: payout.failure_reason ?? payout.error?.description ?? null,
        gateway_response: payout,
      });
    } catch (err: any) {
      // Log but do not return a non-2xx — Razorpay retries on error responses
      this.logger.error(`Error processing Razorpay webhook ${eventName} for ${payout.id}: ${err.message}`);
    }

    return { received: true };
  }

  private verifySignature(body: string, signature: string, secret: string): boolean {
    try {
      const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
      return crypto.timingSafeEqual(
        Buffer.from(expected, 'hex'),
        Buffer.from(signature, 'hex'),
      );
    } catch {
      return false;
    }
  }
}
