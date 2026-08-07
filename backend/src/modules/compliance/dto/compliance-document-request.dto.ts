import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateDocumentRequestDto {
  @IsString() employee_id!: string;
  @IsOptional() @IsString() category_id?: string;
  @IsString() @MinLength(2) title!: string;
  @IsOptional() @IsString() instructions?: string;
  @IsOptional() @IsDateString() due_date?: string;
}

export class FulfilDocumentRequestDto {
  @IsString() document_id!: string;
}

export class DecideDocumentRequestDto {
  @IsOptional() @IsString() remarks?: string;
}
