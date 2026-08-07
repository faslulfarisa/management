import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { DatabaseService } from '../../../shared/database.service';
import { PunchEventDto } from '../dto/punch-event.dto';

export interface NormalizedGps {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  recordedAt?: Date;
}

export interface GeofenceResult {
  checked: boolean;
  withinFence: boolean | null;
  distanceMeters?: number;
  radiusMeters?: number;
  branchId?: string | null;
}

@Injectable()
export class PunchValidationService {
  constructor(private readonly db: DatabaseService) {}

  normalizeGps(gps?: any): NormalizedGps | undefined {
    if (!gps) return undefined;

    const latitude = Number(gps.latitude);
    const longitude = Number(gps.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new BadRequestException('GPS latitude must be between -90 and 90');
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new BadRequestException('GPS longitude must be between -180 and 180');
    }

    const accuracyMeters = gps.accuracyMeters === undefined ? undefined : Number(gps.accuracyMeters);
    if (accuracyMeters !== undefined && (!Number.isFinite(accuracyMeters) || accuracyMeters < 0 || accuracyMeters > 10_000)) {
      throw new BadRequestException('GPS accuracy must be a positive distance in meters');
    }

    const recordedAt = gps.recordedAt ? new Date(gps.recordedAt) : undefined;
    if (recordedAt && isNaN(recordedAt.getTime())) {
      throw new BadRequestException('GPS recordedAt must be a valid ISO timestamp');
    }

    return {
      latitude,
      longitude,
      accuracyMeters,
      recordedAt,
    };
  }

  normalizePhoto(photo?: any): PunchEventDto['photo'] | undefined {
    if (!photo) return undefined;
    const normalized = {
      url: this.cleanString(photo.url),
      objectKey: this.cleanString(photo.objectKey),
      sha256: this.cleanString(photo.sha256),
      capturedAt: photo.capturedAt ? new Date(photo.capturedAt) : undefined,
    };

    if (!normalized.url && !normalized.objectKey && !normalized.sha256) {
      throw new BadRequestException('Photo must include url, objectKey, or sha256');
    }
    if (normalized.capturedAt && isNaN(normalized.capturedAt.getTime())) {
      throw new BadRequestException('Photo capturedAt must be a valid ISO timestamp');
    }

    return normalized;
  }

  async validateEmployeeGeofence(
    tenantId: string,
    employeeId: string,
    gps?: NormalizedGps,
  ): Promise<GeofenceResult> {
    const { rows } = await this.db.query(
      `SELECT e.branch_id,
              b.geo_lat,
              b.geo_lng,
              b.geofence_radius_meters
       FROM employees e
       LEFT JOIN branches b
         ON b.id = e.branch_id
        AND b.tenant_id = e.tenant_id
        AND b.deleted_at IS NULL
       WHERE e.id = $1
         AND e.tenant_id = $2
         AND e.deleted_at IS NULL`,
      [employeeId, tenantId],
    );

    const row = rows[0];
    if (!row) throw new BadRequestException('Employee not found for geofence validation');

    return this.validateBranchGeofence(row.branch_id, row.geo_lat, row.geo_lng, row.geofence_radius_meters, gps);
  }

  async validateTerminalGeofence(
    terminal: Record<string, unknown>,
    gps?: NormalizedGps,
  ): Promise<GeofenceResult> {
    const branchId = terminal['branch_id'] as string | null | undefined;
    if (!branchId) return { checked: false, withinFence: null, branchId: null };

    const { rows } = await this.db.query(
      `SELECT geo_lat, geo_lng, geofence_radius_meters
       FROM branches
       WHERE id = $1
         AND tenant_id = $2
         AND deleted_at IS NULL`,
      [branchId, terminal['tenant_id']],
    );
    const row = rows[0];
    if (!row) return { checked: false, withinFence: null, branchId };

    return this.validateBranchGeofence(branchId, row.geo_lat, row.geo_lng, row.geofence_radius_meters, gps);
  }

  async validateTrustedUserDevice(userId: string, rawToken?: string): Promise<boolean> {
    if (!rawToken) return false;

    const { rows } = await this.db.query(
      `SELECT id
       FROM trusted_devices
       WHERE user_id = $1
         AND device_hash = $2
         AND revoked_at IS NULL
         AND expires_at > NOW()
       LIMIT 1`,
      [userId, createHash('sha256').update(rawToken).digest('hex')],
    );

    if (!rows[0]) throw new UnauthorizedException('Invalid or expired device token');
    await this.db.query('UPDATE trusted_devices SET last_used_at = NOW() WHERE id = $1', [rows[0].id]);
    return true;
  }

  private validateBranchGeofence(
    branchId: string | null,
    branchLat: unknown,
    branchLng: unknown,
    radius: unknown,
    gps?: NormalizedGps,
  ): GeofenceResult {
    if (branchLat === null || branchLng === null || branchLat === undefined || branchLng === undefined) {
      return { checked: false, withinFence: null, branchId };
    }
    if (!gps) {
      throw new BadRequestException('GPS location is required for this branch geofence');
    }

    const branchLatitude = Number(branchLat);
    const branchLongitude = Number(branchLng);
    const radiusMeters = Number(radius ?? 200);
    const distanceMeters = this.distanceMeters(gps.latitude, gps.longitude, branchLatitude, branchLongitude);
    const withinFence = distanceMeters <= radiusMeters;
    if (!withinFence) {
      throw new BadRequestException(`Punch location is outside the branch geofence (${Math.round(distanceMeters)}m > ${radiusMeters}m)`);
    }

    return {
      checked: true,
      withinFence,
      distanceMeters,
      radiusMeters,
      branchId,
    };
  }

  private distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const earthRadiusMeters = 6_371_000;
    const toRadians = (value: number) => (value * Math.PI) / 180;
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private cleanString(value?: string): string | undefined {
    const trimmed = String(value ?? '').trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
}
