import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class SubmitKnowledgeTransferDto {
  @IsOptional() @IsString() handover_to?: string;
  @IsOptional() @IsString() responsibilities?: string;
  @IsOptional() @IsString() current_projects?: string;
  @IsOptional() @IsString() pending_tasks?: string;
  @IsOptional() @IsString() client_information?: string;
  @IsOptional() @IsString() system_access?: string;
}

export class ReviewKnowledgeTransferDto {
  @IsBoolean() approved!: boolean;
  @IsOptional() @IsString() remarks?: string;
}
