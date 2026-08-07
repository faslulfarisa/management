import { HttpException, HttpStatus } from '@nestjs/common';

export class AccountDeactivatedException extends HttpException {
  constructor(message: string, status: string) {
    super(
      {
        statusCode: HttpStatus.FORBIDDEN,
        message,
        error: 'AccountDeactivated',
        status,
      },
      HttpStatus.FORBIDDEN,
    );
  }
}
