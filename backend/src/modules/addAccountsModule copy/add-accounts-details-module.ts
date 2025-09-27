// src/account-details/account-details.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BrokerAccount, BrokerAccountSchema } from '../addAccountsModule/add-accounts.schema';
import { AccountDetailsController } from './add-accounts-details-controller';
import { AccountDetailsService } from './add-accounts-details.service';
import { HttpModule } from '@nestjs/axios';
import { JwtModule } from '@nestjs/jwt';
import { WebsocketModule } from 'src/common/websocket/websocket.module';
import jwtConfing from 'src/config/jwt.confing';


@Module({
  imports: [
    MongooseModule.forFeature([{ name: BrokerAccount.name, schema: BrokerAccountSchema }]),
     HttpModule,
        WebsocketModule,
         JwtModule.registerAsync(jwtConfing.asProvider()),
  ],
  controllers: [AccountDetailsController],
  providers: [AccountDetailsService],
  exports: [AccountDetailsService],
})
export class AccountDetailsModule {}