import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../shared/database.service';

@Injectable()
export class TenantResolverMiddleware implements NestMiddleware {
  constructor(
    private jwtService: JwtService,
    private db: DatabaseService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return next();

    const token = authHeader.split(' ')[1];
    if (!token) return next();

    try {
      const payload = this.jwtService.verify(token);
      const { rows } = await this.db.query(
        'SELECT * FROM tenants WHERE id = $1 AND deleted_at IS NULL',
        [payload.tenant_id],
      );

      if (!rows.length) throw new ForbiddenException('Tenant not found');
      if (rows[0].status === 'suspended') throw new ForbiddenException('Tenant is suspended');

      (req as any).tenant = rows[0];
    } catch {
      // Skip if token is invalid — let auth guard handle it
    }

    next();
  }
}
