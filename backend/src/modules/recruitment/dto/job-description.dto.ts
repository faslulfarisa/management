import {
  IsArray, IsBoolean, IsObject, IsOptional, IsString, MinLength,
} from 'class-validator';

export class CreateJobDescriptionDto {
  @IsString() @MinLength(2) title!: string;
  @IsOptional() @IsString() vacancy_id?: string;
  @IsOptional() @IsString() summary?: string;
  @IsOptional() @IsString() responsibilities?: string;
  @IsOptional() @IsArray() kras?: any[];
  @IsOptional() @IsArray() kpis?: any[];
  @IsOptional() @IsArray() skills?: any[];
  @IsOptional() @IsArray() competencies?: any[];
  @IsOptional() @IsArray() benefits?: any[];
  @IsOptional() @IsString() qualifications?: string;
  @IsOptional() @IsString() certifications?: string;
  @IsOptional() @IsString() work_location?: string;
  @IsOptional() @IsBoolean() is_template?: boolean;
  @IsOptional() @IsString() template_name?: string;
}

export class UpdateJobDescriptionDto {
  @IsOptional() @IsString() @MinLength(2) title?: string;
  @IsOptional() @IsString() vacancy_id?: string;
  @IsOptional() @IsString() summary?: string;
  @IsOptional() @IsString() responsibilities?: string;
  @IsOptional() @IsArray() kras?: any[];
  @IsOptional() @IsArray() kpis?: any[];
  @IsOptional() @IsArray() skills?: any[];
  @IsOptional() @IsArray() competencies?: any[];
  @IsOptional() @IsArray() benefits?: any[];
  @IsOptional() @IsString() qualifications?: string;
  @IsOptional() @IsString() certifications?: string;
  @IsOptional() @IsString() work_location?: string;
  @IsOptional() @IsBoolean() is_template?: boolean;
  @IsOptional() @IsString() template_name?: string;
  @IsOptional() @IsString() change_note?: string;
}

export class ApproveJobDescriptionDto {
  @IsString() @MinLength(5) reason!: string;
  @IsOptional() @IsString() remarks?: string;
}

export class RejectJobDescriptionDto {
  @IsString() @MinLength(5) reason!: string;
}

export class PublishJobPostingDto {
  @IsOptional() @IsString() provider?: string;
  @IsOptional() @IsString() visibility?: 'public' | 'unlisted';
  @IsOptional() @IsString() closes_at?: string;
}
