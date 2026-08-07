import { IsIn, IsOptional, IsString, IsDateString } from 'class-validator';

const APPROVAL_ACTIONS = ['approve', 'reject', 'request_info', 'schedule_demo', 'under_discussion'];

export class TransitionApprovalDto {
  @IsIn(APPROVAL_ACTIONS)
  action: 'approve' | 'reject' | 'request_info' | 'schedule_demo' | 'under_discussion';

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  demoAt?: string;
}
