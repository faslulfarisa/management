import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantController } from './controllers/tenant.controller';
import { PropertyController } from './controllers/property.controller';
import { DepartmentController } from './controllers/department.controller';
import { DesignationController } from './controllers/designation.controller';
import { CostCenterController } from './controllers/cost-center.controller';
import { EmploymentTypeController } from './controllers/employment-type.controller';
import { EmployeeGroupController } from './controllers/employee-group.controller';
import { TemplateController, TemplateAssignmentController, TemplateAssignmentExclusionController } from './controllers/template.controller';
import { DocumentController } from './controllers/document.controller';
import { AuditLogController } from './controllers/audit-log.controller';
import { RoleController } from './controllers/role.controller';
import { UserController } from './controllers/user.controller';
import { AreaController } from './controllers/area.controller';
import { PositionController } from './controllers/position.controller';
import { BranchController } from './controllers/branch.controller';
import { BranchTransferController } from './controllers/branch-transfer.controller';
import { BranchAnalyticsController } from './controllers/branch-analytics.controller';
import { BranchApprovalChainController } from './controllers/branch-approval-chain.controller';
import { BranchKpiController } from './controllers/branch-kpi.controller';
import { OrganizationProfileController } from './controllers/organization-profile.controller';
import { SignupOfferController } from './controllers/signup-offer.controller';
import { PublicSignupOfferController } from './controllers/public-signup-offer.controller';
import { AreaService } from './services/area.service';
import { BranchService } from './services/branch.service';
import { BranchActivationService } from './services/branch-activation.service';
import { BranchAccessService } from './services/branch-access.service';
import { BranchTransferService } from './services/branch-transfer.service';
import { BranchAnalyticsService } from './services/branch-analytics.service';
import { BranchApprovalChainService } from './services/branch-approval-chain.service';
import { BranchKpiService } from './services/branch-kpi.service';
import { PositionService } from './services/position.service';
import { TenantService } from './services/tenant.service';
import { PlatformDataService } from './services/platform-data.service';
import { PlatformDataController } from './controllers/platform-data.controller';
import { PropertyService } from './services/property.service';
import { DepartmentService } from './services/department.service';
import { DesignationService, CostCenterService, EmploymentTypeService, EmployeeGroupService } from './services/designation.service';
import { TemplateService } from './services/template.service';
import { HolidayPolicyTemplateService } from './services/holiday-policy-template.service';
import { BreakPolicyTemplateService } from './services/break-policy-template.service';
import { DocumentService } from './services/document.service';
import { AuditLogService } from './services/audit-log.service';
import { RoleService } from './services/role.service';
import { UserService } from './services/user.service';
import { OrganizationProfileService } from './services/organization-profile.service';
import { BrandingAssetService } from './services/branding-asset.service';
import { DocumentBrandingService } from './services/document-branding.service';
import { CompanyBankAccountService } from './services/company-bank-account.service';
import { DependencyCheckService } from './services/dependency-check.service';
import { DependencyCheckController } from './controllers/dependency-check.controller';
import { UserAccessService } from './services/user-access.service';
import { UserHierarchyService } from './services/user-hierarchy.service';
import { AuthorizationService } from './services/authorization.service';
import { SignupOfferService } from './services/signup-offer.service';
import { PayrollLockService } from './services/payroll-lock.service';

import { BillingModule } from '../billing/billing.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { BiometricsModule } from '../biometrics/biometrics.module';

@Module({
  imports: [forwardRef(() => AuthModule), forwardRef(() => BillingModule), forwardRef(() => ApprovalsModule), forwardRef(() => BiometricsModule)],
  controllers: [
    TenantController, PropertyController, DepartmentController,
    DesignationController, CostCenterController, EmploymentTypeController,
    EmployeeGroupController, TemplateController, TemplateAssignmentController, TemplateAssignmentExclusionController, DocumentController,
    AuditLogController, RoleController, UserController, AreaController,
    PlatformDataController, PositionController, BranchController, BranchTransferController,
    BranchAnalyticsController, BranchApprovalChainController, BranchKpiController,
    OrganizationProfileController, DependencyCheckController,
    SignupOfferController, PublicSignupOfferController,
  ],
  providers: [
    TenantService, PropertyService, DepartmentService, DesignationService,
    CostCenterService, EmploymentTypeService, EmployeeGroupService,
    TemplateService, HolidayPolicyTemplateService, BreakPolicyTemplateService, DocumentService, AuditLogService, RoleService, UserService,
    AreaService, PlatformDataService, PositionService, BranchService,
    BranchActivationService,
    BranchAccessService, BranchTransferService, BranchAnalyticsService,
    BranchApprovalChainService, BranchKpiService,
    OrganizationProfileService, BrandingAssetService,
    DocumentBrandingService, CompanyBankAccountService,
    DependencyCheckService, UserAccessService, UserHierarchyService, AuthorizationService,
    SignupOfferService, PayrollLockService,
  ],
  exports: [
    TenantService, PropertyService, DepartmentService, RoleService, UserService,
    AuditLogService, AreaService, PositionService, BranchService, BranchActivationService, BranchAccessService,
    BranchTransferService, BranchAnalyticsService, BranchApprovalChainService, BranchKpiService,
    OrganizationProfileService, BrandingAssetService, DocumentBrandingService, CompanyBankAccountService,
    TemplateService, HolidayPolicyTemplateService, BreakPolicyTemplateService, DependencyCheckService, UserAccessService, UserHierarchyService, AuthorizationService,
    SignupOfferService, PayrollLockService, DocumentService,
  ],
})
export class PlatformModule {}
