




import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import MetaApi, { RiskManagement, SynchronizationListener } from 'metaapi.cloud-sdk';
import { BrokerAccount } from '../addAccountsModule/add-accounts.schema';
import { Server } from 'socket.io';
import axios from 'axios';
import * as moment from 'moment-timezone';
import { Cron } from '@nestjs/schedule';

class MySynchronizationListener extends SynchronizationListener {
  private userId: string;
  private accountId: string;
  private connection: any;
  private socketServer: Server | null;
  private subscribedSymbols: Set<string> = new Set();
  private favorites: Set<string> = new Set();
  private processing: Map<string, boolean> = new Map();
  private static previousPositions: Map<string, Map<string, any>> = new Map();
  private static previousPendingOrders: Map<string, Map<string, any>> = new Map();

  constructor(userId: string, accountId: string, connection: any, socketServer: Server | null) {
    super();
    this.userId = userId;
    this.accountId = accountId;
    this.connection = connection;
    this.socketServer = socketServer;

    const userAccountKey = `${userId}_${accountId}`;
    if (!MySynchronizationListener.previousPositions.has(userAccountKey)) {
      MySynchronizationListener.previousPositions.set(userAccountKey, new Map());
    }
    if (!MySynchronizationListener.previousPendingOrders.has(userAccountKey)) {
      MySynchronizationListener.previousPendingOrders.set(userAccountKey, new Map());
    }
  }

  private log(event: string, data: any) {
  //  console.log(`[${new Date().toISOString()}] ${event} for user ${this.userId} accountId ${this.accountId}:`, data);
  }

  private async manageSubscriptions() {
    const currentSymbols = new Set(this.favorites);

    for (const symbol of currentSymbols) {
      if (!this.subscribedSymbols.has(symbol)) {
        try {
          await this.connection.subscribeToMarketData(symbol, [{ type: 'quotes', intervalInMilliseconds: 1000 }]);
          this.subscribedSymbols.add(symbol);
        //  console.log(`[${new Date().toISOString()}] Subscribed to ${symbol}`);
        } catch (error) {
         // console.error(`[${new Date().toISOString()}] Failed to subscribe to ${symbol}: ${error.message}`);
        }
      }
    }

    for (const symbol of this.subscribedSymbols) {
      if (!currentSymbols.has(symbol)) {
        try {
          await this.connection.unsubscribeFromMarketData(symbol);
          this.subscribedSymbols.delete(symbol);
        //  console.log(`[${new Date().toISOString()}] Unsubscribed from ${symbol}`);
        } catch (error) {
        //  console.error(`[${new Date().toISOString()}] Failed to unsubscribe from ${symbol}: ${error.message}`);
        }
      }
    }
  }

  async updateFavorites(favorites: string[]) {
    this.favorites = new Set(favorites.map(s => s.toUpperCase()));
    await this.manageSubscriptions();
  }

  private getUserAccountKey(): string {
    return `${this.userId}_${this.accountId}`;
  }

  private async reopenPosition(positionId: string) {
    const maxAttempts = 10;
    let positionCheck: any[] = [];
    for (let attempts = 0; attempts < maxAttempts; attempts++) {
      try {
        const deals = (await this.connection.historyStorage.deals
          .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
          .slice(0, 20)) || [];
        positionCheck = deals.filter(
          (deal) =>
            deal.entryType === "DEAL_ENTRY_OUT" &&
            deal.reason !== "DEAL_REASON_SL" &&
            deal.reason !== "DEAL_REASON_TP" &&
            deal.reason !== "DEAL_REASON_EXPERT" &&
            deal.reason !== "DEAL_REASON_MARGIN" &&
            deal.clientId?.startsWith("AlgoTrade") &&
            deal.positionId === positionId
        );
        if (positionCheck.some(deal => deal.positionId === positionId)) {
          break;
        }
      } catch (error) {
       // console.error("Error in position check:", error);
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    for (const deal of positionCheck) {
      const procKey = `${this.userId}_${this.accountId}_${deal.positionId}`;
      if (this.processing.has(procKey)) {
        continue;
      }
      this.processing.set(procKey, true);
      try {
        const entryType = deal.type.includes('BUY') ? 'sell' : 'buy';
        if (entryType === 'buy') {
          await this.connection.createMarketBuyOrder(deal.symbol, deal.volume, deal.stopLoss, deal.takeProfit, {
            comment: deal.comment || 'Reopened',
            clientId: deal.clientId
          });
        } else {
          await this.connection.createMarketSellOrder(deal.symbol, deal.volume, deal.stopLoss, deal.takeProfit, {
            comment: deal.comment || 'Reopened',
            clientId: deal.clientId
          });
        }
      //  console.log(`[${new Date().toISOString()}] Reopened manually closed algo position ${deal.positionId} for user ${this.userId} accountId ${this.accountId}`);
      } catch (error) {
       // console.error(`failed to reopen position ${deal.positionId}`, error);
      } finally {
        this.processing.delete(procKey);
      }
    }
  }

  private async reopenPendingOrder(orderId: string) {
    const maxAttempts = 10;
    let pendingOrderCheck: any[] = [];
    for (let attempts = 0; attempts < maxAttempts; attempts++) {
      try {
        const orders = (await this.connection.historyStorage.historyOrders
          .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
          .slice(0, 20)) || [];
        pendingOrderCheck = orders.filter(
          (order) =>
            order.id === orderId &&
            order.state === "ORDER_STATE_CANCELED" &&
            order.brokerComment?.startsWith("AlgoTrade") &&
            [
              "ORDER_TYPE_BUY_LIMIT",
              "ORDER_TYPE_SELL_LIMIT",
              "ORDER_TYPE_BUY_STOP",
              "ORDER_TYPE_SELL_STOP",
            ].includes(order.type)
        );
        if (pendingOrderCheck.some(order => order.id === orderId)) {
          break;
        }
      } catch (error) {
        console.error("Error in pending order check:", error);
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    for (const order of pendingOrderCheck) {
      const procKey = `${this.userId}_${this.accountId}_${order.id}`;
      if (this.processing.has(procKey)) {
        continue;
      }
      this.processing.set(procKey, true);
      try {
        const options = {
          comment: order.comment || 'Reopened',
          clientId: order.clientId,
        };
        if (order.type === 'ORDER_TYPE_BUY_LIMIT') {
          await this.connection.createLimitBuyOrder(order.symbol, order.currentVolume, order.openPrice, order.stopLoss, order.takeProfit, options);
        } else if (order.type === 'ORDER_TYPE_SELL_LIMIT') {
          await this.connection.createLimitSellOrder(order.symbol, order.currentVolume, order.openPrice, order.stopLoss, order.takeProfit, options);
        } else if (order.type === 'ORDER_TYPE_BUY_STOP') {
          await this.connection.createStopBuyOrder(order.symbol, order.currentVolume, order.openPrice, order.stopLoss, order.takeProfit, options);
        } else if (order.type === 'ORDER_TYPE_SELL_STOP') {
          await this.connection.createStopSellOrder(order.symbol, order.currentVolume, order.openPrice, order.stopLoss, order.takeProfit, options);
        }
      //  console.log(`[${new Date().toISOString()}] Reopened manually canceled algo pending order ${order.id} for user ${this.userId} accountId ${this.accountId}`);
      } catch (error) {
        console.error(`failed to reopen order ${order.id}`, error);
      } finally {
        this.processing.delete(procKey);
      }
    }
  }

  private async emitLiveData() {
    const terminalState = this.connection.terminalState;
    const positions = terminalState.positions || [];
    const pendingOrders = terminalState.orders || [];
    const accountInformation = terminalState.accountInformation;
    const userAccountKey = this.getUserAccountKey();
    const previousPositions = MySynchronizationListener.previousPositions.get(userAccountKey) || new Map();
    const previousPendingOrders = MySynchronizationListener.previousPendingOrders.get(userAccountKey) || new Map();

    const currentPositionIds = new Set(positions.map(p => p.id));
    const previousPositionIds = new Set(Array.from(previousPositions.keys()) as string[]);

    const newPositions = positions.filter(p => !previousPositionIds.has(p.id));
    newPositions.forEach(p => {
      previousPositions.set(p.id, p);
    });

    const removedPositions = Array.from(previousPositionIds).filter(id => !currentPositionIds.has(id as string));
    removedPositions.forEach(id => {
      const oldPos = previousPositions.get(id as string);
      if (oldPos) {
        previousPositions.delete(id as string);
        this.reopenPosition(id);
      }
    });

    const commonPositionIds = Array.from(currentPositionIds).filter(id => previousPositionIds.has(id as string));
    commonPositionIds.forEach(async id => {
      const oldPos = previousPositions.get(id as string);
      const newPos = positions.find(p => p.id === id);
      if (oldPos && newPos && (oldPos.stopLoss !== newPos.stopLoss || oldPos.takeProfit !== newPos.takeProfit || oldPos.openPrice !== newPos.openPrice)) {
        const procKey = `${this.userId}_${this.accountId}_${newPos.id}`;
        if (!this.processing.has(procKey)) {
          this.processing.set(procKey, true);
          try {
            await this.connection.modifyPosition(newPos.id, oldPos.stopLoss, oldPos.takeProfit);
            previousPositions.set(id, { ...newPos, stopLoss: oldPos.stopLoss, takeProfit: oldPos.takeProfit });
          } catch (error) {
           // console.error(`Failed to revert position ${newPos.id}:`, error);
          } finally {
            this.processing.delete(procKey);
          }
        }
      } else {
        previousPositions.set(id, newPos);
      }
    });

    const currentOrderIds = new Set(pendingOrders.map(o => o.id));
    const previousOrderIds = new Set(Array.from(previousPendingOrders.keys()) as string[]);

    const newOrders = pendingOrders.filter(o => !previousOrderIds.has(o.id));
    newOrders.forEach(o => {
      previousPendingOrders.set(o.id, o);
    });

    const removedOrders = Array.from(previousOrderIds).filter(id => !currentOrderIds.has(id as string));
    removedOrders.forEach(id => {
      const oldOrder = previousPendingOrders.get(id as string);
      if (oldOrder) {
        previousPendingOrders.delete(id as string);
        this.reopenPendingOrder(id);
      }
    });

    const commonOrderIds = Array.from(currentOrderIds).filter(id => previousOrderIds.has(id as string));
    commonOrderIds.forEach(async id => {
      const oldOrder = previousPendingOrders.get(id as string);
      const newOrder = pendingOrders.find(o => o.id === id);
      if (oldOrder && newOrder && (oldOrder.stopLoss !== newOrder.stopLoss || oldOrder.takeProfit !== newOrder.takeProfit || oldOrder.openPrice !== newOrder.openPrice)) {
        const procKey = `${this.userId}_${this.accountId}_${newOrder.id}`;
        if (!this.processing.has(procKey)) {
          this.processing.set(procKey, true);
          try {
            await this.connection.modifyOrder(newOrder.id, oldOrder.openPrice, oldOrder.stopLoss, oldOrder.takeProfit);
            previousPendingOrders.set(id, { ...newOrder, openPrice: oldOrder.openPrice, stopLoss: oldOrder.stopLoss, takeProfit: oldOrder.takeProfit });
          } catch (error) {
          //  console.error(`Failed to revert pending order ${newOrder.id}:`, error);
          } finally {
            this.processing.delete(procKey);
          }
        }
      } else {
        previousPendingOrders.set(id, newOrder);
      }
    });

    MySynchronizationListener.previousPositions.set(userAccountKey, previousPositions);
    MySynchronizationListener.previousPendingOrders.set(userAccountKey, previousPendingOrders);

    for (const position of positions) {
      if (position.reason !== 'POSITION_REASON_EXPERT' && !position.brokerComment?.startsWith('AlgoTrade')) {
        const procKey = `${this.userId}_${this.accountId}_${position.id}`;
        if (this.processing.has(procKey)) {
          continue;
        }
        this.processing.set(procKey, true);
        try {
          await this.connection.closePosition(position.id);
         // console.log(`[${new Date().toISOString()}] Closed non-algo position ${position.id} for user ${this.userId} accountId ${this.accountId}`);
        } catch (error) {
          if (error.stringCode !== 'ERR_TRADE_POSITION_NOT_FOUND') {
           // console.error(`failed to close position ${position.id}`, error);
          }
        } finally {
          this.processing.delete(procKey);
        }
      }
    }

    for (const order of pendingOrders) {
      if (order.reason !== 'ORDER_REASON_EXPERT' && !order.brokerComment?.startsWith('AlgoTrade')) {
        const procKey = `${this.userId}_${this.accountId}_${order.id}`;
        if (this.processing.has(procKey)) {
          continue;
        }
        this.processing.set(procKey, true);
        try {
          await this.connection.cancelOrder(order.id);
        //  console.log(`[${new Date().toISOString()}] Canceled non-algo pending order ${order.id} for user ${this.userId} accountId ${this.accountId}`);
        } catch (error) {
          if (error.stringCode !== 'ERR_TRADE_ORDER_NOT_FOUND') {
          //  console.error(`failed to cancel order ${order.id}`, error);
          }
        } finally {
          this.processing.delete(procKey);
        }
      }
    }

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
      openPrice: order.openPrice,
      currentVolume: order.currentVolume,
      brokerComment: order.comment,
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

    if (this.socketServer) {
      const room = `${this.userId}_${this.accountId}`;
      this.socketServer.to(room).emit('live-data', {
        accountId: this.accountId,
        positionData: {
          livePositions,
          pendingOrders: filteredPendingOrders,
          accountInformation: filteredAccountInfo,
        },
      });
    //  this.log('Emitted live data to room ' + room, { accountId: this.accountId, positionData: { livePositions, pendingOrders: filteredPendingOrders, accountInformation: filteredAccountInfo } });
    }
  }

  async onSymbolPriceUpdated(instanceIndex: any, price: any) {
  //  this.log('Symbol price updated', { symbol: price.symbol, bid: price.bid, ask: price.ask });
    if (this.socketServer) {
      const room = `${this.userId}_${this.accountId}`;
      this.socketServer.to(room).emit('symbol-price', {
        symbol: price.symbol,
        bid: price.bid,
        ask: price.ask,
      });
    }
  }

  async onSynchronizationStarted(instanceIndex: any, specificationsHash: string, positionsHash: string, ordersHash: string) {
    const terminalState = this.connection.terminalState;
    const userAccountKey = this.getUserAccountKey();
    const positionsMap = MySynchronizationListener.previousPositions.get(userAccountKey) || new Map();
    const ordersMap = MySynchronizationListener.previousPendingOrders.get(userAccountKey) || new Map();
    terminalState.positions.forEach(pos => positionsMap.set(pos.id, pos));
    terminalState.orders.forEach(order => ordersMap.set(order.id, order));
    MySynchronizationListener.previousPositions.set(userAccountKey, positionsMap);
    MySynchronizationListener.previousPendingOrders.set(userAccountKey, ordersMap);
    await this.manageSubscriptions();
    await this.emitLiveData();
  }

  async onPositionsUpdated(instanceIndex: any, position: any) {
    await this.manageSubscriptions();
    await this.emitLiveData();
  }

  async onPositionsReplaced(instanceIndex: any, replaced: any) {
    await this.manageSubscriptions();
    await this.emitLiveData();
  }

  async onPendingOrderUpdated(instanceIndex: any, orderUpdate: any) {
    await this.manageSubscriptions();
    await this.emitLiveData();
  }

  async onPendingOrderCompleted(instanceIndex: any, orderCompleted: any) {
    await this.manageSubscriptions();
    await this.emitLiveData();
  }

  async onAccountInformationUpdated(instanceIndex: any, accountInformation: any) {
    await this.emitLiveData();
  }

  async onBrokerConnectionStatusChanged(instanceIndex: any, status: any) {
    this.log('Broker connection status changed', { status: status.status, instanceIndex });
    if (status.status === 'DISCONNECTED') {
    //  console.warn(`[${new Date().toISOString()}] Broker disconnected for user ${this.userId} accountId ${this.accountId}`);
    } else if (status.status === 'CONNECTED') {
    //  console.log(`[${new Date().toISOString()}] Broker reconnected for user ${this.userId} accountId ${this.accountId}`);
      await this.emitLiveData();
    }
  }

  async onStreamClosed(instanceIndex: any) {
    for (const symbol of this.subscribedSymbols) {
      try {
        await this.connection.unsubscribeFromMarketData(symbol);
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Failed to unsubscribe from ${symbol}: ${error.message}`);
      }
    }
    this.subscribedSymbols.clear();
  }

  async onSubscriptionDowngraded(instanceIndex: any, symbol: string, updates: any, unsubscriptions: any) {}
  async onConnected(instanceIndex: any) {
    await this.manageSubscriptions();
    await this.emitLiveData();
  }

  async onDisconnected(instanceIndex: any) {}
}

interface VerifiedOrderData {
  maxLoss: number;
  maxProfit: number;
  quantity: number;
  orderType: string;
  side: string;
  symbol: string;
  stopLoss: number;
  takeProfit: number | number[];
  entryPrice?: number;
  comment?: string;
}

@Injectable()
export class TradingBotService implements OnModuleInit {
  private readonly domain = process.env.DOMAIN || 'agiliumtrade.agiliumtrade.ai';
  private metaApis: Map<string, MetaApi> = new Map();
  private accounts: Map<string, any> = new Map();
  private connections: Map<string, any> = new Map();
  private riskManagement: Map<string, RiskManagement> = new Map();
  private socketServer: Server | null = null;
  private listeners: Map<string, MySynchronizationListener> = new Map();

  constructor(
    @InjectModel(BrokerAccount.name) public accountModel: Model<BrokerAccount>,
  ) {}

  setSocketServer(server: Server) {
    this.socketServer = server;
   // console.log(`[${new Date().toISOString()}] Server set in TradingBotService:`, !!this.socketServer);
  }

  async onModuleInit() {
  //  console.log(`[${new Date().toISOString()}] Initializing TradingBotService on module init`);
    await this.initializeConnections();
  }

  private async initializeConnections() {
    try {
      const settings = await this.accountModel.find().exec();
      await Promise.all(
        settings.map(async (setting) => {
          try {
            await this.initializeSingle(setting.userId.toString(), setting.accountId, setting.apiKey);
          } catch (error) {
          //  console.error(`[${new Date().toISOString()}] Failed to initialize account for user ${setting.userId} accountId ${setting.accountId}: ${error.message}`);
          }
        }),
      );
    } catch (error) {
     // console.error(`[${new Date().toISOString()}] Connection initialization failed: ${error.message}`);
    }
  }

  async initializeSingle(userId: string, accountId: string, apiKey: string) {
    try {
      const key = `${userId}_${accountId}`;
      const metaApi = new MetaApi(apiKey, {
        domain: this.domain,
        requestTimeout: 60000,
        retryOpts: { retries: 500, minDelayInSeconds: 0.5, maxDelayInSeconds: 30 },
      });

      this.metaApis.set(key, metaApi);
      const riskManager = new RiskManagement(apiKey, { domain: this.domain });
      this.riskManagement.set(key, riskManager);

      const account = await metaApi.metatraderAccountApi.getAccount(accountId);
      if (account.state !== 'DEPLOYED') {
        await account.deploy();
        await account.waitDeployed();
      }

      await account.waitConnected();
      this.accounts.set(key, account);

      const connection = account.getStreamingConnection();
      await connection.connect();
      await connection.waitSynchronized({ timeoutInSeconds: 60 });
      this.connections.set(key, connection);

      const terminalState = connection.terminalState;
      console.log(`[${new Date().toISOString()}] Connection status for user ${userId} accountId ${accountId}:`
      , {
        connected: terminalState.connected,
        connectedToBroker: terminalState.connectedToBroker,
        synchronized: connection.synchronized,
      });

      const listener = new MySynchronizationListener(userId, accountId, connection, this.socketServer);
      try {
        connection.addSynchronizationListener(listener);
        this.listeners.set(key, listener);
        // Initialize favorite symbols for the listener
        const setting = await this.accountModel.findOne({ userId, accountId }).exec();
        if (setting) {
          await listener.updateFavorites(setting.favoriteSymbols || []);
        }
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Failed to add synchronization listener for user ${userId} accountId ${accountId}: ${error.message}`);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Failed to initialize connection for user ${userId} accountId ${accountId}: ${error.message}`);
      throw error;
    }
  }

  async disconnectAccount(userId: string, accountId: string) {
    try {
      const key = `${userId}_${accountId}`;
      const connection = this.connections.get(key);
      if (connection) {
        await connection.close();
      //  console.log(`[${new Date().toISOString()}] Closed connection for ${key}`);
        this.connections.delete(key);
        this.accounts.delete(key);
        this.metaApis.delete(key);
        this.riskManagement.delete(key);
        this.listeners.delete(key);
      } else {
       // console.log(`[${new Date().toISOString()}] No active connection found for ${key}, no action needed`);
      }
    } catch (error) {
    //  console.error(`[${new Date().toISOString()}] Failed to disconnect account for user ${userId} accountId ${accountId}: ${error.message}`);
      throw error;
    }
  }

  async addFavorite(userId: string, accountId: string, symbol: string) {
    try {
      const key = `${userId}_${accountId}`;
      const listener = this.listeners.get(key);
      if (!listener) throw new Error('No active listener for this account');
      const setting = await this.accountModel.findOne({ userId, accountId }).exec();
      if (!setting) throw new Error('Account not found');
      await listener.updateFavorites(setting.favoriteSymbols);
    } catch (error) {
    //  console.error(`[${new Date().toISOString()}] Failed to add favorite symbol ${symbol} for user ${userId} accountId ${accountId}: ${error.message}`);
      throw error;
    }
  }

  async removeFavorite(userId: string, accountId: string, symbol: string) {
    try {
      const key = `${userId}_${accountId}`;
      const listener = this.listeners.get(key);
      if (!listener) throw new Error('No active listener for this account');
      const setting = await this.accountModel.findOne({ userId, accountId }).exec();
      if (!setting) throw new Error('Account not found');
      await listener.updateFavorites(setting.favoriteSymbols);
    } catch (error) {
     // console.error(`[${new Date().toISOString()}] Failed to remove favorite symbol ${symbol} for user ${userId} accountId ${accountId}: ${error.message}`);
      throw error;
    }
  }

  async getMarketPrice(accountId: string, symbol: string, apiKey: string, location: string) {
    try {
      const apiUrl =
        location === 'NewYork'
          ? 'https://mt-client-api-v1.new-york.agiliumtrade.ai'
          : 'https://mt-client-api-v1.london.agiliumtrade.ai';
      const response = await axios.get(
        `${apiUrl}/users/current/accounts/${accountId}/symbols/${symbol}/current-price?keepSubscription=false`,
        {
          headers: {
            Accept: 'application/json',
            'auth-token': apiKey,
          },
        }
      );
      return response.data;
    } catch (error: any) {
     // console.error(`[${new Date().toISOString()}] Failed to fetch price for ${symbol}: ${error.message}`);
      throw new Error(`Failed to fetch price: ${error.message}`);
    }
  }

  private async getAccountBalance(accountId: string, apiKey: string, location: string) {
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
      return response.data.balance;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Failed to fetch account balance for accountId ${accountId}: ${error.message}`);
      throw new Error(`Failed to fetch account balance: ${error.message}`);
    }
  }

  private async calculateLotSize(symbol: string, stopLoss: number, riskPercentage: number, apiKey: string, location: string, accountId: string, connection: any, entryType: 'buy' | 'sell') {
    try {
      const marketPriceData = await this.getMarketPrice(accountId, symbol, apiKey, location);
      const marketPrice = entryType === 'buy' ? marketPriceData.ask : marketPriceData.bid;
      const accountBalance = await this.getAccountBalance(accountId, apiKey, location);

      const riskAmount = accountBalance * (riskPercentage / 100);
      const pipDistance = Math.abs(marketPrice - stopLoss);
      if (pipDistance <= 0) {
        throw new Error('Invalid pip distance: Stop loss too close to market price');
      }

      const lotSize = riskAmount / (pipDistance);
      const calculatedLotSize = Number(lotSize.toFixed(2));

      if (calculatedLotSize < 0.01) {
     //   console.warn(`[${new Date().toISOString()}] Calculated lot size ${calculatedLotSize} below minimum 0.01 for ${symbol}, using 0.01`);
        return 0.01;
      }

      return calculatedLotSize;
    } catch (error) {
     // console.error(`[${new Date().toISOString()}] Lot size calculation failed for symbol ${symbol}: ${error.message}`);
      throw new Error(`Lot size calculation failed: ${error.message}`);
    }
  }

  async verifyOrder(_id: string, symbol: string, entryType: 'buy' | 'sell', lotSize: number | undefined, stopLoss: number | undefined, takeProfit: number | number[] | undefined, userId: string, orderType: 'Market' | 'Stop' | 'Limit', comment?: string, entryPrice?: number): Promise<VerifiedOrderData> {
    try {
      const setting = await this.accountModel.findOne({ _id, userId }).exec();
      if (!setting) {
        throw new Error('Account settings not found for provided _id and userId');
      }

      if (!symbol || typeof symbol !== 'string' || symbol.trim() === '') {
        throw new Error('Invalid or missing symbol');
      }
      if (entryType !== 'buy' && entryType !== 'sell') {
        throw new Error('Invalid entryType');
      }
      if (orderType !== 'Market' && orderType !== 'Stop' && orderType !== 'Limit') {
        throw new Error('Invalid orderType');
      }
      if ((orderType === 'Stop' || orderType === 'Limit') && (entryPrice === undefined || isNaN(entryPrice) || entryPrice <= 0)) {
        throw new Error('Invalid or missing entryPrice for Stop/Limit order');
      }
      if (!stopLoss || isNaN(stopLoss) || stopLoss <= 0) {
        throw new Error('StopLoss is required');
      }
      if (
        takeProfit === undefined ||
        (typeof takeProfit === 'number' && (isNaN(takeProfit) || takeProfit <= 0)) ||
        (Array.isArray(takeProfit) && takeProfit.some(tp => isNaN(tp) || tp <= 0))
      ) {
        throw new Error('TakeProfit is required');
      }

      const key = `${userId}_${setting.accountId}`;
      const connection = this.connections.get(key);
      if (!connection) {
        await this.initializeSingle(userId, setting.accountId, setting.apiKey);
      }

      let finalLotSize: number;
      if (setting.autoLotSizeSet === true) {
        if (
          takeProfit === undefined ||
          (typeof takeProfit === 'number' && (isNaN(takeProfit) || takeProfit <= 0)) ||
          (Array.isArray(takeProfit) && takeProfit.some(tp => isNaN(tp) || tp <= 0))
        ) {
          throw new Error('TakeProfit is required');
        }
        if (!orderType) {
          throw new Error('StopLoss is required for auto lot size calculation');
        }
        if (!stopLoss || isNaN(stopLoss) || stopLoss <= 0) {
          throw new Error('StopLoss is required for auto lot size calculation');
        }
        finalLotSize = await this.calculateLotSize(symbol, stopLoss, setting.riskPercentage, setting.apiKey, setting.location, setting.accountId, connection, entryType);
      } else {
        if (
          takeProfit === undefined ||
          (typeof takeProfit === 'number' && (isNaN(takeProfit) || takeProfit <= 0)) ||
          (Array.isArray(takeProfit) && takeProfit.some(tp => isNaN(tp) || tp <= 0))
        ) {
          throw new Error('TakeProfit is required');
        }
        if (!stopLoss || isNaN(stopLoss) || stopLoss <= 0) {
          throw new Error('StopLoss is required for auto lot size calculation');
        }
        if (lotSize === undefined || isNaN(lotSize)) {
          throw new Error('Lot size is required when autoLotSizeSet is false');
        }
        if (lotSize < 0.01) {
          throw new Error('Minimum quantity 0.01 required');
        }
        finalLotSize = lotSize;
      }

      const marketPriceData = await this.getMarketPrice(setting.accountId, symbol, setting.apiKey, setting.location);
      const marketPrice = entryType === 'buy' ? marketPriceData.ask : marketPriceData.bid;
      const entry = orderType === 'Market' ? marketPrice : entryPrice || marketPrice;

      let maxLoss: number, maxProfit: number;
      const quantity = finalLotSize;
      if (entryType === 'buy') {
        maxLoss = stopLoss ? (entry - stopLoss) * quantity : 0;
        maxProfit = takeProfit
          ? Array.isArray(takeProfit)
            ? takeProfit.reduce((sum, tp) => sum + (tp - entry) * (quantity / takeProfit.length), 0)
            : (takeProfit - entry) * quantity
          : 0;
      } else {
        maxLoss = stopLoss ? (stopLoss - entry) * quantity : 0;
        maxProfit = takeProfit
          ? Array.isArray(takeProfit)
            ? takeProfit.reduce((sum, tp) => sum + (entry - tp) * (quantity / takeProfit.length), 0)
            : (entry - takeProfit) * quantity
          : 0;
      }

      if (setting.dailyRiskPercentage) {
        const pipDistance = Math.abs(entry - stopLoss);
        const proposedRisk = finalLotSize * pipDistance * (Array.isArray(takeProfit) ? takeProfit.length : 1);
        if (proposedRisk > setting.remainingDailyRisk) {
          throw new Error(`Order risk: ${proposedRisk} USD exceeds, Remaining daily risk: ${setting.remainingDailyRisk} USD`);
        }
      }

      const verifiedData: VerifiedOrderData = {
        maxLoss,
        maxProfit,
        quantity,
        orderType,
        side: entryType,
        symbol,
        stopLoss,
        takeProfit,
        entryPrice: orderType !== 'Market' ? entryPrice : undefined,
        comment: comment?.slice(0, 10).replace(/[^a-zA-Z0-9\s]/g, '') || 'Auto order',
      };

    //  console.log(`[${new Date().toISOString()}] Order verified successfully for userId ${userId} _id ${_id}:`, verifiedData);
      return verifiedData;
    } catch (error) {
     // console.error(`[${new Date().toISOString()}] Failed to verify order for userId ${userId} _id ${_id}:`, error);
      throw new Error(`Verification failed: ${error.message}`);
    }
  }

  async placeOrder(_id: string, symbol: string, entryType: 'buy' | 'sell', lotSize: number | undefined, stopLoss: number | undefined, takeProfit: number | number[] | undefined, userId: string, orderType: 'Market' | 'Stop' | 'Limit', comment?: string, entryPrice?: number) {
    try {
      const setting = await this.accountModel.findOne({ _id, userId }).exec();
      if (!setting) {
        throw new Error('Account settings not found for provided _id and userId');
      }

      let finalLotSize: number;
      if (setting.autoLotSizeSet === true) {
        if (
          takeProfit === undefined ||
          (typeof takeProfit === 'number' && (isNaN(takeProfit) || takeProfit <= 0)) ||
          (Array.isArray(takeProfit) && takeProfit.some(tp => isNaN(tp) || tp <= 0))
        ) {
          throw new Error('TakeProfit is required');
        }
        if (!orderType) {
          throw new Error('StopLoss is required for auto lot size calculation');
        }
        if (!stopLoss || isNaN(stopLoss) || stopLoss <= 0) {
          throw new Error('StopLoss is required for auto lot size calculation');
        }
        const key = `${userId}_${setting.accountId}`;
        const connection = this.connections.get(key);
        if (!connection) {
          throw new Error('No active MetaApi connection for lot size calculation');
        }
        finalLotSize = await this.calculateLotSize(symbol, stopLoss, setting.riskPercentage, setting.apiKey, setting.location, setting.accountId, connection, entryType);
      } else {
        if (
          takeProfit === undefined ||
          (typeof takeProfit === 'number' && (isNaN(takeProfit) || takeProfit <= 0)) ||
          (Array.isArray(takeProfit) && takeProfit.some(tp => isNaN(tp) || tp <= 0))
        ) {
          throw new Error('TakeProfit is required');
        }
        if (!stopLoss || isNaN(stopLoss) || stopLoss <= 0) {
          throw new Error('StopLoss is required for auto lot size calculation');
        }
        if (lotSize === undefined || isNaN(lotSize)) {
          throw new Error('Lot size is required when autoLotSizeSet is false');
        }
        if (lotSize < 0.01) {
          throw new Error('Minimum quantity 0.01 required');
        }
        finalLotSize = lotSize;
      }

      const numTargets = Array.isArray(takeProfit) ? takeProfit.length : 1;
      if (numTargets > 1) {
        const lotPerOrder = Number((finalLotSize / numTargets).toFixed(2));
        if (lotPerOrder < 0.01) {
          throw new Error('Minimum quantity 0.01 required per order after splitting');
        }
      }

      if (!symbol || typeof symbol !== 'string' || symbol.trim() === '') {
        throw new Error('Invalid or missing symbol');
      }
      if (entryType !== 'buy' && entryType !== 'sell') {
        throw new Error('Invalid entryType');
      }
      if (orderType !== 'Market' && orderType !== 'Stop' && orderType !== 'Limit') {
        throw new Error('Invalid orderType');
      }
      if ((orderType === 'Stop' || orderType === 'Limit') && (entryPrice === undefined || isNaN(entryPrice) || entryPrice <= 0)) {
        throw new Error('Invalid or missing entryPrice for Stop/Limit order');
      }

      const accountId = setting.accountId;
      const key = `${userId}_${accountId}`;
      if (!this.accounts.has(key)) {
        await this.initializeSingle(userId, accountId, setting.apiKey);
      }

      const connection = this.connections.get(key);
      if (!connection) {
        throw new Error('No active MetaApi connection');
      }

      const maxPositionLimit = setting.maxPositionLimit * setting.splittingTarget;
      const openPositions = connection.terminalState.positions || [];
      const pendingOrders = connection.terminalState.orders || [];
      const totalPositions = openPositions.length + pendingOrders.length;
      let ordersToPlace = numTargets;

      if (totalPositions + ordersToPlace > maxPositionLimit) {
        const positionsToClose = totalPositions + ordersToPlace - maxPositionLimit;
        const allItems = [
          ...openPositions.map(pos => ({ item: pos, isPending: false, time: new Date(pos.brokerTime).getTime() })),
          ...pendingOrders.map(order => ({ item: order, isPending: true, time: new Date(order.time).getTime() })),
        ].sort((a, b) => a.time - b.time);

        const toClose: any[] = [];
        let remaining = positionsToClose;
        const closedIds = new Set<string>();

        for (let i = 0; i < allItems.length && remaining > 0; i++) {
          const current = allItems[i];
          if (closedIds.has(current.item.id)) continue;

          if (current.isPending) {
            toClose.push(current.item);
            closedIds.add(current.item.id);
            remaining--;
          } else {
            const remainingPositions = allItems
              .filter(it => !it.isPending && !closedIds.has(it.item.id))
              .map(it => it.item);
            if (remainingPositions.length > 0) {
              const maxProfitPos = remainingPositions.reduce((max, p) => (p.profit > max.profit ? p : max), remainingPositions[0]);
              toClose.push(maxProfitPos);
              closedIds.add(maxProfitPos.id);
              remaining--;
            }
          }
        }

        if (toClose.length < positionsToClose) {
          throw new Error(`Failed to select ${positionsToClose} positions/orders to close`);
        }

        const closePromises = toClose.map(position => {
          if (position.currentVolume !== undefined) {
            return connection.cancelOrder(position.id).then(() => true).catch((error) => {
          //    console.error(`[${new Date().toISOString()}] Failed to cancel pending order ${position.id}: ${error.message}`);
              return false;
            });
          } else {
            return connection.closePosition(position.id).then(() => true).catch((error) => {
           //   console.error(`[${new Date().toISOString()}] Failed to close position ${position.id}: ${error.message}`);
              return false;
            });
          }
        });

        const closeResults = await Promise.all(closePromises);
        if (!closeResults.every(result => result === true)) {
          throw new Error(`Failed to close ${positionsToClose} required positions/orders to stay within max position limit (${maxPositionLimit})`);
        }
      }

      let takeProfits: number[] = [];
      if (takeProfit !== undefined) {
        if (Array.isArray(takeProfit)) {
          takeProfits = takeProfit.filter(tp => !isNaN(tp) && tp > 0).sort((a, b) => a - b);
          if (takeProfits.length !== takeProfit.length) {
            throw new Error('Invalid takeProfit values in array');
          }
        } else {
          if (isNaN(takeProfit) || takeProfit <= 0) {
            throw new Error('Invalid takeProfit value');
          }
          takeProfits = [takeProfit];
        }
      }
      if (numTargets > setting.splittingTarget) {
        throw new Error(`Number of targets (${numTargets}) exceeds splittingTarget (${setting.splittingTarget})`);
      }

      let proposedRisk = 0;
      if (setting.dailyRiskPercentage) {
        if (!stopLoss) throw new Error('StopLoss required for daily risk check');
        const marketPriceData = await this.getMarketPrice(accountId, symbol, setting.apiKey, setting.location);
        const marketPrice = entryType === 'buy' ? marketPriceData.ask : marketPriceData.bid;
        const pipDistance = Math.abs(marketPrice - stopLoss);
        if (pipDistance <= 0) throw new Error('Invalid pip distance');
        proposedRisk = finalLotSize * pipDistance * numTargets;
        if (proposedRisk > setting.remainingDailyRisk) {
          throw new Error(`Order risk ${proposedRisk} USD exceeds, Remaining daily risk ${setting.remainingDailyRisk} USD`);
        }
      }

      const maxCommentLength = 10;
      const safeComment = (comment || 'AutoOrder').slice(0, maxCommentLength).replace(/[^a-zA-Z0-9\s]/g, '');

      const results: any[] = [];
      const now = new Date();
      const dateTime = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;

      if (numTargets <= 1) {
        const clientId = `AlgoTrade_${dateTime}`.slice(0, 20);
        let result;
        if (orderType === 'Market') {
          if (entryType === 'buy') {
            result = await connection.createMarketBuyOrder(symbol, finalLotSize, stopLoss, takeProfits[0], { comment: safeComment, clientId: clientId });
          } else {
            result = await connection.createMarketSellOrder(symbol, finalLotSize, stopLoss, takeProfits[0], { comment: safeComment, clientId: clientId });
          }
        } else if (orderType === 'Stop') {
          if (entryType === 'buy') {
            result = await connection.createStopBuyOrder(symbol, finalLotSize, entryPrice!, stopLoss, takeProfits[0], { comment: safeComment, clientId: clientId });
          } else {
            result = await connection.createStopSellOrder(symbol, finalLotSize, entryPrice!, stopLoss, takeProfits[0], { comment: safeComment, clientId: clientId });
          }
        } else if (orderType === 'Limit') {
          if (entryType === 'buy') {
            result = await connection.createLimitBuyOrder(symbol, finalLotSize, entryPrice!, stopLoss, takeProfits[0], { comment: safeComment, clientId: clientId });
          } else {
            result = await connection.createLimitSellOrder(symbol, finalLotSize, entryPrice!, stopLoss, takeProfits[0], { comment: safeComment, clientId: clientId });
          }
        }
        results.push(result);
      } else {
        const lotPerOrder = Number((finalLotSize / numTargets).toFixed(2));
        const orderPromises = takeProfits.map(async (tp, i) => {
          const clientId = `AlgoTrade_${dateTime}`.slice(0, 20);
          if (orderType === 'Market') {
            if (entryType === 'buy') {
              return connection.createMarketBuyOrder(symbol, lotPerOrder, stopLoss, tp, { comment: safeComment, clientId: clientId });
            } else {
              return connection.createMarketSellOrder(symbol, lotPerOrder, stopLoss, tp, { comment: safeComment, clientId: clientId });
            }
          } else if (orderType === 'Stop') {
            if (entryType === 'buy') {
              return connection.createStopBuyOrder(symbol, lotPerOrder, entryPrice!, stopLoss, tp, { comment: safeComment, clientId: clientId });
            } else {
              return connection.createStopSellOrder(symbol, lotPerOrder, entryPrice!, stopLoss, tp, { comment: safeComment, clientId: clientId });
            }
          } else {
            if (entryType === 'buy') {
              return connection.createLimitBuyOrder(symbol, lotPerOrder, entryPrice!, stopLoss, tp, { comment: safeComment, clientId: clientId });
            } else {
              return connection.createLimitSellOrder(symbol, lotPerOrder, entryPrice!, stopLoss, tp, { comment: safeComment, clientId: clientId });
            }
          }
        });

        const orderResults = await Promise.all(orderPromises);
        results.push(...orderResults);
      }

      if (setting.dailyRiskPercentage) {
        setting.remainingDailyRisk -= proposedRisk;
        await setting.save();
      }

      return { message: `Order${numTargets > 1 ? 's' : ''} placed successfully`, result: numTargets === 1 ? results[0] : results };
    } catch (error) {
    //  console.error(`[${new Date().toISOString()}] Failed to place order for userId ${userId} _id ${_id}:`, error);
      throw new Error(`Validation failed: ${error.message}`);
    }
  }

  async getAccountInfo(userId: string, accountId: string) {
    try {
      const key = `${userId}_${accountId}`;
      const connection = this.connections.get(key);
      if (!connection) throw new Error('No active connection');

      const terminalState = connection.terminalState;
      return { accountInformation: terminalState.accountInformation, terminalState };
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Failed to get account info for userId ${userId} accountId ${accountId}: ${error.message}`);
      throw error;
    }
  }

  @Cron('0 * * * *')
  async handleDailyRiskReset() {
    try {
      const settings = await this.accountModel.find({ dailyRiskPercentage: { $gt: 0 } }).exec();
      await Promise.all(
        settings.map(async (setting) => {
          const userTimezone = 'Asia/Dubai';
          const now = moment.tz(userTimezone);
          const startOfDay = now.clone().startOf('day');
          const lastReset = setting.lastDailyReset ? moment(setting.lastDailyReset).tz(userTimezone) : null;

          if (!lastReset || lastReset.isBefore(startOfDay)) {
            const balance = await this.getAccountBalance(setting.accountId, setting.apiKey, setting.location);
            setting.remainingDailyRisk = balance * (setting.dailyRiskPercentage / 100);
            setting.lastDailyReset = startOfDay.toDate();
            await setting.save();
          //  console.log(`[${new Date().toISOString()}] Daily risk reset for user ${setting.userId} accountId ${setting.accountId} in timezone ${userTimezone}`);
          }
        }),
      );
    } catch (error) {
     // console.error(`[${new Date().toISOString()}] Failed to handle daily risk reset: ${error.message}`);
    }
  }
}


