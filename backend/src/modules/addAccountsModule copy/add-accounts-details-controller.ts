
// src/account-details/account-details.controller.ts
import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Request, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard-rest-api';
import { AccountDetailsService } from './add-accounts-details.service';
import { SymbolDto } from './dto/add-accounts-details.dto';

@Controller('account-details')
export class AccountDetailsController {
  constructor(private accountDetailsService: AccountDetailsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('accounts')
  async getAccounts(@Request() req) {
    const userId = req.user.userId;
    return await this.accountDetailsService.getUserAccounts(userId);
  }

@UseGuards(JwtAuthGuard)
  @Get('account/:id')
  async getAccount(@Param('id') id: string, @Request() req) {
console.log("id in controller",id)
    const userId = req.user.userId;
   return await this.accountDetailsService.getAccountDetails(userId, id);
  }

 @UseGuards(JwtAuthGuard)
  @Get(':id/favorites')
  async getFavorites(@Param('id') id: string, @Request() req) {
    const userId = req.user.userId;
    return await this.accountDetailsService.getFavorites(userId, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/favorites')
  async addFavorite(@Param('id') id: string, @Body() symbolDto: SymbolDto, @Request() req) {
    const userId = req.user.userId;
    return await this.accountDetailsService.addFavorite(userId, id, symbolDto.symbol.toUpperCase());
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/favorites/:symbol')
  async removeFavorite(@Param('id') id: string, @Param('symbol') symbol: string, @Request() req) {
    const userId = req.user.userId;
    return await this.accountDetailsService.removeFavorite(userId, id, symbol.toUpperCase());
  }


}
