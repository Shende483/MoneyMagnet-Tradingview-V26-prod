import { Module } from '@nestjs/common';
import { LiveGateway } from './live.gateway';
import { SocketService } from './socket.service';
import { WsAuthGuard } from './ws-auth.guard';
import { JwtModule } from '@nestjs/jwt';
import { TradingBotModule } from 'src/modules/tradingBotModule/trading-bot.module';
import jwtConfing from 'src/config/jwt.confing';


@Module({
  imports: [
   JwtModule.registerAsync(jwtConfing.asProvider()),
    TradingBotModule, // Import TradingBotModule
  ],
  providers: [
    SocketService,
    LiveGateway,
    WsAuthGuard,
  ],
  exports: [SocketService],
})
export class WebsocketModule {}










/*
import { Module } from '@nestjs/common';
import { LiveGateway } from './live.gateway';
import { SocketService } from './socket.service';
import { WsAuthGuard } from './ws-auth.guard';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [JwtModule.register({ secret: 'SECRET' })],
  providers: [
    { provide: 'SOCKET_SERVICE', useClass: SocketService },
      SocketService,
    LiveGateway,
    WsAuthGuard,
    
    
  ],
  exports: ['SOCKET_SERVICE'],
})
export class WebsocketModule {}
*/