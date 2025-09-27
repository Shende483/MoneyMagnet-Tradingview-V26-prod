





import { Logger } from '@nestjs/common';
import { SubscribeMessage, WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect, ConnectedSocket, MessageBody } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { WsAuthGuard } from './ws-auth.guard';
import { OrderData } from 'src/modules/tradingBotModule/dto/trading-bot.dto';
import { TradingBotService } from 'src/modules/tradingBotModule/trading-bot.service';

@WebSocketGateway({ cors: { origin: '*', credentials: true } })
export class LiveGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('LiveGateway');

  constructor(
    private readonly wsAuthGuard: WsAuthGuard,
    private readonly tradingBotService: TradingBotService,
  ) {}

  afterInit() {
    this.tradingBotService.setSocketServer(this.server);
  //  this.logger.log('WebSocket server initialized');
  }

  async handleConnection(@ConnectedSocket() client: Socket) {
 //   this.logger.log(`Client connecting: id=${client.id}, auth=${JSON.stringify(client.handshake.auth)}`);
    try {
      const token = client.handshake.auth.token;
      const accountId = client.handshake.auth.accountId;
      const timestamp = client.handshake.auth.timestamp;

      
      if (!token || !accountId) {
        this.logger.error(`Missing token or accountId: token=${token}, accountId=${accountId}`);
         client.emit('auth-error', {
          statusCode: 301,
          message: '❌ Token and accountId are required, Please login First...',
          success: false,
        });               
        return;
      }

      if (!timestamp) {
        this.logger.error(`Missing timestamp: timestamp=${timestamp}`);
        client.emit('auth-error', {
          statusCode: 304,
          message: 'Slow Network, Check your Network Connection',
          success: false,
        });
        client.disconnect();
        return;
      }

      const requestTime = new Date(timestamp);
      const currentTime = new Date();
      const timeDiff = (currentTime.getTime() - requestTime.getTime()) / 1000;

      if (timeDiff > 5) {
       // this.logger.error(`Timestamp outside of allowed window: ${timestamp}`);
        client.emit('auth-error', {
          statusCode: 305,
          message: '❌ Request timestamp is outside of allowed window',
          success: false,
        });
        client.disconnect();
        return;
      }

      const canActivate = await this.wsAuthGuard.canActivate({ switchToWs: () => ({ getClient: () => client }) } as any);
      if (!canActivate) {
        this.logger.error(`Invalid token: ${token}`);
        client.disconnect();
        return;
      }

      const user = client.data.user;
      client.data.accountId = accountId;
      const room = `${user.userId}_${accountId}`;
      client.join(room);
     // this.logger.log(`User ${user.userId} connected for account ${accountId} in room ${room}`);

      const setting = await this.tradingBotService.accountModel.findOne({ _id: accountId, userId: user.userId }).exec();
      if (setting) {
        const accountInfo = await this.tradingBotService.getAccountInfo(user.userId, setting.accountId);
        this.server.to(room).emit('equity-balance', {
          accountId: setting.accountId,
          equity: accountInfo.accountInformation.equity,
          balance: accountInfo.accountInformation.balance,
        });
       // this.logger.log(`Emitted initial equity-balance for room ${room}`);

        const terminalState = accountInfo.terminalState;
        const positions = terminalState?.positions || [];
        const pendingOrders = terminalState?.orders || [];
        const accountInformation = terminalState?.accountInformation;

        const livePositions = positions.map(position => ({
          id: position.id,
          platform: position.platform,
          type: position.type === 'POSITION_TYPE_BUY' ? 'BUY' : 'SELL',
          symbol: position.symbol,
          brokerTime: position.brokerTime,
          openPrice: position.openPrice,
          volume: position.volume,
          brokerComment: position.comment,
          stopLoss: position.stopLoss,
          takeProfit: position.takeProfit,
          liveProfit: position.profit,
        }));

        const filteredPendingOrders = pendingOrders.map(order => ({
          id: order.id,
          type: order.type === 'ORDER_TYPE_SELL_STOP' ? 'SELL_STOP' : order.type === 'ORDER_TYPE_BUY_STOP' ? 'BUY_STOP' : order.type,
          symbol: order.symbol,
          time: order.brokerTime,
          currentVolume: order.currentVolume,
          brokerComment: order.comment,
            openPrice: order.openPrice,
          stopLoss: order.stopLoss,
          takeProfit: order.takeProfit,
        }));

        const filteredAccountInfo = accountInformation ? {
          platform: accountInformation.platform,
          type: accountInformation.type,
          broker: accountInformation.broker,
          currency: accountInformation.currency,
          server: accountInformation.server,
          balance: accountInformation.balance,
          equity: accountInformation.equity,
          margin: accountInformation.margin,
          credit: accountInformation.credit,
          freeMargin: accountInformation.freeMargin,
          leverage: accountInformation.leverage,
          marginLevel: accountInformation.marginLevel,
          marginMode: accountInformation.marginMode,
          name: accountInformation.name,
          login: accountInformation.login,
        } : null;

        this.server.to(room).emit('live-data', {
          accountId: setting.accountId,
          positionData: {
            livePositions,
            pendingOrders: filteredPendingOrders,
            accountInformation: filteredAccountInfo,
          },
        });
        this.logger.log(`Emitted initial live-data for room ${room}`);


 // Fetch and emit symbol prices for favorite symbols
        const favoriteSymbols = setting.favoriteSymbols || [];
        if (favoriteSymbols.length > 0) {
          const pollPriceInterval = setInterval(async () => {
            try {
              for (const symbol of favoriteSymbols) {
                const priceData = await this.tradingBotService['getMarketPrice'](setting.accountId, symbol, setting.apiKey, setting.location);
                this.server.to(room).emit('symbol-price', {
                  symbol: symbol,
                  bid: priceData.bid,
                  ask: priceData.ask,
                });
               // this.logger.log(`Emitted symbol price to room ${room}:`, { symbol, bid: priceData.bid, ask: priceData.ask });
              }
            } catch (err) {
             // this.logger.error(`Failed to fetch symbol price for account ${setting.accountId}: ${err.message}`);
            }
          }, 1000);

          client.on('disconnect', () => {
            clearInterval(pollPriceInterval);
            this.logger.log(`Stopped polling symbol prices for account ${setting.accountId} due to client disconnect`);
          });
        }



        const pollInterval = setInterval(async () => {
          try {
            const updatedInfo = await this.tradingBotService.getAccountInfo(user.userId, setting.accountId);
            const updatedTerminalState = updatedInfo.terminalState;
            const updatedPositions = updatedTerminalState?.positions || [];
            const updatedPendingOrders = updatedTerminalState?.orders || [];
            const updatedAccountInformation = updatedTerminalState?.accountInformation;

            const updatedLivePositions = updatedPositions.map(position => ({
               id: position.id,
          platform: position.platform,
          type: position.type === 'POSITION_TYPE_BUY' ? 'BUY' : 'SELL',
          symbol: position.symbol,
          brokerTime: position.brokerTime,
          openPrice: position.openPrice,
          volume: position.volume,
          brokerComment: position.comment,
          stopLoss: position.stopLoss,
          takeProfit: position.takeProfit,
          liveProfit: position.profit,
            }));

            const updatedFilteredPendingOrders = updatedPendingOrders.map(order => ({
                id: order.id,
          type: order.type === 'ORDER_TYPE_SELL_STOP' ? 'SELL_STOP' : order.type === 'ORDER_TYPE_BUY_STOP' ? 'BUY_STOP' : order.type,
          symbol: order.symbol,
          time: order.brokerTime,
          currentVolume: order.currentVolume,
          brokerComment: order.comment,
            openPrice: order.openPrice,
          stopLoss: order.stopLoss,
          takeProfit: order.takeProfit,
            }));

            const updatedFilteredAccountInfo = updatedAccountInformation ? {
               platform: accountInformation.platform,
          type: accountInformation.type,
          broker: accountInformation.broker,
          currency: accountInformation.currency,
          server: accountInformation.server,
          balance: accountInformation.balance,
          equity: accountInformation.equity,
          margin: accountInformation.margin,
          credit: accountInformation.credit,
          freeMargin: accountInformation.freeMargin,
          leverage: accountInformation.leverage,
          marginLevel: accountInformation.marginLevel,
          marginMode: accountInformation.marginMode,
          name: accountInformation.name,
          login: accountInformation.login,
            } : null;

            this.server.to(room).emit('live-data', {
              accountId: setting.accountId,
              positionData: {
                livePositions: updatedLivePositions,
                pendingOrders: updatedFilteredPendingOrders,
                accountInformation: updatedFilteredAccountInfo,
              },
            });
          } catch (err) {
            this.logger.error(`Failed to poll live-data for account ${setting.accountId}: ${err.message}`);
          }
        }, 1000);

        client.on('disconnect', () => {
          clearInterval(pollInterval);
          this.logger.log(`Stopped polling for account ${setting.accountId} due to client disconnect`);
        });
      } else {
        this.logger.warn(`No account settings found for _id=${accountId}, userId=${user.userId}`);
      }
    } catch (err) {
      this.logger.error(`Connection error: ${err.message}`);
      client.emit('auth-error', {
        statusCode: 303,
        message: `❌ Connection error: ${err.message}`,
        success: false,
      });
      client.disconnect();
    }
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('place-order')
  async handlePlaceOrder(@ConnectedSocket() client: Socket, @MessageBody() data: OrderData) {
    try {
      this.logger.log(`Received place-order: ${JSON.stringify(data)}`);
      const timestamp = data.timestamp;
      if (!timestamp) {
        const error = 'Request timestamp is required';
        this.logger.error(error);
        client.emit('order-response', { error });
        return;
      }

      const requestTime = new Date(timestamp);
      const currentTime = new Date();
      const timeDiff = (currentTime.getTime() - requestTime.getTime()) / 1000;

      if (timeDiff > 5) {
        const error = 'Slow Network,Check Your Network Connction,Request timestamp is outside of allowed window';
        this.logger.error(error);
        client.emit('order-response', { error });
        return;
      }

      const userId = String(client.data.user?.userId);
      const accountId = client.data.accountId;
      if (data._id !== accountId) {
        const error = `Invalid account ID: expected ${accountId}, got ${data._id}`;
        this.logger.error(error);
        client.emit('order-response', { error });
        return;
      }
      const { _id, symbol, entryType, lotSize, stopLoss, takeProfit, orderType, comment, entryPrice } = data;
      const result = await this.tradingBotService.placeOrder(_id, symbol, entryType, lotSize, stopLoss, takeProfit, userId, orderType, comment, entryPrice);
      this.logger.log(`Order response: ${JSON.stringify(result)}`);
      client.emit('order-response', result);
    } catch (err) {
      const errorMessage = err.message || 'Failed to place order';
      this.logger.error(`Order placement error: ${err}`);
      client.emit('order-response', { error: errorMessage });
    }
  }

  @SubscribeMessage('verify-order')
  async handleVerifyOrder(@ConnectedSocket() client: Socket, @MessageBody() data: OrderData) {
    try {
    //  this.logger.log(`Received verify-order: ${JSON.stringify(data)}`);
      const timestamp = data.timestamp;
      if (!timestamp) {
        const error = 'Request timestamp is required';
        this.logger.error(error);
        client.emit('verify-order-response', { error });
        return;
      }

      const requestTime = new Date(timestamp);
      const currentTime = new Date();
      const timeDiff = (currentTime.getTime() - requestTime.getTime()) / 1000;

      if (timeDiff > 5) {
        const error = 'Request timestamp is outside of allowed window';
        this.logger.error(error);
        client.emit('verify-order-response', { error });
        return;
      }

      const userId = String(client.data.user?.userId);
      const accountId = client.data.accountId;
      if (data._id !== accountId) {
        const error = `Invalid account ID: expected ${accountId}, got ${data._id}`;
        this.logger.error(error);
        client.emit('verify-order-response', { error });
        return;
      }
      const { _id, symbol, entryType, lotSize, stopLoss, takeProfit, orderType, comment, entryPrice } = data;
      const result = await this.tradingBotService.verifyOrder(_id, symbol, entryType, lotSize, stopLoss, takeProfit, userId, orderType, comment, entryPrice);
   //   this.logger.log(`Verify order response: ${JSON.stringify(result)}`);
      client.emit('verify-order-response', { data: result });
    } catch (err) {
      const errorMessage = err.message || 'Failed to verify order';
     // this.logger.error(`Order verification error: ${err}`);
      client.emit('verify-order-response', { error: errorMessage });
    }
  }
}


