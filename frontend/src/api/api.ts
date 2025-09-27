

import axios, { type AxiosInstance } from 'axios';
import io from 'socket.io-client';

const API_BASE_URL = import.meta.env.VITE_API_URL;
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers['X-Request-Timestamp'] = new Date().toISOString();
  return config;
});

export interface SignupData {
  email: string;
  mobile: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface LoginData {
  emailOrMobile: string;
  password: string;
}

export interface AccountData {
  _id?: string;
  brokerName: string;
  accountId: string;
  apiKey: string;
  location: string;
  maxPositionLimit: number | undefined;
  splittingTarget: number | undefined;
  riskPercentage: number | undefined;
  autoLotSizeSet: boolean;
  dailyRiskPercentage?: number;
  timezone?: string;
}

export interface AccountDetails extends AccountData {
  remainingDailyRisk?: number;
}

export interface OrderData {
  symbol: string;
  entryType: 'buy' | 'sell';
  lotSize?: number;
  stopLoss?: number;
  takeProfit?: number | number[];
  _id: string;
  orderType: 'Market' | 'Stop' | 'Limit';
  entryPrice?: number;
  comment?: string;
  timestamp?: string;
}

export interface Position {
  positionId: string;
  symbol: string;
  lotSize: number;
  entryTime: string;
  stopLoss: number;
  takeProfit?: number;
  profitLoss: number;
  accountId: string;
}

let socket: any = null;

export const initializeSocket = (token: string, accountId: string) => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  socket = io(API_BASE_URL, {
    auth: { token, accountId, timestamp: new Date().toISOString() },
  });
  socket.on('connect', () => {
    console.log(`Socket.IO connected for account ${accountId}`);
  });
  socket.on('disconnect', () => {
    console.log(`Socket.IO disconnected for account ${accountId}`);
  });
  socket.on('order-response', (response: { message?: string; positionIds?: string[]; error?: string }) => {
    console.log('Order response:', response);
  });
  socket.on('equity-balance', (data: { accountId: string; equity: number; balance: number }) => {
    console.log(`[${new Date().toISOString()}] Equity/Balance:`, data);
  });
  return socket;
};

export const getSocket = () => socket;

export const verifyOrder = async (data: OrderData) => {
  if (!socket) {
    const error = 'Socket.IO not connected';
    console.error(`[${new Date().toISOString()}] ${error}`);
    throw new Error(error);
  }
  const orderDataWithTimestamp = { ...data,
     timestamp: new Date().toISOString()
     };
  return new Promise((resolve, reject) => {
    socket.emit('verify-order', orderDataWithTimestamp);
    socket.on('verify-order-response', (response: { data?: any; error?: string }) => {
      console.log(`[${new Date().toISOString()}] Received verify order response:`, response);
      if (response.error) {
        console.error(`[${new Date().toISOString()}] Verify order failed: ${response.error}`);
        reject(new Error(response.error));
      } else {
        resolve(response.data);
      }
    });
  });
};

export const placeOrder = async (data: OrderData) => {
  if (!socket) {
    const error = 'Socket.IO not connected';
    console.error(`[${new Date().toISOString()}] ${error}`);
    throw new Error(error);
  }
  const orderDataWithTimestamp = { ...data, timestamp: new Date().toISOString() };
  return new Promise((resolve, reject) => {
    socket.emit('place-order', orderDataWithTimestamp);
    socket.on('order-response', (response: { message?: string; positionIds?: string[]; error?: string }) => {
      console.log(`[${new Date().toISOString()}] Received order response:`, response);
      if (response.error) {
        console.error(`[${new Date().toISOString()}] Order failed: ${response.error}`);
        reject(new Error(response.error));
      } else {
        resolve(response);
      }
    });
  });
};

export const signup = async (data: SignupData) => {
  const response = await api.post('/auth/signup', { ...data, timestamp: new Date().toISOString() });
  return response.data;
};

export const login = async (data: LoginData) => {
  const response = await api.post('/auth/login', { ...data, timestamp: new Date().toISOString() });
  return response.data;
};

export const addAccount = async (data: AccountData) => {
  const response = await api.post('/accounts/add', { ...data, timestamp: new Date().toISOString() });
  return response.data;
};

export const confirmAccount = async (data: AccountData) => {
  const response = await api.post('/accounts/confirm', { ...data, timestamp: new Date().toISOString() });
  return response.data;
};

export const verifyToken = async () => {
  const response = await api.get('/auth/verify-token', { headers: { 'X-Request-Timestamp': new Date().toISOString() } });
  return response.data;
};

export const getUserAccounts = async () => {
  const response = await api.get('/account-details/accounts', 
    { headers: { 'X-Request-Timestamp': new Date().toISOString() } }
  );
  const accounts = response.data.map((account: any) => ({
    _id: account._id,
    brokerName: account.brokerName,
    accountId: account.accountId,
    maxPositionLimit: account.maxPositionLimit,
  }));
  return accounts;
};


export const getAccountDetails = async (id: string) => {
  const response = await api.get(`/account-details/account/${id}`, {
    headers: { 'X-Request-Timestamp': new Date().toISOString() },
  });
  console.log("Account details response:", response.data);
  return response.data;
};





export const getFavorites = async (id: string) => {
  try {
    const response = await api.get(`/account-details/${id}/favorites`, {
      headers: { 'X-Request-Timestamp': new Date().toISOString() },
    });
    console.log(`[${new Date().toISOString()}] Favorite symbols response:`, response.data);
    return response.data.map((symbol: string) => symbol.toUpperCase());
  } catch (error: any) {
    console.error(`[${new Date().toISOString()}] Failed to fetch favorite symbols:`, error.response?.data || error.message);
    throw error;
  }
};

export const addFavorite = async (id: string, symbol: string) => {
  try {
    const response = await api.post(`/account-details/${id}/favorites`, { symbol: symbol.toUpperCase(), timestamp: new Date().toISOString() });
    console.log(`[${new Date().toISOString()}] Add favorite symbol response:`, response.data);
    return response.data;
  } catch (error: any) {
    console.error(`[${new Date().toISOString()}] Failed to add favorite symbol:`, error.response?.data || error.message);
    throw error;
  }
};

export const removeFavorite = async (id: string, symbol: string) => {
  try {
    const response = await api.delete(`/account-details/${id}/favorites/${symbol.toUpperCase()}`, {
      headers: { 'X-Request-Timestamp': new Date().toISOString() },
    });
    console.log(`[${new Date().toISOString()}] Remove favorite symbol response:`, response.data);
    return response.data;
  } catch (error: any) {
    console.error(`[${new Date().toISOString()}] Failed to remove favorite symbol:`, error.response?.data || error.message);
    throw error;
  }
};


export const logout = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  localStorage.removeItem('token');
};

