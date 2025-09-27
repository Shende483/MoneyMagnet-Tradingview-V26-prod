import { IsString, IsNotEmpty } from 'class-validator';

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


}

export class SymbolDto {
  @IsString()
  @IsNotEmpty()
  symbol: string;
}