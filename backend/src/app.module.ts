import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseConfig } from './config/database.config';
import { AuthModule } from './modules/authModule/auth.module';
import { WebsocketModule } from './common/websocket/websocket.module';
import { BrokerAccountsModule } from './modules/addAccountsModule/add-accounts-module';
import { TradingBotModule } from './modules/tradingBotModule/trading-bot.module';
import { AccountDetailsModule } from './modules/addAccountsModule copy/add-accounts-details-module';
import { ScheduleModule } from '@nestjs/schedule';




@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '.env',
      isGlobal: true,
    }),
    WebsocketModule,
    ScheduleModule.forRoot(),
  //  TradeModule,
     AuthModule,
    DatabaseConfig,
  BrokerAccountsModule,
  AccountDetailsModule,
  TradingBotModule ,

   
  
  ],
})
export class AppModule {}
