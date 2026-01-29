import { IsString, IsOptional, IsInt, IsBoolean, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateQuestionDto {
  @IsString()
  text: string;

  @IsOptional()
  @IsString()
  answer?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  points?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(5)
  timeLimit?: number; // En secondes
}

export class CreateGameDto {
  @IsOptional()
  @IsBoolean()
  allowNegativePoints?: boolean = false;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  questions?: CreateQuestionDto[];
}

export class UpdateQuestionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  questions: CreateQuestionDto[];
}

export class JudgeBuzzDto {
  @IsString()
  playerId: string;

  @IsBoolean()
  isCorrect: boolean;
}
