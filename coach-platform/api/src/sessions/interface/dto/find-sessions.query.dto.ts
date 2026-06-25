import { Type } from 'class-transformer';
import { IsIn, IsISO8601, IsInt, IsOptional } from 'class-validator';

export class FindSessionsQueryDto {
  @IsISO8601({ strict: true }) from!: string;
  @IsISO8601({ strict: true }) to!: string;

  @IsOptional()
  @IsIn(['running', 'strength'])
  type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cursor?: number;
}
