import { HttpException, HttpStatus } from '@nestjs/common';

export class MfaLockedException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message:
          'Too many failed verification attempts. Please try again in 5 minutes.',
        error: 'MfaLocked',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
