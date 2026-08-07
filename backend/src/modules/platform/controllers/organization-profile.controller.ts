import {
  Controller, Get, Post, Patch, Put, Delete,
  Body, Param, Req, UseGuards, UseInterceptors,
  UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OrganizationProfileService } from '../services/organization-profile.service';
import { BrandingAssetService } from '../services/branding-asset.service';
import { DocumentBrandingService } from '../services/document-branding.service';
import { CompanyBankAccountService } from '../services/company-bank-account.service';

@ApiTags('Organization Profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('organization/profile')
export class OrganizationProfileController {
  constructor(
    private readonly profileService: OrganizationProfileService,
    private readonly brandingAssetService: BrandingAssetService,
    private readonly documentBrandingService: DocumentBrandingService,
    private readonly bankAccountService: CompanyBankAccountService,
  ) {}

  // ── Core Profile ──────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Get full organization profile' })
  async getProfile(@Req() req: any) {
    const data = await this.profileService.getProfile(req.user.tenantId);
    return { success: true, data, meta: null, error: null };
  }

  @Patch('core')
  @ApiOperation({ summary: 'Update core business information (name, legal name, GST, etc.)' })
  async updateCoreInfo(@Req() req: any, @Body() body: any) {
    const data = await this.profileService.updateCoreInfo(
      req.user.tenantId,
      req.user.sub,
      body,
      { ipAddress: req.ip, userAgent: req.headers['user-agent'] },
      !!req.user.isSuperAdmin,
    );
    return { success: true, data, meta: null, error: null };
  }

  @Patch('contact')
  @ApiOperation({ summary: 'Update contact information (emails, phones, website)' })
  async updateContactInfo(@Req() req: any, @Body() body: any) {
    const data = await this.profileService.updateContactInfo(
      req.user.tenantId,
      req.user.sub,
      body,
      { ipAddress: req.ip, userAgent: req.headers['user-agent'] },
    );
    return { success: true, data, meta: null, error: null };
  }

  @Patch('addresses')
  @ApiOperation({ summary: 'Update registered and operational addresses' })
  async updateAddresses(@Req() req: any, @Body() body: any) {
    const data = await this.profileService.updateAddresses(
      req.user.tenantId,
      req.user.sub,
      body,
      { ipAddress: req.ip, userAgent: req.headers['user-agent'] },
    );
    return { success: true, data, meta: null, error: null };
  }

  @Patch('operations')
  @ApiOperation({ summary: 'Update operational config (timezone, currency, date format, work week)' })
  async updateOperationalConfig(@Req() req: any, @Body() body: any) {
    const data = await this.profileService.updateOperationalConfig(
      req.user.tenantId,
      req.user.sub,
      body,
      { ipAddress: req.ip, userAgent: req.headers['user-agent'] },
    );
    return { success: true, data, meta: null, error: null };
  }

  @Patch('security')
  @ApiOperation({ summary: 'Update account security config (e.g. max failed login attempts before lockout)' })
  async updateSecurityConfig(@Req() req: any, @Body() body: any) {
    const data = await this.profileService.updateSecurityConfig(
      req.user.tenantId,
      req.user.sub,
      body,
      { ipAddress: req.ip, userAgent: req.headers['user-agent'] },
    );
    return { success: true, data, meta: null, error: null };
  }

  // ── Branding Assets ───────────────────────────────────────────────────────

  @Get('branding/assets')
  @ApiOperation({ summary: 'Get all active branding assets keyed by type' })
  async getBrandingAssets(@Req() req: any) {
    const data = await this.brandingAssetService.getAssets(req.user.tenantId);
    return { success: true, data, meta: null, error: null };
  }

  @Post('branding/assets/:type')
  @ApiOperation({
    summary: 'Upload a branding asset',
    description: 'type: primary_logo | dark_logo | favicon | invoice_logo | payslip_logo | report_logo | seal',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadBrandingAsset(
    @Req() req: any,
    @Param('type') assetType: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded — send a multipart/form-data request with field "file"');
    const data = await this.brandingAssetService.uploadAsset(
      req.user.tenantId,
      req.user.sub,
      assetType,
      { buffer: file.buffer, mimetype: file.mimetype, originalname: file.originalname, size: file.size },
      { ipAddress: req.ip, userAgent: req.headers['user-agent'] },
    );
    return { success: true, data, meta: null, error: null };
  }

  @Delete('branding/assets/:id')
  @ApiOperation({ summary: 'Delete a branding asset (soft delete + storage cleanup)' })
  async deleteBrandingAsset(@Req() req: any, @Param('id') assetId: string) {
    const data = await this.brandingAssetService.deleteAsset(
      req.user.tenantId,
      req.user.sub,
      assetId,
      { ipAddress: req.ip, userAgent: req.headers['user-agent'] },
    );
    return { success: true, data, meta: null, error: null };
  }

  // ── Document Branding Config ──────────────────────────────────────────────

  @Get('branding/documents')
  @ApiOperation({ summary: 'Get all document branding configs for this tenant' })
  async getDocumentConfigs(@Req() req: any) {
    const data = await this.documentBrandingService.getAllConfigs(req.user.tenantId);
    return { success: true, data, meta: null, error: null };
  }

  @Put('branding/documents')
  @ApiOperation({
    summary: 'Upsert document branding config',
    description: 'Creates or updates config for a given documentType + optional branchId',
  })
  async upsertDocumentConfig(@Req() req: any, @Body() body: any) {
    const data = await this.documentBrandingService.upsertConfig(
      req.user.tenantId,
      req.user.sub,
      body,
      { ipAddress: req.ip, userAgent: req.headers['user-agent'] },
    );
    return { success: true, data, meta: null, error: null };
  }

  // ── Bank Accounts ─────────────────────────────────────────────────────────

  @Get('bank-accounts')
  @ApiOperation({ summary: 'List company bank accounts (account numbers masked to last 4)' })
  async getBankAccounts(@Req() req: any) {
    const data = await this.bankAccountService.findAll(req.user.tenantId);
    return { success: true, data, meta: null, error: null };
  }

  @Post('bank-accounts')
  @ApiOperation({ summary: 'Add a company bank account' })
  async createBankAccount(@Req() req: any, @Body() body: any) {
    const data = await this.bankAccountService.create(
      req.user.tenantId,
      req.user.sub,
      body,
      { ipAddress: req.ip, userAgent: req.headers['user-agent'] },
    );
    return { success: true, data, meta: null, error: null };
  }

  @Patch('bank-accounts/:id')
  @ApiOperation({ summary: 'Update a company bank account' })
  async updateBankAccount(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const data = await this.bankAccountService.update(
      req.user.tenantId,
      req.user.sub,
      id,
      body,
      { ipAddress: req.ip, userAgent: req.headers['user-agent'] },
    );
    return { success: true, data, meta: null, error: null };
  }

  @Delete('bank-accounts/:id')
  @ApiOperation({ summary: 'Delete a company bank account (soft delete)' })
  async deleteBankAccount(@Req() req: any, @Param('id') id: string) {
    const data = await this.bankAccountService.remove(
      req.user.tenantId,
      req.user.sub,
      id,
      { ipAddress: req.ip, userAgent: req.headers['user-agent'] },
    );
    return { success: true, data, meta: null, error: null };
  }
}
