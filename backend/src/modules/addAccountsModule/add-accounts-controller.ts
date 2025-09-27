






import { Controller, Post, Body, Request, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard-rest-api';
import { AccountsService } from './add-accounts.service';
import { CreateAccountDto } from './dto/addAccounts.dto';

@Controller('accounts')
export class AccountsController {
  constructor(private accountsService: AccountsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('add')
  async add(@Request() req, @Body() createAccountDto: CreateAccountDto) {
    const userId = req.user.userId;
    console.log("createAccountDto:", createAccountDto);
    const { brokerName, accountId, apiKey, location, maxPositionLimit,splittingTarget, riskPercentage,   autoLotSizeSet ,dailyRiskPercentage, timezone } = createAccountDto;
    const result = await this.accountsService.addAccount(userId, brokerName, accountId, apiKey, location, maxPositionLimit,splittingTarget, riskPercentage,   autoLotSizeSet,dailyRiskPercentage, timezone );
    if ('error' in result) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Post('confirm')
  async confirm(@Request() req, @Body() createAccountDto: CreateAccountDto) {
    const userId = req.user.userId;
    const { brokerName, accountId, apiKey, location, maxPositionLimit,splittingTarget, riskPercentage,   autoLotSizeSet ,dailyRiskPercentage, timezone} = createAccountDto;
    const result = await this.accountsService.confirmAccount(userId, brokerName, accountId, apiKey, location, maxPositionLimit,splittingTarget, riskPercentage,   autoLotSizeSet,dailyRiskPercentage, timezone);
    if ('error' in result) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }
}






/*
import { Controller, Post, Body, Request, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard-rest-api';
import { AccountsService } from './add-accounts.service';
import { CreateAccountDto } from './dto/addAccounts.dto';

@Controller('accounts')
export class AccountsController {
  constructor(private accountsService: AccountsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('add')
  async add(@Request() req, @Body() createAccountDto: CreateAccountDto) {
    const userId = req.user.userId;
    const { brokerName, accountId, apiKey ,location} = createAccountDto;
    const result = await this.accountsService.addAccount(userId, brokerName, accountId, apiKey, location);
    if ('error' in result) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Post('confirm')
  async confirm(@Request() req, @Body() createAccountDto: CreateAccountDto) {
    const userId = req.user.userId;
    const { brokerName, accountId, apiKey,location } = createAccountDto;
    const result = await this.accountsService.confirmAccount(userId, brokerName, accountId, apiKey,location);
    if ('error' in result) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }
}
  */