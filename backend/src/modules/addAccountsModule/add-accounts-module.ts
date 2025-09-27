import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { WebsocketModule } from 'src/common/websocket/websocket.module';
import { AccountsController } from './add-accounts-controller';
import { BrokerAccount, BrokerAccountSchema } from './add-accounts.schema';
import { AccountsService } from './add-accounts.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard-rest-api';
import jwtConfing from 'src/config/jwt.confing';
import { JwtModule } from '@nestjs/jwt';
import { TradingBotModule } from '../tradingBotModule/trading-bot.module';


@Module({
  imports: [
    MongooseModule.forFeature([{ name: BrokerAccount.name, schema: BrokerAccountSchema }]),
    HttpModule,
    WebsocketModule,
     JwtModule.registerAsync(jwtConfing.asProvider()),
     TradingBotModule, // Add TradingBotModule to imports
    
  ],
  controllers: [AccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class BrokerAccountsModule {}