// src/account-details/account-details.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BrokerAccount } from '../addAccountsModule/add-accounts.schema';
import axios from 'axios';
import { TradingBotService } from '../tradingBotModule/trading-bot.service';

@Injectable()
export class AccountDetailsService {
  tradingBotService: any;
  constructor(
    @InjectModel(BrokerAccount.name) private accountModel: Model<BrokerAccount>,
  ) {}

  async getUserAccounts(userId: string): Promise<{ brokerName: string; accountId: string }[]> {
    try {
      const accounts = await this.accountModel.find({ userId }).select('brokerName accountId').exec();
    //  console.log("ffffffff",accounts)
      return accounts.map(account => ({ _id:account._id, brokerName: account.brokerName, accountId: account.accountId }));
    } catch (error) {
    //  console.error(`[${new Date().toISOString()}] Failed to fetch accounts for user ${userId}: ${error.message}`);
      throw error;
    }
  }

async getAccountDetails(userId: string, id: string): Promise<any> {
//  console.log("id in service, we recieved",id,userId)
    try {
     const accounts = await this.accountModel.findOne(
      { _id: id },
      {
        splittingTarget: 1,
        maxPositionLimit: 1,
        riskPercentage: 1,
        autoLotSizeSet: 1,
        dailyRiskPercentage: 1,
        remainingDailyRisk: 1,
        timezone: 1,
      }
    );
  //  console.log("ffffffff", accounts);
    return accounts;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Failed to fetch account details for ${id}: ${error.message}`);
      throw error;
    }
  }


async getFavorites(userId: string, id: string): Promise<string[]> {
  console.log("get favourite symbols ")
    const account = await this.accountModel.findOne({ _id: id, userId }).exec();
    if (!account) throw new NotFoundException('Account not found');
    return account.favoriteSymbols;
  }

  private async verifySymbol(accountId: string, apiKey: string, location: string, symbol: string): Promise<boolean> {
    try {
      const apiUrl = location === 'NewYork' ? 'https://mt-client-api-v1.new-york.agiliumtrade.ai' : 'https://mt-client-api-v1.london.agiliumtrade.ai';
      await axios.get(`${apiUrl}/users/current/accounts/${accountId}/symbols/${symbol}/current-price?keepSubscription=false`, {
        headers: {
          'Accept': 'application/json',
          'auth-token': apiKey,
        },
      });
      return true;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Failed to verify symbol ${symbol} for account ${accountId}: ${error.response?.data?.message || error.message}`);
      return false;
    }
  }

async addFavorite(userId: string, id: string, symbol: string) {
    const account = await this.accountModel.findOne({ _id: id, userId }).exec();
    if (!account) return { message: 'Account not found' };
    if (account.favoriteSymbols.length >= 5) return { message: 'Maximum 5 favorite symbols allowed' };
    const upperSymbol = symbol.toUpperCase();
    if (account.favoriteSymbols.includes(upperSymbol)) return { message: 'Symbol is already added to favorites' };
    const isValidSymbol = await this.verifySymbol(account.accountId, account.apiKey, account.location, upperSymbol);
    if (!isValidSymbol) return { message: 'Invalid symbol provided' };
    // Only modify the database and call tradingBotService after all validations pass
    account.favoriteSymbols.push(upperSymbol);
    await account.save();
    await this.tradingBotService.addFavorite(userId, account.accountId, upperSymbol);
    return { message: 'symbol successfully added to favorites' };
}

  async removeFavorite(userId: string, id: string, symbol: string) {
    const account = await this.accountModel.findOne({ _id: id, userId }).exec();
    if (!account) throw new NotFoundException('Account not found');
    const upperSymbol = symbol.toUpperCase();
    if (!account.favoriteSymbols.includes(upperSymbol)) throw new Error('Symbol not found in favorites');
    account.favoriteSymbols = account.favoriteSymbols.filter((s) => s !== upperSymbol);
    await account.save();
    await this.tradingBotService.removeFavorite(userId, account.accountId, upperSymbol);
    return { message: 'Symbol successfully removed from favorites' };
  }


}

