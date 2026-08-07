import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const result = (await super.canActivate(context)) as boolean;
    return result;
  }

  handleRequest(err: any, user: any, info: any) {
    if (err) throw err;
    if (info instanceof Error) throw info;
    if (!user) throw new UnauthorizedException('Invalid credentials');
    return user;
  }
}
