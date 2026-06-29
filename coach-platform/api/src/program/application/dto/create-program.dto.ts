import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Discipline } from '../../../training/domain/training-profile.model';
import {
  PlanState,
  WeekStatus,
  WeekTheme,
} from '../../domain/program.model';

/** Goal copied into the program at creation (snapshot, never back-edited). */
export class GoalSnapshotDto {
  @IsString() primaryGoal!: string;

  @IsOptional() @IsString() note?: string;

  @IsISO8601({ strict: true }) horizon!: string; // YYYY-MM-DD
}

/** One entry in the periodization skeleton. */
export class ProgramWeekDto {
  @IsInt() @Min(0) weekIndex!: number;

  @IsISO8601({ strict: true }) startDate!: string;

  @IsISO8601({ strict: true }) endDate!: string;

  @IsIn(['assessment', 'base', 'build', 'peak', 'deload', 'taper'])
  theme!: WeekTheme;

  @IsOptional() @IsInt() @Min(0) plannedLoadTarget?: number;

  @IsIn(['committed', 'tentative'])
  planState!: PlanState;

  @IsIn(['upcoming', 'current', 'done'])
  status!: WeekStatus;
}

/**
 * Seed a new program skeleton. The (future) LLM generator will call this same
 * write path; for now it's an explicit, validated payload so the infra can be
 * exercised end-to-end without any generation logic.
 */
export class CreateProgramDto {
  @IsIn(['running', 'strength'])
  discipline!: Discipline;

  @IsOptional() @IsString() trainingProfileId?: string;

  @IsObject()
  @ValidateNested()
  @Type(() => GoalSnapshotDto)
  goalSnapshot!: GoalSnapshotDto;

  @IsISO8601({ strict: true }) startDate!: string;

  @IsISO8601({ strict: true }) horizonDate!: string;

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ProgramWeekDto)
  weeks!: ProgramWeekDto[];
}
