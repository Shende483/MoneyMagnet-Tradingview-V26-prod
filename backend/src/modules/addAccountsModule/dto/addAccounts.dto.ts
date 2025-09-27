import { IsString, IsNotEmpty, IsNumber , IsOptional, IsBoolean, Max, Validate} from 'class-validator';
import { IsValidTimezone } from './timezone-validator';

export class CreateAccountDto {
  @IsString()
  @IsNotEmpty()
  brokerName: string;

  @IsString()
  @IsNotEmpty()
  accountId: string;

  @IsString()
  @IsNotEmpty()
  apiKey: string;

  @IsString()
  @IsNotEmpty()
  location: string;

  @IsNumber()
  @IsNotEmpty()
  maxPositionLimit: number;

  @IsString()
  @IsOptional()
  riskPercentage: number;

 @IsNumber()
  @IsNotEmpty()
splittingTarget: number;


  @IsBoolean()
  @IsOptional()
  autoLotSizeSet: boolean;

   @IsNumber()
  @IsOptional()
  @Max(100, { message: 'Daily Risk Percentage cannot exceed 100%' })
  dailyRiskPercentage?: number;

  @IsString()
  @IsOptional()
  @Validate(IsValidTimezone, { message: 'Invalid timezone' })
  timezone?: string;


}