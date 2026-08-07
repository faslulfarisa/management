import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlatformModule } from '../platform/platform.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { HrModule } from '../hr/hr.module';
import { RecruitmentController } from './controllers/recruitment.controller';
import { VacancyController } from './controllers/vacancy.controller';
import { JobDescriptionController } from './controllers/job-description.controller';
import { ApplicationController } from './controllers/application.controller';
import { CareerPortalController } from './controllers/career-portal.controller';
import { PipelineStageController } from './controllers/pipeline-stage.controller';
import { InterviewController } from './controllers/interview.controller';
import { CommunicationController } from './controllers/communication.controller';
import { OfferController } from './controllers/offer.controller';
import { ProbationController } from './controllers/probation.controller';
import { WorkforcePlanController } from './controllers/workforce-plan.controller';
import { CampaignController } from './controllers/campaign.controller';
import { RecruitmentService } from './services/recruitment.service';
import { VacancyService } from './services/vacancy.service';
import { VacancyApprovalService } from './services/vacancy-approval.service';
import { VacancyCommentService } from './services/vacancy-comment.service';
import { JobDescriptionService } from './services/job-description.service';
import { JobDescriptionApprovalService } from './services/job-description-approval.service';
import { JobPublishingService } from './services/job-publishing.service';
import { CandidateService } from './services/candidate.service';
import { ApplicationService } from './services/application.service';
import { CareerPortalService } from './services/career-portal.service';
import { PipelineStageService } from './services/pipeline-stage.service';
import { ScreeningService } from './services/screening.service';
import { AssessmentService } from './services/assessment.service';
import { InterviewService } from './services/interview.service';
import { EvaluationService } from './services/evaluation.service';
import { CommunicationService } from './services/communication.service';
import { VerificationService } from './services/verification.service';
import { OfferService } from './services/offer.service';
import { OfferApprovalService } from './services/offer-approval.service';
import { PreboardingService } from './services/preboarding.service';
import { EmployeeConversionService } from './services/employee-conversion.service';
import { ProbationService } from './services/probation.service';
import { ProbationApprovalService } from './services/probation-approval.service';
import { WorkforcePlanService } from './services/workforce-plan.service';
import { WorkforcePlanApprovalService } from './services/workforce-plan-approval.service';
import { CampaignService } from './services/campaign.service';
import { RecruitmentDashboardService } from './services/recruitment-dashboard.service';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => HrModule),
    PlatformModule,
    ApprovalsModule,
    NotificationsModule,
  ],
  controllers: [
    RecruitmentController, VacancyController, JobDescriptionController,
    ApplicationController, CareerPortalController, PipelineStageController,
    InterviewController, CommunicationController, OfferController, ProbationController,
    WorkforcePlanController, CampaignController,
  ],
  providers: [
    RecruitmentService, VacancyService, VacancyApprovalService, VacancyCommentService,
    JobDescriptionService, JobDescriptionApprovalService, JobPublishingService,
    CandidateService, ApplicationService, CareerPortalService,
    PipelineStageService, ScreeningService, AssessmentService, InterviewService,
    EvaluationService, CommunicationService, VerificationService, OfferService, OfferApprovalService,
    PreboardingService, EmployeeConversionService, ProbationService, ProbationApprovalService,
    WorkforcePlanService, WorkforcePlanApprovalService, CampaignService, RecruitmentDashboardService,
  ],
  exports: [RecruitmentService, VacancyService, CandidateService, ApplicationService, InterviewService, OfferService],
})
export class RecruitmentModule {}
