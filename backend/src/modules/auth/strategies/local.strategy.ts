import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../auth.service';
import { detectPortalFromRequest, PortalKind } from '../../../shared/portal-host.util';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({ usernameField: 'email', passReqToCallback: true });
  }

  async validate(req: Request, email: string, password: string): Promise<any> {
    const portal = detectPortalFromRequest(req, req.body?.portal as PortalKind | undefined);
    (req as any).resolvedPortal = portal;

    const user = await this.authService.validateUser(
      email,
      password,
      req.ip,
      req.headers['user-agent'] as string,
      portal,
    );
    if (!user) throw new UnauthorizedException('Invalid credentials');
    return user;
  }
}
