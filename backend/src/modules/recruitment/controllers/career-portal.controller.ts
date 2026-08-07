import {
  BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CareerPortalService } from '../services/career-portal.service';
import { OfferService } from '../services/offer.service';
import { PreboardingService } from '../services/preboarding.service';
import { CandidateDeclineOfferDto, CandidateNegotiationDto } from '../dto/offer.dto';
import { AcceptNdaDto, SubmitBankDetailsDto, SubmitEmergencyContactDto } from '../dto/preboarding.dto';

/**
 * Public Career Portal — no auth guards anywhere in this controller.
 * Candidates never get HRMS access; this is the entire surface they touch.
 * Every endpoint is throttled since it's open to the internet.
 */
@ApiTags('Career Portal (Public)')
@Controller('public/career')
export class CareerPortalController {
  constructor(
    private readonly careerPortal: CareerPortalService,
    private readonly offers: OfferService,
    private readonly preboarding: PreboardingService,
  ) {}

  @Get(':slug/jobs')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async listJobs(@Param('slug') slug: string, @Query() query: any) {
    const tenant = await this.careerPortal.resolveTenant(slug);
    const data = await this.careerPortal.listJobs(tenant.id, { q: query.q, departmentId: query.department_id });
    return { success: true, data: { organization: tenant, jobs: data }, error: null };
  }

  @Get(':slug/jobs/:idOrToken')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async getJob(@Param('slug') slug: string, @Param('idOrToken') idOrToken: string) {
    const tenant = await this.careerPortal.resolveTenant(slug);
    const data = await this.careerPortal.getJob(tenant.id, idOrToken);
    return { success: true, data: { organization: tenant, job: data }, error: null };
  }

  @Post(':slug/jobs/:idOrToken/apply')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { resume: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('resume', { limits: { fileSize: 25 * 1024 * 1024 } }))
  async apply(
    @Param('slug') slug: string,
    @Param('idOrToken') idOrToken: string,
    @Body() body: any,
    @UploadedFile() resume?: Express.Multer.File,
  ) {
    if (!body.first_name || !body.last_name || !body.email) {
      throw new BadRequestException('first_name, last_name, and email are required');
    }
    const tenant = await this.careerPortal.resolveTenant(slug);
    const data = await this.careerPortal.apply(
      tenant.id,
      idOrToken,
      {
        first_name: body.first_name, last_name: body.last_name, email: body.email, phone: body.phone,
        current_company: body.current_company, current_designation: body.current_designation,
        experience_years: body.experience_years ? parseFloat(body.experience_years) : undefined,
        expected_salary: body.expected_salary ? parseFloat(body.expected_salary) : undefined,
        source: body.source,
        cover_note: body.cover_note,
      },
      resume ? { buffer: resume.buffer, mimetype: resume.mimetype, originalname: resume.originalname } : undefined,
      body.campaign_id || undefined,
    );
    return { success: true, data, error: null };
  }

  @Get(':slug/applications/:applicationId')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async getApplicationStatus(@Param('slug') slug: string, @Param('applicationId') applicationId: string, @Query('email') email: string) {
    if (!email) throw new BadRequestException('email is required');
    const tenant = await this.careerPortal.resolveTenant(slug);
    const data = await this.careerPortal.getApplicationStatus(tenant.id, applicationId, email);
    return { success: true, data, error: null };
  }

  // ── Offers (view/accept/decline/negotiate — email-matched, no login) ──
  @Get(':slug/offers/:offerId')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async getOffer(@Param('slug') slug: string, @Param('offerId') offerId: string, @Query('email') email: string) {
    if (!email) throw new BadRequestException('email is required');
    const tenant = await this.careerPortal.resolveTenant(slug);
    const data = await this.offers.getForCandidate(tenant.id, offerId, email);
    return { success: true, data, error: null };
  }

  @Post(':slug/offers/:offerId/accept')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async acceptOffer(@Param('slug') slug: string, @Param('offerId') offerId: string, @Body('email') email: string) {
    if (!email) throw new BadRequestException('email is required');
    const tenant = await this.careerPortal.resolveTenant(slug);
    const data = await this.offers.acceptByCandidate(tenant.id, offerId, email);
    return { success: true, data, error: null };
  }

  @Post(':slug/offers/:offerId/decline')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async declineOffer(@Param('slug') slug: string, @Param('offerId') offerId: string, @Body() body: CandidateDeclineOfferDto) {
    const tenant = await this.careerPortal.resolveTenant(slug);
    const data = await this.offers.declineByCandidate(tenant.id, offerId, body.email, body.reason);
    return { success: true, data, error: null };
  }

  @Post(':slug/offers/:offerId/negotiate')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async negotiateOffer(@Param('slug') slug: string, @Param('offerId') offerId: string, @Body() body: CandidateNegotiationDto) {
    const tenant = await this.careerPortal.resolveTenant(slug);
    const data = await this.offers.addNegotiationByCandidate(tenant.id, offerId, body.email, body);
    return { success: true, data, error: null };
  }

  // ── Preboarding (email-matched, no login) ─────────────────────────────
  @Get(':slug/applications/:applicationId/preboarding')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async getPreboarding(@Param('slug') slug: string, @Param('applicationId') applicationId: string, @Query('email') email: string) {
    if (!email) throw new BadRequestException('email is required');
    const tenant = await this.careerPortal.resolveTenant(slug);
    const data = await this.preboarding.getForCandidate(applicationId, tenant.id, email);
    return { success: true, data, error: null };
  }

  @Post(':slug/applications/:applicationId/preboarding/bank-details')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async submitBankDetails(@Param('slug') slug: string, @Param('applicationId') applicationId: string, @Body() body: SubmitBankDetailsDto) {
    const tenant = await this.careerPortal.resolveTenant(slug);
    const { email, ...details } = body;
    const data = await this.preboarding.submitBankDetails(applicationId, tenant.id, email, details);
    return { success: true, data, error: null };
  }

  @Post(':slug/applications/:applicationId/preboarding/emergency-contact')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async submitEmergencyContact(@Param('slug') slug: string, @Param('applicationId') applicationId: string, @Body() body: SubmitEmergencyContactDto) {
    const tenant = await this.careerPortal.resolveTenant(slug);
    const { email, ...contact } = body;
    const data = await this.preboarding.submitEmergencyContact(applicationId, tenant.id, email, contact);
    return { success: true, data, error: null };
  }

  @Post(':slug/applications/:applicationId/preboarding/accept-nda')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async acceptNda(@Param('slug') slug: string, @Param('applicationId') applicationId: string, @Body() body: AcceptNdaDto, @Req() req: any) {
    const tenant = await this.careerPortal.resolveTenant(slug);
    const data = await this.preboarding.acceptNda(applicationId, tenant.id, body.email, req.ip);
    return { success: true, data, error: null };
  }

  @Post(':slug/applications/:applicationId/preboarding/documents')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, email: { type: 'string' } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  async uploadPreboardingDocument(
    @Param('slug') slug: string,
    @Param('applicationId') applicationId: string,
    @Body('email') email: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!email) throw new BadRequestException('email is required');
    if (!file) throw new BadRequestException('file is required');
    const tenant = await this.careerPortal.resolveTenant(slug);
    const data = await this.preboarding.uploadDocumentFromCandidate(applicationId, tenant.id, email, {
      buffer: file.buffer, mimetype: file.mimetype, originalname: file.originalname,
    });
    return { success: true, data, error: null };
  }
}
