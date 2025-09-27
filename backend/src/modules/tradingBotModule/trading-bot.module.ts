







import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TradingBotService } from './trading-bot.service';
import { BrokerAccount, BrokerAccountSchema } from '../addAccountsModule/add-accounts.schema';


@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BrokerAccount.name, schema: BrokerAccountSchema },
    ]),
  ],
  providers: [TradingBotService],
  exports: [TradingBotService],
})
export class TradingBotModule {}




