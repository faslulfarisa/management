import { HttpException } from '@nestjs/common';

const HTTP_STATUS_LOCKED = 423;

export class AccountLockedException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HTTP_STATUS_LOCKED,
        message:
          'Your account has been temporarily locked due to multiple failed login attempts. Please contact your administrator for account reactivation.',
        error: 'Locked',
      },
      HTTP_STATUS_LOCKED,
    );
  }
}
