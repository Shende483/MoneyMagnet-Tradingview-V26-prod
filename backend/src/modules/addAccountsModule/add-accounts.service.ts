


import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import MetaApi from 'metaapi.cloud-sdk';
import { BrokerAccount } from './add-accounts.schema';
import axios from 'axios';
import { TradingBotService } from '../tradingBotModule/trading-bot.service';
 // Import TradingBotService

@Injectable()
export class AccountsService implements OnModuleInit {
  private readonly domain = 'agiliumtrade.agiliumtrade.ai';
  private metaApis: Map<string, MetaApi> = new Map();
  private accounts: Map<string, any> = new Map();

  constructor(
    @InjectModel(BrokerAccount.name) private accountModel: Model<BrokerAccount>,
    private tradingBotService: TradingBotService, // Inject TradingBotService
  ) {}

  async onModuleInit() {
    await this.initializeConnections();
  }

  private async initializeConnections() {
    try {
      const settings = await this.accountModel.find().exec();
      await Promise.all(
        settings.map(async (setting) => {
          try {
            await this.initializeSingle(setting.userId.toString(), setting.accountId, setting.location);
          } catch (error) {
         //   console.error(`[${new Date().toISOString()}] Failed to initialize account for user ${setting.userId} accountId ${setting.accountId}: ${error.message}`);
          }
        }),
      );
    } catch (error) {
    //  console.error(`[${new Date().toISOString()}] Connection initialization failed: ${error.message}`);
    }
  }

  private async initializeSingle(userId: string, accountId: string, location: string) {
    try {
      const setting = await this.accountModel.findOne({ userId, accountId }).exec();
      if (!setting) {
        throw new Error('BrokerAccount settings not found');
      }

      const key = `${userId}_${accountId}`;

      const metaApi = new MetaApi(setting.apiKey, {
        domain: this.domain,
        requestTimeout: 60000,
        retryOpts: { retries: 5, minDelayInSeconds: 2, maxDelayInSeconds: 30 },
      });

      this.metaApis.set(key, metaApi);

      const account = await metaApi.metatraderAccountApi.getAccount(setting.accountId);
     // console.log(`[${new Date().toISOString()}] Retrieved MetaApi account for user ${userId} accountId ${accountId}`);

      this.accounts.set(key, account);
     // console.log(`[${new Date().toISOString()}] MetaApi account for user ${userId} accountId ${accountId} stored`);

      const accountInfo = await this.getAccountInformation(setting.apiKey, setting.accountId, setting.location);
    //  console.log(`[${new Date().toISOString()}] Account information for user ${userId} accountId ${accountId}`, accountInfo);

    } catch (error) {
      throw new Error(`Failed to initialize account: ${error.message}`);
    }
  }

  private async getAccountInformation(apiKey: string, accountId: string, location: string) {
    try {
      const apiUrl = location === 'NewYork' ? 'https://mt-client-api-v1.new-york.agiliumtrade.ai' : 'https://mt-client-api-v1.london.agiliumtrade.ai';
      const response = await axios.get(`${apiUrl}/users/current/accounts/${accountId}/account-information`, {
        headers: {
          'Accept': 'application/json',
          'auth-token': apiKey,
        },
        params: {
          refreshTerminalState: true,
        },
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch account information: ${error.response?.data?.message || error.message}`);
    }
  }

  async addAccount(userId: string, brokerName: string, accountId: string, apiKey: string, location: string, maxPositionLimit: number, splittingTarget: number, riskPercentage: number,   autoLotSizeSet: boolean,dailyRiskPercentage?: number, timezone?: string) {
    try {
      const metaApi = new MetaApi(apiKey, { domain: this.domain });
      const account = await metaApi.metatraderAccountApi.getAccount(accountId);
      
      const accountInfo = await this.getAccountInformation(apiKey, accountId, location);
      console.log(`[${new Date().toISOString()}] Account information for verification`, accountInfo);

      const existing = await this.accountModel.findOne({ userId, accountId }).exec();
      if (existing) {
        return { error: 'Account already added' };
      }

      return { message: 'Account verified successfully, please confirm to save', accountInfo, location, maxPositionLimit, riskPercentage,   autoLotSizeSet, splittingTarget,dailyRiskPercentage, timezone };
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Verification failed for user ${userId}: ${error.message}`);
      return { error: 'Invalid API key or account ID' };
    }
  }

  async confirmAccount(userId: string, brokerName: string, accountId: string, apiKey: string, location: string, maxPositionLimit: number, splittingTarget: number, riskPercentage: number,   autoLotSizeSet: boolean,dailyRiskPercentage?: number, timezone?: string  ) {
    try {
      const existing = await this.accountModel.findOne({ userId, accountId }).exec();
      if (existing) {
        return { error: 'Account already added' };
      }

      await this.accountModel.create({ userId, brokerName, accountId, apiKey, location, maxPositionLimit, splittingTarget, riskPercentage,   autoLotSizeSet, dailyRiskPercentage, timezone  });
    //  console.log(`[${new Date().toISOString()}] Account saved for user ${userId} accountId ${accountId} with location ${location}`);

      // Initialize MetaApi connection in TradingBotService
      await this.tradingBotService.initializeSingle(userId, accountId, apiKey);

      const accountInfo = await this.getAccountInformation(apiKey, accountId, location);
      return { message: 'BrokerAccount added successfully', accountInfo, location, maxPositionLimit, riskPercentage, splittingTarget,   autoLotSizeSet, dailyRiskPercentage, timezone  };
    } catch (error) {
    //  console.error(`[${new Date().toISOString()}] Confirmation failed for user ${userId}: ${error.message}`);
      return { error: 'Failed to save account' };
    }
  }

  async deleteAccount(userId: string, accountId: string) {
    try {
      const existing = await this.accountModel.findOne({ userId, accountId }).exec();
      if (!existing) {
        return { error: 'Account not found' };
      }

      await this.accountModel.deleteOne({ userId, accountId }).exec();
    //  console.log(`[${new Date().toISOString()}] Account deleted for user ${userId} accountId ${accountId}`);

      // Notify TradingBotService to disconnect the account
      await this.tradingBotService.disconnectAccount(userId, accountId);

      return { message: 'Account deleted successfully' };
    } catch (error) {
    //  console.error(`[${new Date().toISOString()}] Failed to delete account for user ${userId} accountId ${accountId}: ${error.message}`);
      return { error: 'Failed to delete account' };
    }
  }
}

