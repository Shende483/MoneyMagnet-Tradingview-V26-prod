




import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  useTheme,
  IconButton,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import type { SelectChangeEvent } from '@mui/material/Select';
import { verifyToken, placeOrder, verifyOrder, initializeSocket, getUserAccounts, getAccountDetails, addFavorite, removeFavorite, getFavorites } from '../api/api';
import Header from './Header';
import _ from 'lodash';
import { TrendingUp, TrendingDown, DollarSign, Settings, User, Building2 } from 'lucide-react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

interface Position {
  id: string;
  platform: string;
  type: 'BUY' | 'SELL' | 'LIMIT';
  symbol: string;
  brokerTime: string;
  openPrice: number;
  volume: number;
  brokerComment: string;
  stopLoss?: number;
  takeProfit?: number;
  liveProfit: number;
}

interface PendingOrder {
  id: string;
  type: string;
  symbol: string;
  time: string;
  currentVolume: number;
  brokerComment: string;
  stopLoss?: number;
  takeProfit?: number;
  openPrice?: number;
}

interface AccountInformation {
  platform: string;
  type: string;
  broker: string;
  currency: string;
  credit: number;
  server: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  leverage: number;
  marginLevel: number;
  marginMode: string;
  name: string;
  login: number;
}

interface Account {
  _id: string;
  brokerName: string;
  accountId: string;
  maxPositionLimit?: number;
}

interface AccountDetails extends Account {
  splittingTarget?: number;
  riskPercentage?: number;
  autoLotSizeSet?: boolean;
  dailyRiskPercentage?: number;
  remainingDailyRisk?: number;
  timezone?: string;
  location?: string;
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

interface SymbolPrice {
  symbol: string;
  bid: number;
  ask: number;
}

const numberFmt = (n: number | undefined | null): string =>
  typeof n === 'number' && !isNaN(n) ? n.toFixed(4) : '0.00';

const stringFmt = (v: any): string => (v != null ? String(v) : 'undefined');

const Dashboard: React.FC = () => {
  const theme = useTheme();
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedMetaApiAccountId, setSelectedMetaApiAccountId] = useState<string>('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountDetails, setAccountDetails] = useState<AccountDetails | null>(null);
  const [orderData, setOrderData] = useState({
    symbol: '',
    entryType: 'buy' as 'buy' | 'sell',
    lotSize: '',
    stopLoss: '',
    takeProfit: [] as string[],
    orderType: 'Market' as 'Market' | 'Stop' | 'Limit',
    comment: '',
    entryPrice: '',
  });
  const [positions, setPositions] = useState<Position[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [accountInformation, setAccountInformation] = useState<AccountInformation | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [verifiedData, setVerifiedData] = useState<VerifiedOrderData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [favoriteSymbols, setFavoriteSymbols] = useState<string[]>([]);
  const [newFavoriteSymbol, setNewFavoriteSymbol] = useState<string>('');
  const [symbolPrices, setSymbolPrices] = useState<SymbolPrice[]>([]);
  const navigate = useNavigate();

  const extractErrorMessage = (err: any): string => {
    if (err.response?.data?.error) {
      return typeof err.response.data.error === 'string'
        ? err.response.data.error
        : JSON.stringify(err.response.data.error);
    }
    return err.message || 'An unexpected error occurred';
  };

  useEffect(() => {
    const checkToken = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        toast.error('No token found. Redirecting to login.', { toastId: 'no-token' });
        navigate('/login');
        return;
      }
      try {
        await verifyToken();
        const accountsData = await getUserAccounts();
        setAccounts(accountsData || []);
        if (accountsData?.length > 0 && !selectedAccountId) {
          setSelectedAccountId(accountsData[0]._id);
          setSelectedMetaApiAccountId(accountsData[0].accountId);
          toast.success('Accounts loaded successfully', { toastId: 'accounts-loaded' });
        }
      } catch (err: any) {
        const errorMessage = extractErrorMessage(err);
        toast.error(errorMessage, { toastId: 'token-verification-failed' });
        localStorage.removeItem('token');
        navigate('/login');
      }
    };
    checkToken();
  }, [navigate]);

  useEffect(() => {
    if (!selectedAccountId) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    const socket = initializeSocket(token, selectedAccountId);

    socket.on('connect', () => {
      toast.success(`Connected to account ${selectedAccountId}`, { toastId: `socket-connect-${selectedAccountId}` });
    });

    socket.on('live-data', (data: { accountId: string; positionData: { livePositions: Position[], pendingOrders: PendingOrder[], accountInformation: AccountInformation } }) => {
      if (data.accountId !== selectedMetaApiAccountId) {
        return;
      }
      if (data.positionData && Array.isArray(data.positionData.livePositions)) {
        setPositions(data.positionData.livePositions);
      }
      setPendingOrders(data.positionData.pendingOrders || []);
      setAccountInformation(data.positionData.accountInformation || null);
    });

    socket.on('order-response', (response: { message?: string; positionIds?: string[]; error?: any }) => {
      if (response.error) {
        const errorMessage = typeof response.error === 'string' ? response.error : JSON.stringify(response.error) || 'Failed to place order';
        toast.error(errorMessage, { toastId: 'order-failed' });
      } else {
        toast.success(response.message || 'Order placed successfully', { toastId: 'order-success' });
        setOrderData({ symbol: '', entryType: 'buy', lotSize: '', stopLoss: '', takeProfit: [], orderType: 'Market', comment: '', entryPrice: '' });
      }
      setShowConfirmation(false);
      setIsSubmitting(false);
    });

    socket.on('verify-order-response', (response: { data?: VerifiedOrderData; error?: any }) => {
      if (response.error) {
        const errorMessage = typeof response.error === 'string' ? response.error : JSON.stringify(response.error) || 'Failed to verify order';
        toast.error(errorMessage, { toastId: 'verify-order-failed' });
        setShowConfirmation(false);
        setIsSubmitting(false);
      } else if (response.data) {
        setVerifiedData(response.data);
        setShowConfirmation(true);
        toast.success('Order verified successfully', { toastId: 'verify-order-success' });
      }
    });

    socket.on('equity-balance', (data: { accountId: string; equity: number; balance: number }) => {
      if (data.accountId === selectedMetaApiAccountId) {
        setAccountInformation(prev => prev ? ({
          ...prev,
          equity: data.equity,
          balance: data.balance,
        } as AccountInformation) : null);
      }
    });

    socket.on('symbol-price', (data: { symbol: string; bid: number; ask: number }) => {
    //  console.log('nnnnnnnnnnnccds',data)
      setSymbolPrices(prev => {
        const updated = prev.filter(p => p.symbol !== data.symbol);
        return [...updated, { symbol: data.symbol, bid: data.bid, ask: data.ask }];
      });
    });

    socket.on('disconnect', () => {
      toast.warn(`Disconnected from account ${selectedAccountId}`, { toastId: `socket-disconnect-${selectedAccountId}` });
    });

    return () => {
      socket.off('live-data');
      socket.off('order-response');
      socket.off('verify-order-response');
      socket.off('equity-balance');
      socket.off('symbol-price');
      socket.off('connect');
      socket.off('disconnect');
      socket.disconnect();
    };
  }, [selectedAccountId, selectedMetaApiAccountId]);

  useEffect(() => {
    if (accountDetails?.splittingTarget) {
      setOrderData((prev) => ({
        ...prev,
        takeProfit: Array(accountDetails.splittingTarget).fill(''),
      }));
    }
  }, [accountDetails?.splittingTarget]);

  const handleAccountChange = async (accountId: string) => {
    setSelectedAccountId(accountId);
    const account = accounts.find((acc) => acc._id === accountId);
    setSelectedMetaApiAccountId(account ? account.accountId : '');
    setPositions([]);
    setPendingOrders([]);
    setAccountInformation(null);
    setAccountDetails(null);
    setFavoriteSymbols([]);
    setSymbolPrices([]);
    try {
      const [detailsResponse, favoritesResponse] = await Promise.all([
        getAccountDetails(accountId),
        getFavorites(accountId),
      ]);
      setAccountDetails(detailsResponse || null);
      setFavoriteSymbols(favoritesResponse || []);
      toast.success('Account details and symbols loaded successfully', { toastId: `account-details-${accountId}` });
    } catch (err: any) {
      const errorMessage = extractErrorMessage(err);
      toast.error(errorMessage, { toastId: 'account-details-failed' });
    }
  };

  const handleOrderChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent<string>
  ) => {
    const { name, value } = e.target;
    if (!name) return;
    if (name.startsWith('takeProfit-')) {
      const index = parseInt(name.split('-')[1]);
      setOrderData((prev) => {
        const newTakeProfit = [...prev.takeProfit];
        newTakeProfit[index] = value as string;
        return { ...prev, takeProfit: newTakeProfit };
      });
    } else {
      setOrderData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleVerifyOrder = _.debounce(async () => {
    if (!isFormValid()) {
      toast.error('Please fill in all required fields (Symbol, Side, Order Type, Stop Loss, Take Profit)', { toastId: 'form-invalid' });
      return;
    }
    setIsSubmitting(true);
    try {
      const takeProfit = orderData.takeProfit
        .map((val) => val.trim())
        .filter((val) => val !== '')
        .map(Number)
        .filter((n) => !isNaN(n));
      if (takeProfit.length === 0) {
        toast.error('Take Profit is required', { toastId: 'no-take-profit' });
        setIsSubmitting(false);
        return;
      }
      if (!orderData.stopLoss || Number(orderData.stopLoss) <= 0) {
        toast.error('Stop Loss is required and must be greater than 0', { toastId: 'invalid-stop-loss' });
        setIsSubmitting(false);
        return;
      }
      if (!accountDetails?.autoLotSizeSet && (!orderData.lotSize || Number(orderData.lotSize) <= 0)) {
        toast.error('Lot Size is required and must be greater than 0 when Auto Lot Size is disabled', { toastId: 'invalid-lot-size' });
        setIsSubmitting(false);
        return;
      }
      const data = {
        _id: selectedAccountId,
        symbol: orderData.symbol.trim().toUpperCase(),
        entryType: orderData.entryType,
        lotSize: accountDetails?.autoLotSizeSet ? undefined : Number(orderData.lotSize),
        stopLoss: Number(orderData.stopLoss),
        takeProfit: takeProfit.length > 0 ? (takeProfit.length === 1 ? takeProfit[0] : takeProfit) : undefined,
        orderType: orderData.orderType,
        comment: orderData.comment.trim() || undefined,
        entryPrice: orderData.orderType !== 'Market' && orderData.entryPrice ? Number(orderData.entryPrice) : undefined,
      };
      await verifyOrder(data);
    } catch (err: any) {
      const errorMessage = extractErrorMessage(err);
      toast.error(errorMessage, { toastId: 'verify-order-error' });
      setIsSubmitting(false);
    }
  }, 500);

  const handleConfirmOrder = _.debounce(async () => {
    if (!isFormValid()) {
      toast.error('Please fill in all required fields (Symbol, Side, Order Type, Stop Loss, Take Profit)', { toastId: 'form-invalid-confirm' });
      return;
    }
    setIsSubmitting(true);
    try {
      const takeProfit = orderData.takeProfit
        .map((val) => val.trim())
        .filter((val) => val !== '')
        .map(Number)
        .filter((n) => !isNaN(n));
      if (takeProfit.length === 0) {
        toast.error('Take Profit is required', { toastId: 'no-take-profit-confirm' });
        setIsSubmitting(false);
        return;
      }
      if (!orderData.stopLoss || Number(orderData.stopLoss) <= 0) {
        toast.error('Stop Loss is required and must be greater than 0', { toastId: 'invalid-stop-loss-confirm' });
        setIsSubmitting(false);
        return;
      }
      if (!accountDetails?.autoLotSizeSet && (!orderData.lotSize || Number(orderData.lotSize) <= 0)) {
        toast.error('Lot Size is required and must be greater than 0 when Auto Lot Size is disabled', { toastId: 'invalid-lot-size-confirm' });
        setIsSubmitting(false);
        return;
      }
      const data = {
        _id: selectedAccountId,
        symbol: orderData.symbol.trim().toUpperCase(),
        entryType: orderData.entryType,
        lotSize: accountDetails?.autoLotSizeSet ? undefined : Number(orderData.lotSize),
        stopLoss: Number(orderData.stopLoss),
        takeProfit: takeProfit.length > 0 ? (takeProfit.length === 1 ? takeProfit[0] : takeProfit) : undefined,
        orderType: orderData.orderType,
        comment: orderData.comment.trim() || undefined,
        entryPrice: orderData.orderType !== 'Market' && orderData.entryPrice ? Number(orderData.entryPrice) : undefined,
      };
      const response = await placeOrder(data);
      if (response && typeof response === 'object' && !('error' in response && response.error)) {
        try {
          const updatedDetails = await getAccountDetails(selectedAccountId);
          setAccountDetails(updatedDetails || null);
          toast.success('Account details updated successfully', { toastId: 'account-details-updated' });
        } catch (err: any) {
          const errorMessage = extractErrorMessage(err);
          toast.error(errorMessage, { toastId: 'account-details-error' });
        }
      }
    } catch (err: any) {
      const errorMessage = extractErrorMessage(err);
      toast.error(errorMessage, { toastId: 'place-order-error' });
      setShowConfirmation(false);
      setIsSubmitting(false);
    }
  }, 500);

  const handleCancelConfirmation = () => {
    setShowConfirmation(false);
    setVerifiedData(null);
    setIsSubmitting(false);
  };

  const handleAddFavorite = _.debounce(async () => {
    if (!newFavoriteSymbol.trim()) {
      toast.error('Please enter a symbol', { toastId: 'empty-symbol' });
      return;
    }
    if (favoriteSymbols.length >= 5) {
      toast.error('Maximum 5 symbols allowed', { toastId: 'max-symbols' });
      return;
    }
    try {
      const response = await addFavorite(selectedAccountId, newFavoriteSymbol.toUpperCase());
      const updatedFavorites = await getFavorites(selectedAccountId);
      setFavoriteSymbols(updatedFavorites || []);
      setNewFavoriteSymbol('');
      toast.success(response.message || 'Symbol added', { toastId: 'add-symbol-success' });
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || extractErrorMessage(err);
      toast.error(errorMessage, { toastId: 'add-symbol-failed' });
    }
  }, 500);

  const handleRemoveFavorite = (symbol: string) => async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await removeFavorite(selectedAccountId, symbol);
      const updatedFavorites = await getFavorites(selectedAccountId);
      setFavoriteSymbols(updatedFavorites || []);
      setSymbolPrices(prev => prev.filter(p => p.symbol !== symbol));
      if (orderData.symbol === symbol) {
        setOrderData(prev => ({ ...prev, symbol: '' }));
      }
      toast.success(response.message || 'Symbol removed', { toastId: 'remove-symbol-success' });
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || extractErrorMessage(err);
      toast.error(errorMessage, { toastId: 'remove-symbol-failed' });
    }
  };

  const isFormValid = () => {
    if (!selectedAccountId) return false;
    if (!orderData.symbol.trim()) return false;
    if (!accountDetails?.autoLotSizeSet && (!orderData.lotSize || Number(orderData.lotSize) <= 0)) return false;
    if (!orderData.stopLoss || Number(orderData.stopLoss) <= 0) return false;
    if (orderData.takeProfit.every((val) => val.trim() === '')) return false;
    if ((orderData.orderType === 'Stop' || orderData.orderType === 'Limit') && (!orderData.entryPrice || Number(orderData.entryPrice) <= 0)) return false;
    return true;
  };

  return (
    <>
      <Header selectedAccountId={selectedAccountId} onAccountChange={handleAccountChange} />
      <Box
        sx={{
          minHeight: '100vh',
          background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #121212, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, #f8fafc, #e0f2fe, #e0e7ff)',
          p: 1,
        }}
      >
        <Box sx={{ maxWidth: '1200px', mx: 'auto' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr 1fr' }, gap: 1 }}>
            <Card
              sx={{
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, white, #f1f5f9)',
                transition: 'box-shadow 0.3s',
                '&:hover': { boxShadow: '0 4px 15px rgba(0,0,0,0.15)' },
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #2563eb, #4f46e5)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Building2 size={18} />
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>Platform Details</Typography>
                  </Box>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                {accountInformation ? (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Platform:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{stringFmt(accountInformation.platform)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Type:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
                        {stringFmt(accountInformation.type).replace('ACCOUNT_TRADE_MODE_', '')}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Broker:</Typography>
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, maxWidth: '440px', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {stringFmt(accountInformation.broker)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Currency:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
                        {stringFmt(accountInformation.currency)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Server:</Typography>
                      <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, maxWidth: '440px' }}>
                        {stringFmt(accountInformation.server)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Name:</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <User size={14} color={theme.palette.text.secondary} />
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{stringFmt(accountInformation.name)}</Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Login:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{stringFmt(accountInformation.login)}</Typography>
                    </Box>
                  </>
                ) : (
                  <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700 }}>
                    No platform details available
                  </Typography>
                )}
              </CardContent>
            </Card>

            <Card
              sx={{
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, white, #f1f5f9)',
                transition: 'box-shadow 0.3s',
                '&:hover': { boxShadow: '0 4px 15px rgba(0,0,0,0.15)' },
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #2563eb, #4f46e5)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Settings size={18} />
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>Risk Settings</Typography>
                  </Box>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                {accountDetails ? (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Timezone:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{stringFmt(accountDetails.timezone)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Auto Lot Size:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 200, color: accountDetails.autoLotSizeSet ? '#16a34a' : '#dc2626' }}>
                        {accountDetails.autoLotSizeSet ? 'Enabled' : 'Disabled'}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Splitting Target:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{numberFmt(accountDetails.splittingTarget)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Max Position Limit:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{numberFmt(accountDetails.maxPositionLimit)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Total Max Position Limit:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
                        {numberFmt(accountDetails.splittingTarget && accountDetails.maxPositionLimit 
                          ? accountDetails.splittingTarget * accountDetails.maxPositionLimit 
                          : undefined)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Risk Percentage / Entry:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{numberFmt(accountDetails.riskPercentage)}%</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Daily Risk %:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{numberFmt(accountDetails.dailyRiskPercentage)}%</Typography>
                    </Box>
                  </>
                ) : (
                  <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700 }}>
                    No risk settings available
                  </Typography>
                )}
              </CardContent>
            </Card>

            <Card
              sx={{
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, white, #f1f5f9)',
                transition: 'box-shadow 0.3s',
                '&:hover': { boxShadow: '0 4px 15px rgba(0,0,0,0.15)' },
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #2563eb, #4f46e5)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <DollarSign size={18} />
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>Financial Info</Typography>
                  </Box>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                {accountInformation ? (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Currency:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
                        {stringFmt(accountInformation.currency)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Balance:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>${numberFmt(accountInformation.balance)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Equity:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>${numberFmt(accountInformation.equity)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Credit:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>${numberFmt(accountInformation.credit)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Margin:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>${numberFmt(accountInformation.margin)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Free Margin:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#1cb7efff' }}>${numberFmt(accountInformation.freeMargin)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Today Risk Left:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#f97316' }}>${numberFmt(accountDetails?.remainingDailyRisk)}</Typography>
                    </Box>
                  </>
                ) : (
                  <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700 }}>
                    No financial info available
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'row', gap: 1, mt: 1, flexWrap: 'nowrap', maxWidth: '1200px' }}>
            <Card
              sx={{
                flex: '0 0 75%',
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? '#1e293b' : 'white',
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #1e293b, #334155)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>
                    Live Positions & Pending Orders
                  </Typography>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                <Box sx={{ mb: 1 }}>
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, color: theme.palette.text.primary }}>
                    <TrendingUp size={18} color="#16a34a" />
                    Live Positions
                  </Typography>
                  {positions.length === 0 ? (
                    <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700, py: 0.5 }}>
                      No open positions
                    </Typography>
                  ) : (
                    <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                      <Table size="small" aria-label="positions table">
                        <TableHead sx={{ background: theme.palette.mode === 'dark' ? '#2d3748' : '#f1f5f9' }}>
                          <TableRow>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Symbol</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Type</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Volume</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Timing</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Open Price</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Stop Loss</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Take Profit</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Comment</TableCell>
                            <TableCell align="left" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>P&L</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {positions.map((position) => {
                            const isProfit = position.liveProfit >= 0;
                            return (
                              <TableRow key={position.id} hover sx={{ '&:hover': { background: theme.palette.mode === 'dark' ? '#374151' : '#f8fafc' } }}>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{position.symbol}</TableCell>
                                <TableCell>
                                  <Chip
                                    label={position.type}
                                    sx={{
                                      background: position.type === 'BUY' ? '#16a34a' : '#dc2626',
                                      color: 'white',
                                      fontSize: '0.7rem',
                                      fontWeight: 700,
                                    }}
                                  />
                                </TableCell>
                                <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(position.volume)}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{position.brokerTime}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(position.openPrice)}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{numberFmt(position.stopLoss)}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>{numberFmt(position.takeProfit)}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{position.brokerComment}</TableCell>
                                <TableCell align="right">
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: isProfit ? '#16a34a' : '#dc2626', fontWeight: 700, fontSize: '0.75rem' }}>
                                    {isProfit ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                    ${numberFmt(position.liveProfit)}
                                  </Box>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, color: theme.palette.text.primary }}>
                    <TrendingUp size={18} color="#f97316" />
                    Pending Orders
                  </Typography>
                  {pendingOrders.length === 0 ? (
                    <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700, py: 0.5 }}>
                      No pending orders
                    </Typography>
                  ) : (
                    <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                      <Table size="small" aria-label="pending orders table">
                        <TableHead sx={{ background: theme.palette.mode === 'dark' ? '#2d3748' : '#f1f5f9' }}>
                          <TableRow>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Symbol</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Type</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Volume</TableCell>
                            <TableCell align="left" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Timing</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Open Price</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Stop Loss</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Take Profit</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Comment</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {pendingOrders.map((order) => (
                            <TableRow key={order.id} hover sx={{ '&:hover': { background: theme.palette.mode === 'dark' ? '#374151' : '#f8fafc' } }}>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{order.symbol}</TableCell>
                              <TableCell>
                                <Chip label={order.type} sx={{ background: '#fef3c7', color: '#c2410c', border: '1px solid #fed7aa', fontSize: '0.7rem', fontWeight: 700 }} />
                              </TableCell>
                              <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(order.currentVolume)}</TableCell>
                              <TableCell align="left" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{order.time}</TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(order.openPrice)}</TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{numberFmt(order.stopLoss)}</TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>{numberFmt(order.takeProfit)}</TableCell>
                              <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{stringFmt(order.brokerComment)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
              </CardContent>
            </Card>

            <Card
              sx={{
                flex: '0 0 25%',
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
                background: '#1e2a4d',
                borderRadius: 2,
                minHeight: 'auto',
              }}
            >
              <CardHeader
                sx={{
                  background: orderData.entryType === 'buy' ? '#287419ff' : '#ef4444',
                  color: '#d4d9e6',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>
                    Place Order
                  </Typography>
                }
              />
             
              <CardContent sx={{ p: 1, pb: '8px !important', background: '#2d3748' }}>
                <Box component="form" noValidate autoComplete="off" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5, background: theme.palette.mode === 'dark' ? '#2d3748' : '#e2e8f0', p: 0.5, borderRadius: 2 }}>
                    <Button
                      onClick={() => setOrderData((prev) => ({ ...prev, entryType: 'buy' }))}
                      sx={{
                        width: '100%',
                        borderRadius: 1,
                        py: 0.5,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        transition: 'all 0.2s',
                        background: orderData.entryType === 'buy' ? '#287419ff' : 'transparent',
                        color: orderData.entryType === 'buy' ? '#d4d9e6' : theme.palette.text.secondary,
                        '&:hover': { background: orderData.entryType === 'buy' ? '#287419ff' : theme.palette.mode === 'dark' ? '#374151' : '#d1d5db' },
                      }}
                    >
                      BUY
                    </Button>
                    <Button
                      onClick={() => setOrderData((prev) => ({ ...prev, entryType: 'sell' }))}
                      sx={{
                        width: '100%',
                        borderRadius: 1,
                        py: 0.5,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        transition: 'all 0.2s',
                        background: orderData.entryType === 'sell' ? '#ef4444' : 'transparent',
                        color: orderData.entryType === 'sell' ? '#d4d9e6' : theme.palette.text.secondary,
                        '&:hover': { background: orderData.entryType === 'sell' ? '#dc2626' : theme.palette.mode === 'dark' ? '#374151' : '#d1d5db' },
                      }}
                    >
                      SELL
                    </Button>
                  </Box>

                  <FormControl fullWidth>
                    <InputLabel sx={{ fontSize: '0.75rem', color: '#d4d9e6' }}>Symbol (e.g., EURUSD)</InputLabel>
                    <Select
                      name="symbol"
                      value={orderData.symbol}
                      onChange={handleOrderChange}
                      label="Symbol (e.g., EURUSD)"
                      sx={{
                        borderRadius: 2,
                        '& .MuiSelect-select': { 
                          fontFamily: 'monospace', 
                          textAlign: 'center', 
                          textTransform: 'uppercase', 
                          letterSpacing: 1, 
                          fontSize: '0.75rem', 
                          background: '#2d3748', 
                          color: '#d4d9e6',
                          py: 1.5,
                        },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
                      }}
                    >
                      {favoriteSymbols.length === 0 ? (
                        <MenuItem disabled sx={{ fontSize: '0.75rem', color: '#d4d9e6', fontStyle: 'italic' }}>
                          No symbols available
                        </MenuItem>
                      ) : (
                        favoriteSymbols.map((symbol) => {
                          const price = symbolPrices.find(p => p.symbol === symbol);
                          return (
                            <MenuItem key={symbol} value={symbol} sx={{ fontSize: '0.75rem', background: '#2d3748', color: '#d4d9e6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                <Typography sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#d4d9e6' }}>
                                  {symbol}
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                  {price && (
                                    <>
                                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#16a34a' }}>
                                        Bid: {numberFmt(price.bid)}
                                      </Typography>
                                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#ef6363ff' }}>
                                        Ask: {numberFmt(price.ask)}
                                      </Typography>
                                    </>
                                  )}
                                  <IconButton
                                    onClick={handleRemoveFavorite(symbol)}
                                    sx={{ p: 0.5 }}
                                  >
                                    <CloseIcon sx={{ fontSize: '0.9rem', color: '#dc2626' }} />
                                  </IconButton>
                                </Box>
                              </Box>
                            </MenuItem>
                          );
                        })
                      )}
                      <Box sx={{ display: 'flex', gap: 0.5, p: 0.5, background: '#2d3748', borderTop: '1px solid #3b4a7a' }}>
                        <TextField
                          fullWidth
                          label="Enter Symbol"
                          value={newFavoriteSymbol}
                          onChange={(e) => setNewFavoriteSymbol(e.target.value)}
                          sx={{
                            '& .MuiOutlinedInput-root': { 
                              borderRadius: 1, 
                              fontFamily: 'monospace', 
                              textAlign: 'center', 
                              textTransform: 'uppercase', 
                              letterSpacing: 0.8, 
                              fontSize: '0.7rem', 
                              background: '#2d3748', 
                              color: '#d4d9e6' 
                            },
                            '& .MuiInputLabel-root': { fontSize: '0.7rem', color: '#d4d9e6' },
                            '& .MuiInputBase-input': { fontSize: '0.7rem' },
                            '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
                            '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
                          }}
                        />
                        <Button
                          onClick={handleAddFavorite}
                          disabled={isSubmitting || !newFavoriteSymbol.trim() || favoriteSymbols.length >= 5}
                          sx={{
                            borderRadius: 1,
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            background: '#facc15',
                            color: '#1e293b',
                            px: 0.8,
                            '&:hover': { background: '#eab308' },
                            '&.Mui-disabled': { background: '#6b7aa8', cursor: 'not-allowed' },
                          }}
                        >
                          Add
                        </Button>
                      </Box>
                    </Select>
                  </FormControl>

                  <FormControl fullWidth>
                    <InputLabel sx={{ fontSize: '0.75rem', color: '#d4d9e6' }}>Order Type</InputLabel>
                    <Select
                      name="orderType"
                      value={orderData.orderType}
                      onChange={handleOrderChange}
                      label="Order Type"
                      sx={{
                        borderRadius: 2,
                        '& .MuiSelect-select': { fontSize: '0.75rem', background: '#2d3748', color: '#d4d9e6' },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
                      }}
                    >
                      <MenuItem value="Market" sx={{ fontSize: '0.75rem', background: '#2d3748', color: '#d4d9e6' }}>Market</MenuItem>
                      <MenuItem value="Stop" sx={{ fontSize: '0.75rem', background: '#2d3748', color: '#d4d9e6' }}>Stop</MenuItem>
                      <MenuItem value="Limit" sx={{ fontSize: '0.75rem', background: '#2d3748', color: '#d4d9e6' }}>Limit</MenuItem>
                    </Select>
                  </FormControl>
                  {(orderData.orderType === 'Stop' || orderData.orderType === 'Limit') && (
                    <TextField
                      fullWidth
                      label="Entry Price"
                      name="entryPrice"
                      type="number"
                      variant="outlined"
                      value={orderData.entryPrice}
                      onChange={handleOrderChange}
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontFamily: 'monospace', fontSize: '0.75rem', background: '#2d3748', color: '#d4d9e6' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#d4d9e6' },
                        '& .MuiInputBase-input': { fontSize: '0.75rem' },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
                        '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
                      }}
                      inputProps={{ step: '0.00001', inputMode: 'decimal' }}
                    />
                  )}
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
                    {!accountDetails?.autoLotSizeSet && (
                      <TextField
                        fullWidth
                        label="Lot Size"
                        name="lotSize"
                        type="number"
                        variant="outlined"
                        value={orderData.lotSize}
                        onChange={handleOrderChange}
                        sx={{
                          '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontSize: '0.75rem', background: '#2d3748', color: '#d4d9e6' },
                          '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#d4d9e6' },
                          '& .MuiInputBase-input': { fontSize: '0.75rem' },
                          '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
                          '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
                        }}
                        inputProps={{ step: '0.01', inputMode: 'decimal' }}
                      />
                    )}
                    <TextField
                      fullWidth
                      label="Stop Loss"
                      name="stopLoss"
                      type="number"
                      variant="outlined"
                      value={orderData.stopLoss}
                      onChange={handleOrderChange}
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontFamily: 'monospace', background: '#2d3748', fontSize: '0.75rem' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#ef4444' },
                        '& .MuiInputBase-input': { fontSize: '0.75rem', color: '#d4d9e6' },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
                        '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
                      }}
                      inputProps={{ step: '0.00001', inputMode: 'decimal' }}
                    />
                    {accountDetails?.splittingTarget && Array.from({ length: accountDetails.splittingTarget || 0 }, (_, index) => (
                      <TextField
                        key={`takeProfit-${index}`}
                        fullWidth
                        label={`Target ${index + 1}`}
                        name={`takeProfit-${index}`}
                        type="text"
                        variant="outlined"
                        value={orderData.takeProfit[index] || ''}
                        onChange={handleOrderChange}
                        sx={{
                          '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontFamily: 'monospace', background: '#2d3748', fontSize: '0.75rem' },
                          '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#16a34a' },
                          '& .MuiInputBase-input': { fontSize: '0.75rem', color: '#d4d9e6' },
                          '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
                          '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
                        }}
                        inputProps={{ inputMode: 'decimal' }}
                      />
                    ))}
                    <TextField
                      fullWidth
                      label="Comment (optional)"
                      name="comment"
                      variant="outlined"
                      value={orderData.comment}
                      onChange={handleOrderChange}
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '0.75rem', background: '#2d3748', color: '#d4d9e6' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#d4d9e6' },
                        '& .MuiInputBase-input': { fontSize: '0.75rem' },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
                        '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
                      }}
                    />
                  </Box>
                  <Button
                    fullWidth
                    variant="contained"
                    onClick={handleVerifyOrder}
                    disabled={isSubmitting}
                    sx={{
                      py: 0.75,
                      borderRadius: 2,
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      textTransform: 'none',
                      background: orderData.entryType === 'buy' ? '#487b33ff' : '#ef4444',
                      color: '#d4d9e6',
                      boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
                      '&:hover': {
                        background: orderData.entryType === 'buy' ? '#42802dff' : '#dc2626',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.25)',
                      },
                      '&.Mui-disabled': { background: '#6b7aa8', cursor: 'not-allowed' },
                    }}
                  >
                    Place {orderData.entryType.toUpperCase()} Order
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Box>

        <Dialog 
          open={showConfirmation} 
          onClose={handleCancelConfirmation} 
          sx={{ 
            '& .MuiDialog-paper': { 
              width: '40%', 
              minHeight: '40%', 
              borderRadius: 3, 
              boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
              background: theme.palette.mode === 'dark' ? '#1e293b' : '#ffffff',
            } 
          }}
        >
          <DialogTitle 
            sx={{ 
              fontSize: '1.2rem', 
              fontWeight: 600, 
              textAlign: 'center', 
              py: 2, 
              color: theme.palette.text.primary,
              background: theme.palette.mode === 'dark' ? 'linear-gradient(to right, #1e293b, #2d3748)' : 'linear-gradient(to right, #f8fafc, #e0f2fe)',
              borderBottom: `1px solid ${theme.palette.divider}`,
            }}
          >
            Confirm Order
          </DialogTitle>
          <DialogContent sx={{ maxWidth: '1000px', p: 3, background: theme.palette.mode === 'dark' ? '#1e293b' : '#ffffff' }}>
            {verifiedData ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box 
                  sx={{ 
                    background: theme.palette.mode === 'dark' ? '#2d3748' : '#f8fafc', 
                    p: 2, 
                    borderRadius: 2, 
                    border: `1px solid ${theme.palette.mode === 'dark' ? '#374151' : '#e2e8f0'}` 
                  }}
                >
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, fontSize: '0.85rem' }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>Symbol:</Typography>
                        <Typography sx={{ fontFamily: 'monospace', fontWeight: 600, color: theme.palette.text.primary }}>{verifiedData.symbol || 'N/A'}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>Side:</Typography>
                        <Chip
                          label={verifiedData.side || 'N/A'}
                          sx={{
                            background: verifiedData.side === 'BUY' ? '#dc2626' : '#16a34a',
                            color: 'white',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            px: 1,
                            borderRadius: 1,
                          }}
                        />
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>Type:</Typography>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.primary }}>{verifiedData.orderType || 'N/A'}</Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>Quantity:</Typography>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.primary }}>{numberFmt(verifiedData.quantity)}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>SL:</Typography>
                        <Typography sx={{ fontFamily: 'monospace', fontWeight: 600, color: '#dc2626' }}>{numberFmt(verifiedData.stopLoss)}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>TP:</Typography>
                        <Typography sx={{ fontFamily: 'monospace', fontWeight: 600, color: '#16a34a' }}>
                          {Array.isArray(verifiedData.takeProfit) ? verifiedData.takeProfit.map(n => numberFmt(n)).join(', ') : numberFmt(verifiedData.takeProfit)}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  <Box 
                    sx={{ 
                      background: '#fef2f2', 
                      border: '1px solid #fecaca', 
                      p: 2, 
                      borderRadius: 2, 
                      textAlign: 'center',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    }}
                  >
                    <Typography sx={{ color: '#dc2626', fontSize: '0.75rem', fontWeight: 600, mb: 0.5 }}>MAX LOSS</Typography>
                    <Typography sx={{ color: '#dc2626', fontSize: '1rem', fontWeight: 600 }}>${numberFmt(Math.abs(verifiedData.maxLoss))}</Typography>
                  </Box>
                  <Box 
                    sx={{ 
                      background: '#f0fdf4', 
                      border: '1px solid #bbf7d0', 
                      p: 2, 
                      borderRadius: 2, 
                      textAlign: 'center',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    }}
                  >
                    <Typography sx={{ color: '#16a34a', fontSize: '0.75rem', fontWeight: 600, mb: 0.5 }}>MAX PROFIT</Typography>
                    <Typography sx={{ color: '#16a34a', fontSize: '1rem', fontWeight: 600 }}>${numberFmt(verifiedData.maxProfit)}</Typography>
                  </Box>
                </Box>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, textAlign: 'center', color: theme.palette.text.primary, py: 2 }}>
                  Verifying order...
                </Typography>
              </Box>
            )}
          </DialogContent>
          <DialogActions sx={{ pt: 1, pb: 2, px: 3, display: 'flex', gap: 2, justifyContent: 'center' }}>
            <Button
              onClick={handleCancelConfirmation}
              variant="outlined"
              sx={{ 
                flex: 1, 
                borderRadius: 2, 
                fontSize: '0.85rem', 
                fontWeight: 600, 
                textTransform: 'none', 
                py: 0.75,
                borderColor: theme.palette.mode === 'dark' ? '#4b5563' : '#d1d5db',
                color: theme.palette.text.primary,
                '&:hover': { 
                  background: theme.palette.mode === 'dark' ? '#374151' : '#f3f4f6',
                  borderColor: theme.palette.mode === 'dark' ? '#6b7280' : '#9ca3af',
                },
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmOrder}
              variant="contained"
              sx={{
                flex: 1,
                borderRadius: 2,
                fontSize: '0.85rem',
                fontWeight: 600,
                textTransform: 'none',
                background: '#3b82f6',
                py: 0.75,
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                '&:hover': { 
                  background: '#1e40af',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                },
              }}
            >
              Confirm
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
      <ToastContainer 
        position="top-center"
        autoClose={7000}
        hideProgressBar={false}
        newestOnTop={true}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme={theme.palette.mode}
        toastStyle={{
          backgroundColor: theme.palette.mode === 'dark' ? '#1e2a4d' : '#ffffff',
          color: theme.palette.mode === 'dark' ? '#d4d9e6' : '#000000',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
          fontSize: '1rem',
          padding: '12px',
          minHeight: '60px',
        }}
      />
    </>
  );
};

export default Dashboard;













/*
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  useTheme,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import { verifyToken, placeOrder, verifyOrder, initializeSocket, getUserAccounts, getAccountDetails } from '../api/api';
import Header from './Header';
import _ from 'lodash';
import { TrendingUp, TrendingDown, DollarSign, Settings, User, Building2 } from 'lucide-react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

interface Position {
  id: string;
  platform: string;
  type: 'BUY' | 'SELL' | 'LIMIT';
  symbol: string;
  brokerTime: string;
  openPrice: number;
  volume: number;
  brokerComment: string;
  stopLoss?: number;
  takeProfit?: number;
  liveProfit: number;
}

interface PendingOrder {
  id: string;
  type: string;
  symbol: string;
  time: string;
  currentVolume: number;
  brokerComment: string;
  stopLoss?: number;
  takeProfit?: number;
  openPrice?: number;
}

interface AccountInformation {
  platform: string;
  type: string;
  broker: string;
  currency: string;
  credit: number;
  server: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  leverage: number;
  marginLevel: number;
  marginMode: string;
  name: string;
  login: number;
}

interface Account {
  _id: string;
  brokerName: string;
  accountId: string;
  maxPositionLimit?: number;
}

interface AccountDetails extends Account {
  splittingTarget?: number;
  riskPercentage?: number;
  autoLotSizeSet?: boolean;
  dailyRiskPercentage?: number;
  remainingDailyRisk?: number;
  timezone?: string;
  location?: string;
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

const numberFmt = (n: number | undefined | null) =>
  typeof n === 'number' && !isNaN(n) ? n.toFixed(2) : 'undefined';

const stringFmt = (v: any) => (v != null ? String(v) : 'undefined');

const Dashboard: React.FC = () => {
  const theme = useTheme();
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedMetaApiAccountId, setSelectedMetaApiAccountId] = useState<string>('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountDetails, setAccountDetails] = useState<AccountDetails | null>(null);
  const [orderData, setOrderData] = useState({
    symbol: '',
    entryType: 'buy' as 'buy' | 'sell',
    lotSize: '',
    stopLoss: '',
    takeProfit: [] as string[],
    orderType: 'Market' as 'Market' | 'Stop' | 'Limit',
    comment: '',
    entryPrice: '',
  });
  const [positions, setPositions] = useState<Position[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [accountInformation, setAccountInformation] = useState<AccountInformation | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [verifiedData, setVerifiedData] = useState<VerifiedOrderData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  // Helper function to extract error message
  const extractErrorMessage = (err: any): string => {
    if (err.response?.data?.error) {
      return typeof err.response.data.error === 'string'
        ? err.response.data.error
        : JSON.stringify(err.response.data.error);
    }
    return err.message || 'An unexpected error occurred';
  };

  useEffect(() => {
    const checkToken = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
       // console.log('No token found, redirecting to login');
        toast.error('No token found. Redirecting to login.', { toastId: 'no-token' });
        navigate('/login');
        return;
      }
      try {
        await verifyToken();
        const accountsData = await getUserAccounts();
        setAccounts(accountsData);
      //  console.log('Accounts:', accountsData);
        if (accountsData.length > 0 && !selectedAccountId) {
          setSelectedAccountId(accountsData[0]._id);
          setSelectedMetaApiAccountId(accountsData[0].accountId);
          toast.success('Accounts loaded successfully', { toastId: 'accounts-loaded' });
        }
      } catch (err: any) {
       // console.error('Token verification failed:', err, 'Response:', err.response?.data);
        const errorMessage = extractErrorMessage(err);
        toast.error(errorMessage, { toastId: 'token-verification-failed' });
        localStorage.removeItem('token');
        navigate('/login');
      }
    };
    checkToken();
  }, [navigate]);

  useEffect(() => {
    if (!selectedAccountId) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    const socket = initializeSocket(token, selectedAccountId);

    socket.on('connect', () => {
     // console.log(`Socket.IO connected for account ${selectedAccountId}`);
      toast.success(`Connected to account ${selectedAccountId}`, { toastId: `socket-connect-${selectedAccountId}` });
    });

    socket.on('live-data', (data: { accountId: string; positionData: { livePositions: Position[], pendingOrders: PendingOrder[], accountInformation: AccountInformation } }) => {
      if (data.accountId !== selectedMetaApiAccountId) {
       // console.log(`Ignoring live-data for account ${data.accountId}, expected ${selectedMetaApiAccountId}`);
        return;
      }
      if (data.positionData && Array.isArray(data.positionData.livePositions)) {
        setPositions(data.positionData.livePositions);
      }
      setPendingOrders(data.positionData.pendingOrders || []);
      setAccountInformation(data.positionData.accountInformation || null);
    });

    socket.on('order-response', (response: { message?: string; positionIds?: string[]; error?: any }) => {
    //  console.log(`[${new Date().toISOString()}] Order response in Dashboard:`, response);
      if (response.error) {
        const errorMessage = typeof response.error === 'string' ? response.error : JSON.stringify(response.error) || 'Failed to place order';
        toast.error(errorMessage, { toastId: 'order-failed' });
       // console.error('Order failed:', errorMessage);
      } else {
        toast.success('Order placed successfully', { toastId: 'order-success' });
        setOrderData({ symbol: '', entryType: 'buy', lotSize: '', stopLoss: '', takeProfit: [], orderType: 'Market', comment: '', entryPrice: '' });
      //  console.log('Order placed successfully:', response);
      }
      setShowConfirmation(false);
      setIsSubmitting(false);
    });

    socket.on('verify-order-response', (response: { data?: VerifiedOrderData; error?: any }) => {
     // console.log(`[${new Date().toISOString()}] Verify order response in Dashboard:`, response);
      if (response.error) {
        const errorMessage = typeof response.error === 'string' ? response.error : JSON.stringify(response.error) || 'Failed to verify order';
        toast.error(errorMessage, { toastId: 'verify-order-failed' });
      //  console.error('Verify order failed:', errorMessage);
        setShowConfirmation(false);
        setIsSubmitting(false);
      } else if (response.data) {
        setVerifiedData(response.data);
        setShowConfirmation(true);
        toast.success('Order verified successfully', { toastId: 'verify-order-success' });
      }
    });

    socket.on('equity-balance', (data: { accountId: string; equity: number; balance: number }) => {
    //  console.log(`[${new Date().toISOString()}] Equity/Balance:`, data);
      if (data.accountId === selectedMetaApiAccountId) {
        setAccountInformation(prev => ({
          ...prev,
          equity: data.equity,
          balance: data.balance,
        } as AccountInformation));
      } else {
      //  console.log(`Ignoring equity-balance for account ${data.accountId}, expected ${selectedMetaApiAccountId}`);
      }
    });

    socket.on('disconnect', () => {
     // console.log(`Socket.IO disconnected for account ${selectedAccountId}`);
      toast.warn(`Disconnected from account ${selectedAccountId}`, { toastId: `socket-disconnect-${selectedAccountId}` });
    });

    return () => {
      socket.off('live-data');
      socket.off('order-response');
      socket.off('verify-order-response');
      socket.off('equity-balance');
      socket.off('connect');
      socket.off('disconnect');
      socket.disconnect();
    };
  }, [selectedAccountId, selectedMetaApiAccountId]);

  useEffect(() => {
    if (accountDetails?.splittingTarget) {
      setOrderData((prev) => ({
        ...prev,
        takeProfit: Array(accountDetails.splittingTarget).fill(''),
      }));
    }
  }, [accountDetails?.splittingTarget]);

  const handleOrderChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent
  ) => {
    const { name, value } = e.target as HTMLInputElement;
    if (name.startsWith('takeProfit-')) {
      const index = parseInt(name.split('-')[1]);
      setOrderData((prev) => {
        const newTakeProfit = [...prev.takeProfit];
        newTakeProfit[index] = value;
        return { ...prev, takeProfit: newTakeProfit };
      });
    } else {
      setOrderData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleVerifyOrder = _.debounce(async () => {
    if (!isFormValid()) {
      toast.error('Please fill in all required fields (Symbol, Side, Order Type, Stop Loss, Take Profit)', { toastId: 'form-invalid' });
      return;
    }
    setIsSubmitting(true);
    try {
      const takeProfit = orderData.takeProfit
        .map((val) => val.trim())
        .filter((val) => val !== '')
        .map(Number)
        .filter((n) => !isNaN(n));
      if (takeProfit.length === 0) {
        toast.error('Take Profit is required', { toastId: 'no-take-profit' });
        setIsSubmitting(false);
        return;
      }
      if (!orderData.stopLoss || Number(orderData.stopLoss) <= 0) {
        toast.error('Stop Loss is required and must be greater than 0', { toastId: 'invalid-stop-loss' });
        setIsSubmitting(false);
        return;
      }
      if (!accountDetails?.autoLotSizeSet && (!orderData.lotSize || Number(orderData.lotSize) <= 0)) {
        toast.error('Lot Size is required and must be greater than 0 when Auto Lot Size is disabled', { toastId: 'invalid-lot-size' });
        setIsSubmitting(false);
        return;
      }
      const data = {
        _id: selectedAccountId,
        symbol: orderData.symbol.trim().toUpperCase(),
        entryType: orderData.entryType,
        lotSize: accountDetails?.autoLotSizeSet ? undefined : Number(orderData.lotSize),
        stopLoss: Number(orderData.stopLoss),
        takeProfit: takeProfit.length > 0 ? (takeProfit.length === 1 ? takeProfit[0] : takeProfit) : undefined,
        orderType: orderData.orderType,
        comment: orderData.comment.trim() || undefined,
        entryPrice: orderData.orderType !== 'Market' && orderData.entryPrice ? Number(orderData.entryPrice) : undefined,
      };

     // console.log('Verifying order:', data);
      await verifyOrder(data);
    } catch (err: any) {
      const errorMessage = extractErrorMessage(err);
    //  console.error(`[${new Date().toISOString()}] Verify order failed:`, err);
      toast.error(errorMessage, { toastId: 'verify-order-error' });
      setIsSubmitting(false);
    }
  }, 500);

  const handleConfirmOrder = _.debounce(async () => {
    if (!isFormValid()) {
      toast.error('Please fill in all required fields (Symbol, Side, Order Type, Stop Loss, Take Profit)', { toastId: 'form-invalid-confirm' });
      return;
    }
    setIsSubmitting(true);
    try {
      const takeProfit = orderData.takeProfit
        .map((val) => val.trim())
        .filter((val) => val !== '')
        .map(Number)
        .filter((n) => !isNaN(n));
      if (takeProfit.length === 0) {
        toast.error('Take Profit is required', { toastId: 'no-take-profit-confirm' });
        setIsSubmitting(false);
        return;
      }
      if (!orderData.stopLoss || Number(orderData.stopLoss) <= 0) {
        toast.error('Stop Loss is required and must be greater than 0', { toastId: 'invalid-stop-loss-confirm' });
        setIsSubmitting(false);
        return;
      }
      if (!accountDetails?.autoLotSizeSet && (!orderData.lotSize || Number(orderData.lotSize) <= 0)) {
        toast.error('Lot Size is required and must be greater than 0 when Auto Lot Size is disabled', { toastId: 'invalid-lot-size-confirm' });
        setIsSubmitting(false);
        return;
      }
      const data = {
        _id: selectedAccountId,
        symbol: orderData.symbol.trim().toUpperCase(),
        entryType: orderData.entryType,
        lotSize: accountDetails?.autoLotSizeSet ? undefined : Number(orderData.lotSize),
        stopLoss: Number(orderData.stopLoss),
        takeProfit: takeProfit.length > 0 ? (takeProfit.length === 1 ? takeProfit[0] : takeProfit) : undefined,
        orderType: orderData.orderType,
        comment: orderData.comment.trim() || undefined,
        entryPrice: orderData.orderType !== 'Market' && orderData.entryPrice ? Number(orderData.entryPrice) : undefined,
      };

     // console.log('Submitting order (validated):', data);
      const response = await placeOrder(data);
      if (response && typeof response === 'object' && !('error' in response && response.error)) {
        try {
          const updatedDetails = await getAccountDetails(selectedAccountId);
          setAccountDetails(updatedDetails);
         // console.log('Updated account details:', updatedDetails);
          toast.success('Account details updated successfully', { toastId: 'account-details-updated' });
        } catch (err: any) {
          const errorMessage = extractErrorMessage(err);
         // console.error(`[${new Date().toISOString()}] Failed to fetch updated account details:`, err);
          toast.error(errorMessage, { toastId: 'account-details-error' });
        }
      }
    } catch (err: any) {
      const errorMessage = extractErrorMessage(err);
     // console.error(`[${new Date().toISOString()}] Place order failed:`, err);
      toast.error(errorMessage, { toastId: 'place-order-error' });
      setShowConfirmation(false);
      setIsSubmitting(false);
    }
  }, 500);

  const handleCancelConfirmation = () => {
    setShowConfirmation(false);
    setVerifiedData(null);
    setIsSubmitting(false);
  };

  const handleAccountChange = async (accountId: string) => {
    setSelectedAccountId(accountId);
    const account = accounts.find((acc) => acc._id === accountId);
    setSelectedMetaApiAccountId(account ? account.accountId : '');
   // console.log('Selected MongoDB _id:', accountId, 'MetaApi accountId:', account ? account.accountId : '');
    setPositions([]);
    setPendingOrders([]);
    setAccountInformation(null);
    setAccountDetails(null);
    try {
      const response = await getAccountDetails(accountId);
      setAccountDetails(response);
      toast.success('Account details loaded successfully', { toastId: `account-details-${accountId}` });
    } catch (err: any) {
      const errorMessage = extractErrorMessage(err);
    //  console.error(`[${new Date().toISOString()}] Failed to fetch account details:`, err);
      toast.error(errorMessage, { toastId: 'account-details-failed' });
    }
  };

  const isFormValid = () => {
    if (!selectedAccountId) return false;
    if (!orderData.symbol.trim()) return false;
    if (!accountDetails?.autoLotSizeSet && (!orderData.lotSize || Number(orderData.lotSize) <= 0)) return false;
    if (!orderData.stopLoss || Number(orderData.stopLoss) <= 0) return false;
    if (orderData.takeProfit.every((val) => val.trim() === '')) return false;
    if ((orderData.orderType === 'Stop' || orderData.orderType === 'Limit') && (!orderData.entryPrice || Number(orderData.entryPrice) <= 0)) return false;
    return true;
  };

  return (
    <>
      <Header selectedAccountId={selectedAccountId} onAccountChange={handleAccountChange} />
      <Box
        sx={{
          minHeight: '100vh',
          background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #121212, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, #f8fafc, #e0f2fe, #e0e7ff)',
          p: 1,
        }}
      >
        <Box sx={{ maxWidth: '1200px', mx: 'auto' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr 1fr' }, gap: 1 }}>
            <Card
              sx={{
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, white, #f1f5f9)',
                transition: 'box-shadow 0.3s',
                '&:hover': { boxShadow: '0 4px 15px rgba(0,0,0,0.15)' },
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #2563eb, #4f46e5)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Building2 size={18} />
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>Platform Details</Typography>
                  </Box>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                {accountInformation ? (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Platform:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{stringFmt(accountInformation.platform)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Type:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
                        {stringFmt(accountInformation.type).replace('ACCOUNT_TRADE_MODE_', '')}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Broker:</Typography>
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, maxWidth: '440px', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {stringFmt(accountInformation.broker)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Currency:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
                        {stringFmt(accountInformation.leverage)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Server:</Typography>
                      <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, maxWidth: '440px' }}>
                        {stringFmt(accountInformation.server)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Name:</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <User size={14} color={theme.palette.text.secondary} />
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{stringFmt(accountInformation.name)}</Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Login:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{stringFmt(accountInformation.login)}</Typography>
                    </Box>
                  </>
                ) : (
                  <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700 }}>
                    No platform details available
                  </Typography>
                )}
              </CardContent>
            </Card>

            <Card
              sx={{
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, white, #f1f5f9)',
                transition: 'box-shadow 0.3s',
                '&:hover': { boxShadow: '0 4px 15px rgba(0,0,0,0.15)' },
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #2563eb, #4f46e5)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Settings size={18} />
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>Risk Settings</Typography>
                  </Box>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                {accountDetails ? (
                  <>
                     <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Timezone:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{stringFmt(accountDetails.timezone)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Auto Lot Size:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 200, color: accountDetails.autoLotSizeSet ? '#16a34a' : '#dc2626' }}>
                        {accountDetails.autoLotSizeSet ? 'Enabled' : 'Disabled'}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Splitting Target:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{numberFmt(accountDetails.splittingTarget)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Max Position Limit:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{numberFmt(accountDetails.maxPositionLimit)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Total Max Position Limit:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
                        {numberFmt(accountDetails.splittingTarget && accountDetails.maxPositionLimit 
                          ? accountDetails.splittingTarget * accountDetails.maxPositionLimit 
                          : undefined)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Risk Percentage / Entry:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{numberFmt(accountDetails.riskPercentage)}%</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Daily Risk %:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{numberFmt(accountDetails.dailyRiskPercentage)}%</Typography>
                    </Box>
                  </>
                ) : (
                  <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700 }}>
                    No risk settings available
                  </Typography>
                )}
              </CardContent>
            </Card>

            <Card
              sx={{
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, white, #f1f5f9)',
                transition: 'box-shadow 0.3s',
                '&:hover': { boxShadow: '0 4px 15px rgba(0,0,0,0.15)' },
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #2563eb, #4f46e5)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <DollarSign size={18} />
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>Financial Info</Typography>
                  </Box>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                {accountInformation ? (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Currency:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
                        {stringFmt(accountInformation.currency)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Balance:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>${numberFmt(accountInformation.balance)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Equity:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>${numberFmt(accountInformation.equity)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Credit:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>${numberFmt(accountInformation.credit)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Margin:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>${numberFmt(accountInformation.margin)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Free Margin:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#1cb7efff' }}>${numberFmt(accountInformation.freeMargin)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Today Risk Left:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#f97316' }}>${numberFmt(accountDetails?.remainingDailyRisk)}</Typography>
                    </Box>
                  </>
                ) : (
                  <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700 }}>
                    No financial info available
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'row', gap: 1, mt: 1, flexWrap: 'nowrap', maxWidth: '1200px' }}>
            <Card
              sx={{
                flex: '0 0 75%',
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? '#1e293b' : 'white',
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #1e293b, #334155)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>
                    Live Positions & Pending Orders
                  </Typography>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                <Box sx={{ mb: 1 }}>
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, color: theme.palette.text.primary }}>
                    <TrendingUp size={18} color="#16a34a" />
                    Live Positions
                  </Typography>
                  {positions.length === 0 ? (
                    <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700, py: 0.5 }}>
                      No open positions
                    </Typography>
                  ) : (
                    <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                      <Table size="small" aria-label="positions table">
                        <TableHead sx={{ background: theme.palette.mode === 'dark' ? '#2d3748' : '#f1f5f9' }}>
                          <TableRow>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Symbol</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Type</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Volume</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Timing</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Open Price</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Stop Loss</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Take Profit</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Comment</TableCell>
                            <TableCell align="left" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>P&L</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {positions.map((position) => {
                            const isProfit = position.liveProfit >= 0;
                            return (
                              <TableRow key={position.id} hover sx={{ '&:hover': { background: theme.palette.mode === 'dark' ? '#374151' : '#f8fafc' } }}>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{position.symbol}</TableCell>
                                <TableCell>
                                  <Chip
                                    label={position.type}
                                    sx={{
                                      background: position.type === 'BUY' ? '#16a34a' : '#dc2626',
                                      color: 'white',
                                      fontSize: '0.7rem',
                                      fontWeight: 700,
                                    }}
                                  />
                                </TableCell>
                                <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(position.volume)}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{position.brokerTime}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(position.openPrice)}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{numberFmt(position.stopLoss)}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>{numberFmt(position.takeProfit)}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{position.brokerComment}</TableCell>
                                <TableCell align="right">
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: isProfit ? '#16a34a' : '#dc2626', fontWeight: 700, fontSize: '0.75rem' }}>
                                    {isProfit ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                    ${numberFmt(position.liveProfit)}
                                  </Box>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, color: theme.palette.text.primary }}>
                    <TrendingUp size={18} color="#f97316" />
                    Pending Orders
                  </Typography>
                  {pendingOrders.length === 0 ? (
                    <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700, py: 0.5 }}>
                      No pending orders
                    </Typography>
                  ) : (
                    <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                      <Table size="small" aria-label="pending orders table">
                        <TableHead sx={{ background: theme.palette.mode === 'dark' ? '#2d3748' : '#f1f5f9' }}>
                          <TableRow>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Symbol</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Type</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Volume</TableCell>
                            <TableCell align="left" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Timing</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Open Price</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Stop Loss</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Take Profit</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Comment</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {pendingOrders.map((order) => (
                            <TableRow key={order.id} hover sx={{ '&:hover': { background: theme.palette.mode === 'dark' ? '#374151' : '#f8fafc' } }}>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{order.symbol}</TableCell>
                              <TableCell>
                                <Chip label={order.type} sx={{ background: '#fef3c7', color: '#c2410c', border: '1px solid #fed7aa', fontSize: '0.7rem', fontWeight: 700 }} />
                              </TableCell>
                              <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(order.currentVolume)}</TableCell>
                              <TableCell align="left" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{order.time}</TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(order.openPrice)}</TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{numberFmt(order.stopLoss)}</TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>{numberFmt(order.takeProfit)}</TableCell>
                              <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{stringFmt(order.brokerComment)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
              </CardContent>
            </Card>

            <Card
              sx={{
                flex: '0 0 25%',
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
                background: '#1e2a4d',
                borderRadius: 2,
                minHeight: 'auto',
              }}
            >
              <CardHeader
                sx={{
                  background: orderData.entryType === 'buy' ? '#287419ff' : '#ef4444',
                  color: '#d4d9e6',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>
                    Place Order
                  </Typography>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important', background: '#2d3748' }}>
                <Box component="form" noValidate autoComplete="off" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5, background: theme.palette.mode === 'dark' ? '#2d3748' : '#e2e8f0', p: 0.5, borderRadius: 2 }}>
                    <Button
                      onClick={() => setOrderData((prev) => ({ ...prev, entryType: 'buy' }))}
                      sx={{
                        width: '100%',
                        borderRadius: 1,
                        py: 0.5,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        transition: 'all 0.2s',
                        background: orderData.entryType === 'buy' ? '#287419ff' : 'transparent',
                        color: orderData.entryType === 'buy' ? '#d4d9e6' : theme.palette.text.secondary,
                        '&:hover': { background: orderData.entryType === 'buy' ? '#287419ff' : theme.palette.mode === 'dark' ? '#374151' : '#d1d5db' },
                      }}
                    >
                      BUY
                    </Button>
                    <Button
                      onClick={() => setOrderData((prev) => ({ ...prev, entryType: 'sell' }))}
                      sx={{
                        width: '100%',
                        borderRadius: 1,
                        py: 0.5,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        transition: 'all 0.2s',
                        background: orderData.entryType === 'sell' ? '#ef4444' : 'transparent',
                        color: orderData.entryType === 'sell' ? '#d4d9e6' : theme.palette.text.secondary,
                        '&:hover': { background: orderData.entryType === 'sell' ? '#dc2626' : theme.palette.mode === 'dark' ? '#374151' : '#d1d5db' },
                      }}
                    >
                      SELL
                    </Button>
                  </Box>
                  <TextField
                    fullWidth
                    label="Symbol (e.g., EURUSD)"
                    name="symbol"
                    variant="outlined"
                    value={orderData.symbol}
                    onChange={handleOrderChange}
                    sx={{
                      '& .MuiOutlinedInput-root': { borderRadius: 2, fontFamily: 'monospace', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1, fontSize: '0.75rem', background: '#2d3748', color: '#d4d9e6' },
                      '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#d4d9e6' },
                      '& .MuiInputBase-input': { fontSize: '0.75rem' },
                      '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
                      '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
                    }}
                  />
                  <FormControl fullWidth>
                    <InputLabel sx={{ fontSize: '0.75rem', color: '#d4d9e6' }}>Order Type</InputLabel>
                    <Select
                      name="orderType"
                      value={orderData.orderType}
                      onChange={handleOrderChange}
                      label="Order Type"
                      sx={{
                        borderRadius: 2,
                        '& .MuiSelect-select': { fontSize: '0.75rem', background: '#2d3748', color: '#d4d9e6' },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
                      }}
                    >
                      <MenuItem value="Market" sx={{ fontSize: '0.75rem', background: '#2d3748', color: '#d4d9e6' }}>Market</MenuItem>
                      <MenuItem value="Stop" sx={{ fontSize: '0.75rem', background: '#2d3748', color: '#d4d9e6' }}>Stop</MenuItem>
                      <MenuItem value="Limit" sx={{ fontSize: '0.75rem', background: '#2d3748', color: '#d4d9e6' }}>Limit</MenuItem>
                    </Select>
                  </FormControl>
                  {(orderData.orderType === 'Stop' || orderData.orderType === 'Limit') && (
                    <TextField
                      fullWidth
                      label="Entry Price"
                      name="entryPrice"
                      type="number"
                      variant="outlined"
                      value={orderData.entryPrice}
                      onChange={handleOrderChange}
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontFamily: 'monospace', fontSize: '0.75rem', background: '#2d3748', color: '#d4d9e6' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#d4d9e6' },
                        '& .MuiInputBase-input': { fontSize: '0.75rem' },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
                        '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
                      }}
                      inputProps={{ step: '0.00001', inputMode: 'decimal' }}
                    />
                  )}
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
                    {!accountDetails?.autoLotSizeSet && (
                      <TextField
                        fullWidth
                        label="Lot Size"
                        name="lotSize"
                        type="number"
                        variant="outlined"
                        value={orderData.lotSize}
                        onChange={handleOrderChange}
                        sx={{
                          '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontSize: '0.75rem', background: '#2d3748', color: '#d4d9e6' },
                          '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#d4d9e6' },
                          '& .MuiInputBase-input': { fontSize: '0.75rem' },
                          '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
                          '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
                        }}
                        inputProps={{ step: '0.01', inputMode: 'decimal' }}
                      />
                    )}
                    <TextField
                      fullWidth
                      label="Stop Loss"
                      name="stopLoss"
                      type="number"
                      variant="outlined"
                      value={orderData.stopLoss}
                      onChange={handleOrderChange}
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontFamily: 'monospace', background: '#2d3748', fontSize: '0.75rem' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#ef4444' },
                        '& .MuiInputBase-input': { fontSize: '0.75rem', color: '#d4d9e6' },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
                        '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
                      }}
                      inputProps={{ step: '0.00001', inputMode: 'decimal' }}
                    />
                    {accountDetails?.splittingTarget && Array.from({ length: accountDetails.splittingTarget }, (_, index) => (
                      <TextField
                        key={`takeProfit-${index}`}
                        fullWidth
                        label={`Target ${index + 1}`}
                        name={`takeProfit-${index}`}
                        type="text"
                        variant="outlined"
                        value={orderData.takeProfit[index] || ''}
                        onChange={handleOrderChange}
                        sx={{
                          '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontFamily: 'monospace', background: '#2d3748', fontSize: '0.75rem' },
                          '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#16a34a' },
                          '& .MuiInputBase-input': { fontSize: '0.75rem', color: '#d4d9e6' },
                          '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
                          '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
                        }}
                        inputProps={{ inputMode: 'decimal' }}
                      />
                    ))}
                    <TextField
                      fullWidth
                      label="Comment (optional)"
                      name="comment"
                      variant="outlined"
                      value={orderData.comment}
                      onChange={handleOrderChange}
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '0.75rem', background: '#2d3748', color: '#d4d9e6' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#d4d9e6' },
                        '& .MuiInputBase-input': { fontSize: '0.75rem' },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
                        '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
                      }}
                    />
                  </Box>
                  <Button
                    fullWidth
                    variant="contained"
                    onClick={handleVerifyOrder}
                    disabled={isSubmitting}
                    sx={{
                      py: 0.75,
                      borderRadius: 2,
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      textTransform: 'none',
                      background: orderData.entryType === 'buy' ? '#487b33ff' : '#ef4444',
                      color: '#d4d9e6',
                      boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
                      '&:hover': {
                        background: orderData.entryType === 'buy' ? '#42802dff' : '#dc2626',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.25)',
                      },
                      '&.Mui-disabled': { background: '#6b7aa8', cursor: 'not-allowed' },
                    }}
                  >
                    Place {orderData.entryType.toUpperCase()} Order
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Box>

        <Dialog 
          open={showConfirmation} 
          onClose={handleCancelConfirmation} 
          sx={{ 
            '& .MuiDialog-paper': { 
              width: '40%', 
              minHeight: '40%', 
              borderRadius: 3, 
              boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
              background: theme.palette.mode === 'dark' ? '#1e293b' : '#ffffff',
            } 
          }}
        >
          <DialogTitle 
            sx={{ 
              fontSize: '1.2rem', 
              fontWeight: 600, 
              textAlign: 'center', 
              py: 2, 
              color: theme.palette.text.primary,
              background: theme.palette.mode === 'dark' ? 'linear-gradient(to right, #1e293b, #2d3748)' : 'linear-gradient(to right, #f8fafc, #e0f2fe)',
              borderBottom: `1px solid ${theme.palette.divider}`,
            }}
          >
            Confirm Order
          </DialogTitle>
          <DialogContent sx={{ maxWidth: '1000px', p: 3, background: theme.palette.mode === 'dark' ? '#1e293b' : '#ffffff' }}>
            {verifiedData ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box 
                  sx={{ 
                    background: theme.palette.mode === 'dark' ? '#2d3748' : '#f8fafc', 
                    p: 2, 
                    borderRadius: 2, 
                    border: `1px solid ${theme.palette.mode === 'dark' ? '#374151' : '#e2e8f0'}` 
                  }}
                >
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, fontSize: '0.85rem' }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>Symbol:</Typography>
                        <Typography sx={{ fontFamily: 'monospace', fontWeight: 600, color: theme.palette.text.primary }}>{verifiedData.symbol}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>Side:</Typography>
                        <Chip
                          label={verifiedData.side}
                          sx={{
                            background: verifiedData.side === 'BUY' ? '#dc2626' : '#16a34a',
                            color: 'white',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            px: 1,
                            borderRadius: 1,
                          }}
                        />
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>Type:</Typography>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.primary }}>{verifiedData.orderType}</Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>Quantity:</Typography>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.primary }}>{numberFmt(verifiedData.quantity)}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>SL:-</Typography>
                        <Typography sx={{ fontFamily: 'monospace', fontWeight: 600, color: '#dc2626' }}>{numberFmt(verifiedData.stopLoss)}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>TP:</Typography>
                        <Typography sx={{ fontFamily: 'monospace', fontWeight: 600, color: '#16a34a' }}>
                          {Array.isArray(verifiedData.takeProfit) ? verifiedData.takeProfit.map(numberFmt).join(', ') : numberFmt(verifiedData.takeProfit)}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  <Box 
                    sx={{ 
                      background: '#fef2f2', 
                      border: '1px solid #fecaca', 
                      p: 2, 
                      borderRadius: 2, 
                      textAlign: 'center',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    }}
                  >
                    <Typography sx={{ color: '#dc2626', fontSize: '0.75rem', fontWeight: 600, mb: 0.5 }}>MAX LOSS</Typography>
                    <Typography sx={{ color: '#dc2626', fontSize: '1rem', fontWeight: 600 }}>${numberFmt(Math.abs(verifiedData.maxLoss))}</Typography>
                  </Box>
                  <Box 
                    sx={{ 
                      background: '#f0fdf4', 
                      border: '1px solid #bbf7d0', 
                      p: 2, 
                      borderRadius: 2, 
                      textAlign: 'center',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    }}
                  >
                    <Typography sx={{ color: '#16a34a', fontSize: '0.75rem', fontWeight: 600, mb: 0.5 }}>MAX PROFIT</Typography>
                    <Typography sx={{ color: '#16a34a', fontSize: '1rem', fontWeight: 600 }}>${numberFmt(verifiedData.maxProfit)}</Typography>
                  </Box>
                </Box>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, textAlign: 'center', color: theme.palette.text.primary, py: 2 }}>
                  Verifying order...
                </Typography>
              </Box>
            )}
          </DialogContent>
          <DialogActions sx={{ pt: 1, pb: 2, px: 3, display: 'flex', gap: 2, justifyContent: 'center' }}>
            <Button
              onClick={handleCancelConfirmation}
              variant="outlined"
              sx={{ 
                flex: 1, 
                borderRadius: 2, 
                fontSize: '0.85rem', 
                fontWeight: 600, 
                textTransform: 'none', 
                py: 0.75,
                borderColor: theme.palette.mode === 'dark' ? '#4b5563' : '#d1d5db',
                color: theme.palette.text.primary,
                '&:hover': { 
                  background: theme.palette.mode === 'dark' ? '#374151' : '#f3f4f6',
                  borderColor: theme.palette.mode === 'dark' ? '#6b7280' : '#9ca3af',
                },
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmOrder}
              variant="contained"
              sx={{
                flex: 1,
                borderRadius: 2,
                fontSize: '0.85rem',
                fontWeight: 600,
                textTransform: 'none',
                background: '#3b82f6',
                py: 0.75,
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                '&:hover': { 
                  background: '#1e40af',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                },
              }}
            >
              Confirm
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
      <ToastContainer 
        position="top-center"
        autoClose={7000}
        hideProgressBar={false}
        newestOnTop={true}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme={theme.palette.mode}
        limit={3}
        toastStyle={{
          backgroundColor: theme.palette.mode === 'dark' ? '#1e2a4d' : '#ffffff',
          color: theme.palette.mode === 'dark' ? '#d4d9e6' : '#000000',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
          fontSize: '1rem',
          padding: '12px',
          minHeight: '60px',
        }}
      />
    </>
  );
};

export default Dashboard;
/*
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  useTheme,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import { verifyToken, placeOrder, verifyOrder, initializeSocket, getUserAccounts, getAccountDetails } from '../api/api';
import Header from './Header';
import _ from 'lodash';
import { TrendingUp, TrendingDown, DollarSign, Settings, User, Building2 } from 'lucide-react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

interface Position {
  id: string;
  platform: string;
  type: 'BUY' | 'SELL' | 'LIMIT';
  symbol: string;
  brokerTime: string;
  openPrice: number;
  volume: number;
  brokerComment: string;
  stopLoss?: number;
  takeProfit?: number;
  liveProfit: number;
}

interface PendingOrder {
  id: string;
  type: string;
  symbol: string;
  time: string;
  currentVolume: number;
  brokerComment: string;
  stopLoss?: number;
  takeProfit?: number;
  openPrice?: number;
}

interface AccountInformation {
  platform: string;
  type: string;
  broker: string;
  currency: string;
  credit: number;
  server: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  leverage: number;
  marginLevel: number;
  marginMode: string;
  name: string;
  login: number;
}

interface Account {
  _id: string;
  brokerName: string;
  accountId: string;
  maxPositionLimit?: number;
}

interface AccountDetails extends Account {
  splittingTarget?: number;
  riskPercentage?: number;
  autoLotSizeSet?: boolean;
  dailyRiskPercentage?: number;
  remainingDailyRisk?: number;
  timezone?: string;
  location?: string;
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

const numberFmt = (n: number | undefined | null) =>
  typeof n === 'number' && !isNaN(n) ? n.toFixed(2) : 'undefined';

const stringFmt = (v: any) => (v != null ? String(v) : 'undefined');

const Dashboard: React.FC = () => {
  const theme = useTheme();
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedMetaApiAccountId, setSelectedMetaApiAccountId] = useState<string>('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountDetails, setAccountDetails] = useState<AccountDetails | null>(null);
  const [orderData, setOrderData] = useState({
    symbol: '',
    entryType: 'buy' as 'buy' | 'sell',
    lotSize: '',
    stopLoss: '',
    takeProfit: [] as string[],
    orderType: 'Market' as 'Market' | 'Stop' | 'Limit',
    comment: '',
    entryPrice: '',
  });
  const [positions, setPositions] = useState<Position[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [accountInformation, setAccountInformation] = useState<AccountInformation | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [verifiedData, setVerifiedData] = useState<VerifiedOrderData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const checkToken = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('No token found, redirecting to login');
        toast.error('No token found. Redirecting to login.');
        navigate('/login');
        return;
      }
      try {
        await verifyToken();
        const accountsData = await getUserAccounts();
        setAccounts(accountsData);
        console.log('Accounts:', accountsData);
        if (accountsData.length > 0 && !selectedAccountId) {
          setSelectedAccountId(accountsData[0]._id);
          setSelectedMetaApiAccountId(accountsData[0].accountId);
        }
      } catch (err: any) {
        console.error('Token verification failed:', err, 'Response:', err.response?.data);
        const errorMessage = err.response?.data?.error || 'Session expired. Please log in again.';
        toast.error(errorMessage);
        localStorage.removeItem('token');
        navigate('/login');
      }
    };
    checkToken();
  }, [navigate]);

  useEffect(() => {
    if (!selectedAccountId) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    const socket = initializeSocket(token, selectedAccountId);

    socket.on('connect', () => {
      console.log(`Socket.IO connected for account ${selectedAccountId}`);
    });

    socket.on('live-data', (data: { accountId: string; positionData: { livePositions: Position[], pendingOrders: PendingOrder[], accountInformation: AccountInformation } }) => {
      if (data.accountId !== selectedMetaApiAccountId) {
        console.log(`Ignoring live-data for account ${data.accountId}, expected ${selectedMetaApiAccountId}`);
        return;
      }
      if (data.positionData && Array.isArray(data.positionData.livePositions)) {
        setPositions(data.positionData.livePositions);
      }
      setPendingOrders(data.positionData.pendingOrders || []);
      setAccountInformation(data.positionData.accountInformation || null);
    });

    socket.on('order-response', (response: { message?: string; positionIds?: string[]; error?: string }) => {
      console.log(`[${new Date().toISOString()}] Order response in Dashboard:`, response);
      if (response.error) {
        const errorMessage = response.error || 'Failed to place order.';
        toast.error(errorMessage);
        console.error('Order failed:', errorMessage);
      } else {
        toast.success('Order placed successfully');
        setOrderData({ symbol: '', entryType: 'buy', lotSize: '', stopLoss: '', takeProfit: [], orderType: 'Market', comment: '', entryPrice: '' });
        console.log('Order placed successfully:', response);
      }
      setShowConfirmation(false);
      setTimeout(() => setIsSubmitting(false), 2000);
    });

    socket.on('verify-order-response', (response: { data?: VerifiedOrderData; error?: string }) => {
      console.log(`[${new Date().toISOString()}] Verify order response in Dashboard:`, response);
      if (response.error) {
        const errorMessage = response.error || 'Failed to verify order.';
        toast.error(errorMessage);
        console.error('Verify order failed:', errorMessage);
        setShowConfirmation(false);
        setTimeout(() => setIsSubmitting(false), 2000);
      } else if (response.data) {
        setVerifiedData(response.data);
        setShowConfirmation(true);
      }
    });

    socket.on('equity-balance', (data: { accountId: string; equity: number; balance: number }) => {
      console.log(`[${new Date().toISOString()}] Equity/Balance:`, data);
      if (data.accountId === selectedMetaApiAccountId) {
        setAccountInformation(prev => ({
          ...prev,
          equity: data.equity,
          balance: data.balance,
        } as AccountInformation));
      } else {
        console.log(`Ignoring equity-balance for account ${data.accountId}, expected ${selectedMetaApiAccountId}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket.IO disconnected for account ${selectedAccountId}`);
    });

    return () => {
      socket.off('live-data');
      socket.off('order-response');
      socket.off('verify-order-response');
      socket.off('equity-balance');
      socket.off('connect');
      socket.off('disconnect');
      socket.disconnect();
    };
  }, [selectedAccountId, selectedMetaApiAccountId]);

  useEffect(() => {
    if (accountDetails?.splittingTarget) {
      setOrderData((prev) => ({
        ...prev,
        takeProfit: Array(accountDetails.splittingTarget).fill(''),
      }));
    }
  }, [accountDetails?.splittingTarget]);

  const handleOrderChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent
  ) => {
    const { name, value } = e.target as HTMLInputElement;
    if (name.startsWith('takeProfit-')) {
      const index = parseInt(name.split('-')[1]);
      setOrderData((prev) => {
        const newTakeProfit = [...prev.takeProfit];
        newTakeProfit[index] = value;
        return { ...prev, takeProfit: newTakeProfit };
      });
    } else {
      setOrderData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleVerifyOrder = _.debounce(async () => {
    if (!isFormValid()) {
      toast.error('Please fill in all required fields (Symbol, Side, Order Type, Stop Loss, Take Profit).');
      return;
    }
    setIsSubmitting(true);
    try {
      const takeProfit = orderData.takeProfit
        .map((val) => val.trim())
        .filter((val) => val !== '')
        .map(Number)
        .filter((n) => !isNaN(n));
      if (takeProfit.length === 0) {
        toast.error('Take Profit is required.');
        setIsSubmitting(false);
        return;
      }
      if (!orderData.stopLoss || Number(orderData.stopLoss) <= 0) {
        toast.error('Stop Loss is required and must be greater than 0.');
        setIsSubmitting(false);
        return;
      }
      if (!accountDetails?.autoLotSizeSet && (!orderData.lotSize || Number(orderData.lotSize) <= 0)) {
        toast.error('Lot Size is required and must be greater than 0 when Auto Lot Size is disabled.');
        setIsSubmitting(false);
        return;
      }
      const data = {
        _id: selectedAccountId,
        symbol: orderData.symbol.trim().toUpperCase(),
        entryType: orderData.entryType,
        lotSize: accountDetails?.autoLotSizeSet ? undefined : Number(orderData.lotSize),
        stopLoss: Number(orderData.stopLoss),
        takeProfit: takeProfit.length > 0 ? (takeProfit.length === 1 ? takeProfit[0] : takeProfit) : undefined,
        orderType: orderData.orderType,
        comment: orderData.comment.trim() || undefined,
        entryPrice: orderData.orderType !== 'Market' && orderData.entryPrice ? Number(orderData.entryPrice) : undefined,
      };

      console.log('Verifying order:', data);
      await verifyOrder(data);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to verify order.';
      console.error(`[${new Date().toISOString()}] Verify order failed:`, err);
      toast.error(errorMessage);
      setIsSubmitting(false);
    }
  }, 3500);

  const handleConfirmOrder = _.debounce(async () => {
    if (!isFormValid()) {
      toast.error('Please fill in all required fields (Symbol, Side, Order Type, Stop Loss, Take Profit).');
      return;
    }
    setIsSubmitting(true);
    try {
      const takeProfit = orderData.takeProfit
        .map((val) => val.trim())
        .filter((val) => val !== '')
        .map(Number)
        .filter((n) => !isNaN(n));
      if (takeProfit.length === 0) {
        toast.error('Take Profit is required.');
        setIsSubmitting(false);
        return;
      }
      if (!orderData.stopLoss || Number(orderData.stopLoss) <= 0) {
        toast.error('Stop Loss is required and must be greater than 0.');
        setIsSubmitting(false);
        return;
      }
      if (!accountDetails?.autoLotSizeSet && (!orderData.lotSize || Number(orderData.lotSize) <= 0)) {
        toast.error('Lot Size is required and must be greater than 0 when Auto Lot Size is disabled.');
        setIsSubmitting(false);
        return;
      }
      const data = {
        _id: selectedAccountId,
        symbol: orderData.symbol.trim().toUpperCase(),
        entryType: orderData.entryType,
        lotSize: accountDetails?.autoLotSizeSet ? undefined : Number(orderData.lotSize),
        stopLoss: Number(orderData.stopLoss),
        takeProfit: takeProfit.length > 0 ? (takeProfit.length === 1 ? takeProfit[0] : takeProfit) : undefined,
        orderType: orderData.orderType,
        comment: orderData.comment.trim() || undefined,
        entryPrice: orderData.orderType !== 'Market' && orderData.entryPrice ? Number(orderData.entryPrice) : undefined,
      };

      console.log('Submitting order (validated):', data);
      const response = await placeOrder(data);
      if (response && typeof response === 'object' && !('error' in response && response.error)) {
        try {
          const updatedDetails = await getAccountDetails(selectedAccountId);
          setAccountDetails(updatedDetails);
          console.log('Updated account details:', updatedDetails);
        } catch (err: any) {
          const errorMessage = err.response?.data?.error || 'Failed to fetch updated account details.';
          console.error(`[${new Date().toISOString()}] Failed to fetch updated account details:`, err);
          toast.error(errorMessage);
        }
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to place order.';
      console.error(`[${new Date().toISOString()}] Place order failed:`, err);
      toast.error(errorMessage);
      setShowConfirmation(false);
      setIsSubmitting(false);
    }
  }, 2500);

  const handleCancelConfirmation = () => {
    setShowConfirmation(false);
    setVerifiedData(null);
    setIsSubmitting(false);
  };

  const handleAccountChange = async (accountId: string) => {
    setSelectedAccountId(accountId);
    const account = accounts.find((acc) => acc._id === accountId);
    setSelectedMetaApiAccountId(account ? account.accountId : '');
    console.log('Selected MongoDB _id:', accountId, 'MetaApi accountId:', account ? account.accountId : '');
    setPositions([]);
    setPendingOrders([]);
    setAccountInformation(null);
    setAccountDetails(null);
    try {
      const response = await getAccountDetails(accountId);
      setAccountDetails(response);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Failed to fetch account details.';
      console.error(`[${new Date().toISOString()}] Failed to fetch account details:`, err);
      toast.error(errorMessage);
    }
  };

  const isFormValid = () => {
    if (!selectedAccountId) return false;
    if (!orderData.symbol.trim()) return false;
    if (!accountDetails?.autoLotSizeSet && (!orderData.lotSize || Number(orderData.lotSize) <= 0)) return false;
    if (!orderData.stopLoss || Number(orderData.stopLoss) <= 0) return false;
    if (orderData.takeProfit.every((val) => val.trim() === '')) return false;
    if ((orderData.orderType === 'Stop' || orderData.orderType === 'Limit') && (!orderData.entryPrice || Number(orderData.entryPrice) <= 0)) return false;
    return true;
  };

  return (
    <>
      <Header selectedAccountId={selectedAccountId} onAccountChange={handleAccountChange} />
      <Box
        sx={{
          minHeight: '100vh',
          background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #121212, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, #f8fafc, #e0f2fe, #e0e7ff)',
          p: 1,
        }}
      >
        <Box sx={{ maxWidth: '1200px', mx: 'auto' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr 1fr' }, gap: 1 }}>
            <Card
              sx={{
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, white, #f1f5f9)',
                transition: 'box-shadow 0.3s',
                '&:hover': { boxShadow: '0 4px 15px rgba(0,0,0,0.15)' },
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #2563eb, #4f46e5)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Building2 size={18} />
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>Platform Details</Typography>
                  </Box>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                {accountInformation ? (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Platform:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{stringFmt(accountInformation.platform)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Type:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
                        {stringFmt(accountInformation.type).replace('ACCOUNT_TRADE_MODE_', '')}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Broker:</Typography>
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, maxWidth: '440px', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {stringFmt(accountInformation.broker)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Currency:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
                        {stringFmt(accountInformation.leverage)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Server:</Typography>
                      <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, maxWidth: '440px' }}>
                        {stringFmt(accountInformation.server)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Name:</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <User size={14} color={theme.palette.text.secondary} />
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{stringFmt(accountInformation.name)}</Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Login:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{stringFmt(accountInformation.login)}</Typography>
                    </Box>
                  </>
                ) : (
                  <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700 }}>
                    No platform details available
                  </Typography>
                )}
              </CardContent>
            </Card>

            <Card
              sx={{
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, white, #f1f5f9)',
                transition: 'box-shadow 0.3s',
                '&:hover': { boxShadow: '0 4px 15px rgba(0,0,0,0.15)' },
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #2563eb, #4f46e5)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Settings size={18} />
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>Risk Settings</Typography>
                  </Box>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                {accountDetails ? (
                  <>
                     <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Timezone:</Typography>
                 <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{(accountDetails.timezone)}</Typography>
                    </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
  <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Auto Lot Size:</Typography>
  <Typography sx={{ fontSize: '0.75rem', fontWeight: 200, color: accountDetails.autoLotSizeSet ? '#16a34a' : '#dc2626' }}>
    {accountDetails.autoLotSizeSet ? 'Enabled' : 'Disabled'}
  </Typography>
</Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Splitting Target:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{numberFmt(accountDetails.splittingTarget)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Max Position Limit:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{numberFmt(accountDetails.maxPositionLimit)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
  <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Total Max Position Limit:</Typography>
  <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
    {numberFmt(accountDetails.splittingTarget && accountDetails.maxPositionLimit 
      ? accountDetails.splittingTarget * accountDetails.maxPositionLimit 
      : undefined)}
  </Typography>
</Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Risk Percentage / Entry:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{numberFmt(accountDetails.riskPercentage)}%</Typography>
                    </Box>
                  
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Daily Risk %:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{numberFmt(accountDetails.dailyRiskPercentage)}%</Typography>
                    </Box>

                  </>
                ) : (
                  <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700 }}>
                    No risk settings available
                  </Typography>
                )}
              </CardContent>
            </Card>

            <Card
              sx={{
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, white, #f1f5f9)',
                transition: 'box-shadow 0.3s',
                '&:hover': { boxShadow: '0 4px 15px rgba(0,0,0,0.15)' },
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #2563eb, #4f46e5)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <DollarSign size={18} />
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>Financial Info</Typography>
                  </Box>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                {accountInformation ? (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Currency:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
                        {stringFmt(accountInformation.currency)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Balance:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>${numberFmt(accountInformation.balance)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Equity:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>${numberFmt(accountInformation.equity)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Credit:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>${numberFmt(accountInformation.credit)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Margin:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>${numberFmt(accountInformation.margin)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Free Margin:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#1cb7efff' }}>${numberFmt(accountInformation.freeMargin)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Today Risk Left:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#f97316' }}>${numberFmt(accountDetails?.remainingDailyRisk)}</Typography>
                    </Box>
                  </>
                ) : (
                  <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700 }}>
                    No financial info available
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'row', gap: 1, mt: 1, flexWrap: 'nowrap', maxWidth: '1200px' }}>
            <Card
              sx={{
                flex: '0 0 75%',
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? '#1e293b' : 'white',
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #1e293b, #334155)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>
                    Live Positions & Pending Orders
                  </Typography>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                <Box sx={{ mb: 1 }}>
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, color: theme.palette.text.primary }}>
                    <TrendingUp size={18} color="#16a34a" />
                    Live Positions
                  </Typography>
                  {positions.length === 0 ? (
                    <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700, py: 0.5 }}>
                      No open positions
                    </Typography>
                  ) : (
                    <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                      <Table size="small" aria-label="positions table">
                        <TableHead sx={{ background: theme.palette.mode === 'dark' ? '#2d3748' : '#f1f5f9' }}>
                          <TableRow>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Symbol</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Type</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Volume</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Timing</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Open Price</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Stop Loss</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Take Profit</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Comment</TableCell>
                            <TableCell align="left" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>P&L</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {positions.map((position) => {
                            const isProfit = position.liveProfit >= 0;
                            return (
                              <TableRow key={position.id} hover sx={{ '&:hover': { background: theme.palette.mode === 'dark' ? '#374151' : '#f8fafc' } }}>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{position.symbol}</TableCell>
                                <TableCell>
                                  <Chip
                                    label={position.type}
                                    sx={{
                                      background: position.type === 'BUY' ? '#16a34a' : '#dc2626',
                                      color: 'white',
                                      fontSize: '0.7rem',
                                      fontWeight: 700,
                                    }}
                                  />
                                </TableCell>
                                <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(position.volume)}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{position.brokerTime}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(position.openPrice)}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{numberFmt(position.stopLoss)}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>{numberFmt(position.takeProfit)}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{position.brokerComment}</TableCell>
                                <TableCell align="right">
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: isProfit ? '#16a34a' : '#dc2626', fontWeight: 700, fontSize: '0.75rem' }}>
                                    {isProfit ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                    ${numberFmt(position.liveProfit)}
                                  </Box>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, color: theme.palette.text.primary }}>
                    <TrendingUp size={18} color="#f97316" />
                    Pending Orders
                  </Typography>
                  {pendingOrders.length === 0 ? (
                    <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700, py: 0.5 }}>
                      No pending orders
                    </Typography>
                  ) : (
                    <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                      <Table size="small" aria-label="pending orders table">
                        <TableHead sx={{ background: theme.palette.mode === 'dark' ? '#2d3748' : '#f1f5f9' }}>
                          <TableRow>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Symbol</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Type</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Volume</TableCell>
                            <TableCell align="left" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Timing</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Open Price</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Stop Loss</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Take Profit</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Comment</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {pendingOrders.map((order) => (
                            <TableRow key={order.id} hover sx={{ '&:hover': { background: theme.palette.mode === 'dark' ? '#374151' : '#f8fafc' } }}>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{order.symbol}</TableCell>
                              <TableCell>
                                <Chip label={order.type} sx={{ background: '#fef3c7', color: '#c2410c', border: '1px solid #fed7aa', fontSize: '0.7rem', fontWeight: 700 }} />
                              </TableCell>
                              <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(order.currentVolume)}</TableCell>
                              <TableCell align="left" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{order.time}</TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(order.openPrice)}</TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{numberFmt(order.stopLoss)}</TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>{numberFmt(order.takeProfit)}</TableCell>
                              <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{stringFmt(order.brokerComment)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
              </CardContent>
            </Card>

           <Card
  sx={{
    flex: '0 0 25%',
    border: 'none',
    boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
    background: '#1e2a4d',
    borderRadius: 2,
    minHeight: 'auto', // Auto height for dynamic content
  }}
>
  <CardHeader
    sx={{
      background: orderData.entryType === 'buy' ? '#287419ff' : '#ef4444',
      color: '#d4d9e6',
      borderRadius: '6px 6px 0 0',
      py: 0.5,
    }}
    title={
      <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>
        Place Order
      </Typography>
    }
  />
  <CardContent sx={{ p: 1, pb: '8px !important', background: '#2d3748' }}>
    <Box component="form" noValidate autoComplete="off" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5, background: theme.palette.mode === 'dark' ? '#2d3748' : '#e2e8f0', p: 0.5, borderRadius: 2 }}>
        <Button
          onClick={() => setOrderData((prev) => ({ ...prev, entryType: 'buy' }))}
          sx={{
            width: '100%',
            borderRadius: 1,
            py: 0.5,
            fontSize: '0.75rem',
            fontWeight: 700,
            transition: 'all 0.2s',
            background: orderData.entryType === 'buy' ? '#287419ff' : 'transparent',
            color: orderData.entryType === 'buy' ? '#d4d9e6' : theme.palette.text.secondary,
            '&:hover': { background: orderData.entryType === 'buy' ? '#287419ff' : theme.palette.mode === 'dark' ? '#374151' : '#d1d5db' },
          }}
        >
          BUY
        </Button>
        <Button
          onClick={() => setOrderData((prev) => ({ ...prev, entryType: 'sell' }))}
          sx={{
            width: '100%',
            borderRadius: 1,
            py: 0.5,
            fontSize: '0.75rem',
            fontWeight: 700,
            transition: 'all 0.2s',
            background: orderData.entryType === 'sell' ? '#ef4444' : 'transparent',
            color: orderData.entryType === 'sell' ? '#d4d9e6' : theme.palette.text.secondary,
            '&:hover': { background: orderData.entryType === 'sell' ? '#dc2626' : theme.palette.mode === 'dark' ? '#374151' : '#d1d5db' },
          }}
        >
          SELL
        </Button>
      </Box>
      <TextField
        fullWidth
        label="Symbol (e.g., EURUSD)"
        name="symbol"
        variant="outlined"
        value={orderData.symbol}
        onChange={handleOrderChange}
        sx={{
          '& .MuiOutlinedInput-root': { borderRadius: 2, fontFamily: 'monospace', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1, fontSize: '0.75rem', background: '#2d3748', color: '#d4d9e6' },
          '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#d4d9e6' },
          '& .MuiInputBase-input': { fontSize: '0.75rem' },
          '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
          '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
        }}
      />
      <FormControl fullWidth>
        <InputLabel sx={{ fontSize: '0.75rem', color: '#d4d9e6' }}>Order Type</InputLabel>
        <Select
          name="orderType"
          value={orderData.orderType}
          onChange={handleOrderChange}
          label="Order Type"
          sx={{
            borderRadius: 2,
            '& .MuiSelect-select': { fontSize: '0.75rem', background: '#2d3748', color: '#d4d9e6' },
            '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
          }}
        >
          <MenuItem value="Market" sx={{ fontSize: '0.75rem', background: '#2d3748', color: '#d4d9e6' }}>Market</MenuItem>
          <MenuItem value="Stop" sx={{ fontSize: '0.75rem', background: '#2d3748', color: '#d4d9e6' }}>Stop</MenuItem>
          <MenuItem value="Limit" sx={{ fontSize: '0.75rem', background: '#2d3748', color: '#d4d9e6' }}>Limit</MenuItem>
        </Select>
      </FormControl>
      {(orderData.orderType === 'Stop' || orderData.orderType === 'Limit') && (
        <TextField
          fullWidth
          label="Entry Price"
          name="entryPrice"
          type="number"
          variant="outlined"
          value={orderData.entryPrice}
          onChange={handleOrderChange}
          sx={{
            '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontFamily: 'monospace', fontSize: '0.75rem', background: '#2d3748', color: '#d4d9e6' },
            '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#d4d9e6' },
            '& .MuiInputBase-input': { fontSize: '0.75rem' },
            '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
            '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
          }}
          inputProps={{ step: '0.00001', inputMode: 'decimal' }}
        />
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
        {!accountDetails?.autoLotSizeSet && (
          <TextField
            fullWidth
            label="Lot Size"
            name="lotSize"
            type="number"
            variant="outlined"
            value={orderData.lotSize}
            onChange={handleOrderChange}
            sx={{
              '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontSize: '0.75rem', background: '#2d3748', color: '#d4d9e6' },
              '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#d4d9e6' },
              '& .MuiInputBase-input': { fontSize: '0.75rem' },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
              '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
            }}
            inputProps={{ step: '0.01', inputMode: 'decimal' }}
          />
        )}
        <TextField
          fullWidth
          label="Stop Loss"
          name="stopLoss"
          type="number"
          variant="outlined"
          value={orderData.stopLoss}
          onChange={handleOrderChange}
          sx={{
            '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontFamily: 'monospace', background: '#2d3748', fontSize: '0.75rem' },
            '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#ef4444' },
            '& .MuiInputBase-input': { fontSize: '0.75rem', color: '#d4d9e6' },
            '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
            '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
          }}
          inputProps={{ step: '0.00001', inputMode: 'decimal' }}
        />
        {accountDetails?.splittingTarget && Array.from({ length: accountDetails.splittingTarget }, (_, index) => (
          <TextField
            key={`takeProfit-${index}`}
            fullWidth
            label={`Target ${index + 1}`}
            name={`takeProfit-${index}`}
            type="text"
            variant="outlined"
            value={orderData.takeProfit[index] || ''}
            onChange={handleOrderChange}
            sx={{
              '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontFamily: 'monospace', background: '#2d3748', fontSize: '0.75rem' },
              '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#16a34a' },
              '& .MuiInputBase-input': { fontSize: '0.75rem', color: '#d4d9e6' },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
              '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
            }}
            inputProps={{ inputMode: 'decimal' }}
          />
        ))}
        <TextField
          fullWidth
          label="Comment (optional)"
          name="comment"
          variant="outlined"
          value={orderData.comment}
          onChange={handleOrderChange}
          sx={{
            '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '0.75rem', background: '#2d3748', color: '#d4d9e6' },
            '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#d4d9e6' },
            '& .MuiInputBase-input': { fontSize: '0.75rem' },
            '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
            '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
          }}
        />
      </Box>
      <Button
        fullWidth
        variant="contained"
        onClick={handleVerifyOrder}
        disabled={isSubmitting}
        sx={{
          py: 0.75,
          borderRadius: 2,
          fontWeight: 700,
          fontSize: '0.8rem',
          textTransform: 'none',
          background: orderData.entryType === 'buy' ? '#487b33ff' : '#ef4444',
          color: '#d4d9e6',
          boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
          '&:hover': {
            background: orderData.entryType === 'buy' ? '#42802dff' : '#dc2626',
            boxShadow: '0 4px 15px rgba(0,0,0,0.25)',
          },
          '&.Mui-disabled': { background: '#6b7aa8', cursor: 'not-allowed' },
        }}
      >
        Place {orderData.entryType.toUpperCase()} Order
      </Button>
    </Box>
  </CardContent>
</Card>
          </Box>
        </Box>

        <Dialog 
          open={showConfirmation} 
          onClose={handleCancelConfirmation} 
          sx={{ 
            '& .MuiDialog-paper': { 
              width: '40%', 
              minHeight: '40%', 
              borderRadius: 3, 
              boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
              background: theme.palette.mode === 'dark' ? '#1e293b' : '#ffffff',
            } 
          }}
        >
          <DialogTitle 
            sx={{ 
              fontSize: '1.2rem', 
              fontWeight: 600, 
              textAlign: 'center', 
              py: 2, 
              color: theme.palette.text.primary,
              background: theme.palette.mode === 'dark' ? 'linear-gradient(to right, #1e293b, #2d3748)' : 'linear-gradient(to right, #f8fafc, #e0f2fe)',
              borderBottom: `1px solid ${theme.palette.divider}`,
            }}
          >
            Confirm Order
          </DialogTitle>
          <DialogContent sx={{ maxWidth: '1000px', p: 3, background: theme.palette.mode === 'dark' ? '#1e293b' : '#ffffff' }}>
            {verifiedData ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box 
                  sx={{ 
                    background: theme.palette.mode === 'dark' ? '#2d3748' : '#f8fafc', 
                    p: 2, 
                    borderRadius: 2, 
                    border: `1px solid ${theme.palette.mode === 'dark' ? '#374151' : '#e2e8f0'}` 
                  }}
                >
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, fontSize: '0.85rem' }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>Symbol:</Typography>
                        <Typography sx={{ fontFamily: 'monospace', fontWeight: 600, color: theme.palette.text.primary }}>{verifiedData.symbol}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>Side:</Typography>
                        <Chip
                          label={verifiedData.side}
                          sx={{
                            background: verifiedData.side === 'BUY' ? '#dc2626' : '#16a34a',
                            color: 'white',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            px: 1,
                            borderRadius: 1,
                          }}
                        />
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>Type:</Typography>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.primary }}>{verifiedData.orderType}</Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>Quantity:</Typography>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.primary }}>{numberFmt(verifiedData.quantity)}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>SL:-</Typography>
                        <Typography sx={{ fontFamily: 'monospace', fontWeight: 600, color: '#dc2626' }}>{numberFmt(verifiedData.stopLoss)}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>TP:</Typography>
                        <Typography sx={{ fontFamily: 'monospace', fontWeight: 600, color: '#16a34a' }}>
                          {Array.isArray(verifiedData.takeProfit) ? verifiedData.takeProfit.map(numberFmt).join(', ') : numberFmt(verifiedData.takeProfit)}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  <Box 
                    sx={{ 
                      background: '#fef2f2', 
                      border: '1px solid #fecaca', 
                      p: 2, 
                      borderRadius: 2, 
                      textAlign: 'center',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    }}
                  >
                    <Typography sx={{ color: '#dc2626', fontSize: '0.75rem', fontWeight: 600, mb: 0.5 }}>MAX LOSS</Typography>
                    <Typography sx={{ color: '#dc2626', fontSize: '1rem', fontWeight: 600 }}>${numberFmt(Math.abs(verifiedData.maxLoss))}</Typography>
                  </Box>
                  <Box 
                    sx={{ 
                      background: '#f0fdf4', 
                      border: '1px solid #bbf7d0', 
                      p: 2, 
                      borderRadius: 2, 
                      textAlign: 'center',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    }}
                  >
                    <Typography sx={{ color: '#16a34a', fontSize: '0.75rem', fontWeight: 600, mb: 0.5 }}>MAX PROFIT</Typography>
                    <Typography sx={{ color: '#16a34a', fontSize: '1rem', fontWeight: 600 }}>${numberFmt(verifiedData.maxProfit)}</Typography>
                  </Box>
                </Box>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, textAlign: 'center', color: theme.palette.text.primary, py: 2 }}>
                  Verifying order...
                </Typography>
              </Box>
            )}
          </DialogContent>
          <DialogActions sx={{ pt: 1, pb: 2, px: 3, display: 'flex', gap: 2, justifyContent: 'center' }}>
            <Button
              onClick={handleCancelConfirmation}
              variant="outlined"
              sx={{ 
                flex: 1, 
                borderRadius: 2, 
                fontSize: '0.85rem', 
                fontWeight: 600, 
                textTransform: 'none', 
                py: 0.75,
                borderColor: theme.palette.mode === 'dark' ? '#4b5563' : '#d1d5db',
                color: theme.palette.text.primary,
                '&:hover': { 
                  background: theme.palette.mode === 'dark' ? '#374151' : '#f3f4f6',
                  borderColor: theme.palette.mode === 'dark' ? '#6b7280' : '#9ca3af',
                },
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmOrder}
              variant="contained"
              sx={{
                flex: 1,
                borderRadius: 2,
                fontSize: '0.85rem',
                fontWeight: 600,
                textTransform: 'none',
                background: '#3b82f6',
                py: 0.75,
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                '&:hover': { 
                  background: '#1e40af',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                },
              }}
            >
              Confirm
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
      <ToastContainer 
        position="top-right" 
        autoClose={5000} 
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme={theme.palette.mode}
        toastStyle={{
          backgroundColor: theme.palette.mode === 'dark' ? '#1e2a4d' : '#ffffff',
          color: theme.palette.mode === 'dark' ? '#d4d9e6' : '#000000',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
          fontSize: '0.85rem',
        }}
      />
    </>
  );
};

export default Dashboard;



/*
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  useTheme,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import { verifyToken, placeOrder, verifyOrder, initializeSocket, getUserAccounts, getAccountDetails } from '../api/api';
import Header from './Header';
import _ from 'lodash';
import { TrendingUp, TrendingDown, DollarSign, Settings, User, Building2 } from 'lucide-react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

interface Position {
  id: string;
  platform: string;
  type: 'BUY' | 'SELL' | 'LIMIT';
  symbol: string;
  brokerTime: string;
  openPrice: number;
  volume: number;
  brokerComment: string;
  stopLoss?: number;
  takeProfit?: number;
  liveProfit: number;
}

interface PendingOrder {
  id: string;
  type: string;
  symbol: string;
  time: string;
  currentVolume: number;
  brokerComment: string;
  stopLoss?: number;
  takeProfit?: number;
  openPrice?: number;
}

interface AccountInformation {
  platform: string;
  type: string;
  broker: string;
  currency: string;
  credit: number;
  server: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  leverage: number;
  marginLevel: number;
  marginMode: string;
  name: string;
  login: number;
}

interface Account {
  _id: string;
  brokerName: string;
  accountId: string;
  maxPositionLimit?: number;
}

interface AccountDetails extends Account {
  splittingTarget?: number;
  riskPercentage?: number;
  autoLotSizeSet?: boolean;
  dailyRiskPercentage?: number;
  remainingDailyRisk?: number;
  timezone?: string;
  location?: string;
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

const numberFmt = (n: number | undefined | null) =>
  typeof n === 'number' && !isNaN(n) ? n.toFixed(2) : 'undefined';

const stringFmt = (v: any) => (v != null ? String(v) : 'undefined');

const Dashboard: React.FC = () => {
  const theme = useTheme();
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedMetaApiAccountId, setSelectedMetaApiAccountId] = useState<string>('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountDetails, setAccountDetails] = useState<AccountDetails | null>(null);
  const [orderData, setOrderData] = useState({
    symbol: '',
    entryType: 'buy' as 'buy' | 'sell',
    lotSize: '',
    stopLoss: '',
    takeProfit: [] as string[],
    orderType: 'Market' as 'Market' | 'Stop' | 'Limit',
    comment: '',
    entryPrice: '',
  });
  const [positions, setPositions] = useState<Position[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [accountInformation, setAccountInformation] = useState<AccountInformation | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [verifiedData, setVerifiedData] = useState<VerifiedOrderData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const checkToken = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('No token found, redirecting to login');
        navigate('/login');
        return;
      }
      try {
        await verifyToken();
        const accountsData = await getUserAccounts();
        setAccounts(accountsData);
        console.log('Accounts:', accountsData);
        if (accountsData.length > 0 && !selectedAccountId) {
          setSelectedAccountId(accountsData[0]._id);
          setSelectedMetaApiAccountId(accountsData[0].accountId);
        }
      } catch (err: any) {
        console.error('Token verification failed:', err, 'Response:', err.response?.data);
        localStorage.removeItem('token');
        toast.error('Session expired. Please log in again.');
        navigate('/login');
      }
    };
    checkToken();
  }, [navigate]);

  useEffect(() => {
    if (!selectedAccountId) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    const socket = initializeSocket(token, selectedAccountId);

    socket.on('connect', () => {
      console.log(`Socket.IO connected for account ${selectedAccountId}`);
    });

    socket.on('live-data', (data: { accountId: string; positionData: { livePositions: Position[], pendingOrders: PendingOrder[], accountInformation: AccountInformation } }) => {
      if (data.accountId !== selectedMetaApiAccountId) {
        console.log(`Ignoring live-data for account ${data.accountId}, expected ${selectedMetaApiAccountId}`);
        return;
      }
      if (data.positionData && Array.isArray(data.positionData.livePositions)) {
        setPositions(data.positionData.livePositions);
      }
      setPendingOrders(data.positionData.pendingOrders || []);
      setAccountInformation(data.positionData.accountInformation || null);
    });

    socket.on('order-response', (response: { message?: string; positionIds?: string[]; error?: string }) => {
      console.log(`[${new Date().toISOString()}] Order response in Dashboard:`, response);
      if (response.error) {
        toast.error(response.error);
        console.error('Order failed:', response.error);
        setErrorMessage(response.error);
      } else {
        toast.success('Order placed successfully');
        setOrderData({ symbol: '', entryType: 'buy', lotSize: '', stopLoss: '', takeProfit: [], orderType: 'Market', comment: '', entryPrice: '' });
        console.log('Order placed successfully:', response);
      }
      setShowConfirmation(false);
      setTimeout(() => setIsSubmitting(false), 2000);
    });

    socket.on('verify-order-response', (response: { data?: VerifiedOrderData; error?: string }) => {
      console.log(`[${new Date().toISOString()}] Verify order response in Dashboard:`, response);
      if (response.error) {
        toast.error(response.error);
        console.error('Verify order failed:', response.error);
        setErrorMessage(response.error);
        setShowConfirmation(false);
        setTimeout(() => setIsSubmitting(false), 2000);
      } else if (response.data) {
        setVerifiedData(response.data);
        setErrorMessage(null);
        setShowConfirmation(true);
      }
    });

    socket.on('equity-balance', (data: { accountId: string; equity: number; balance: number }) => {
      console.log(`[${new Date().toISOString()}] Equity/Balance:`, data);
      if (data.accountId === selectedMetaApiAccountId) {
        setAccountInformation(prev => ({
          ...prev,
          equity: data.equity,
          balance: data.balance,
        } as AccountInformation));
      } else {
        console.log(`Ignoring equity-balance for account ${data.accountId}, expected ${selectedMetaApiAccountId}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket.IO disconnected for account ${selectedAccountId}`);
    });

    return () => {
      socket.off('live-data');
      socket.off('order-response');
      socket.off('verify-order-response');
      socket.off('equity-balance');
      socket.off('connect');
      socket.off('disconnect');
      socket.disconnect();
    };
  }, [selectedAccountId, selectedMetaApiAccountId]);

  useEffect(() => {
    if (accountDetails?.splittingTarget) {
      setOrderData((prev) => ({
        ...prev,
        takeProfit: Array(accountDetails.splittingTarget).fill(''),
      }));
    }
  }, [accountDetails?.splittingTarget]);

  const handleOrderChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent
  ) => {
    const { name, value } = e.target as HTMLInputElement;
    if (name.startsWith('takeProfit-')) {
      const index = parseInt(name.split('-')[1]);
      setOrderData((prev) => {
        const newTakeProfit = [...prev.takeProfit];
        newTakeProfit[index] = value;
        return { ...prev, takeProfit: newTakeProfit };
      });
    } else {
      setOrderData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleVerifyOrder = _.debounce(async () => {
    if (!isFormValid()) {
      toast.error('Please fill in all required fields (Symbol, Side, Order Type, Stop Loss, Take Profit).');
      return;
    }
    setIsSubmitting(true);
    try {
      const takeProfit = orderData.takeProfit
        .map((val) => val.trim())
        .filter((val) => val !== '')
        .map(Number)
        .filter((n) => !isNaN(n));
      if (takeProfit.length === 0) {
        toast.error('Take Profit is required.');
        setIsSubmitting(false);
        return;
      }
      if (!orderData.stopLoss || Number(orderData.stopLoss) <= 0) {
        toast.error('Stop Loss is required and must be greater than 0.');
        setIsSubmitting(false);
        return;
      }
      if (!accountDetails?.autoLotSizeSet && (!orderData.lotSize || Number(orderData.lotSize) <= 0)) {
        toast.error('Lot Size is required and must be greater than 0 when Auto Lot Size is disabled.');
        setIsSubmitting(false);
        return;
      }
      const data = {
        _id: selectedAccountId,
        symbol: orderData.symbol.trim().toUpperCase(),
        entryType: orderData.entryType,
        lotSize: accountDetails?.autoLotSizeSet ? undefined : Number(orderData.lotSize),
        stopLoss: Number(orderData.stopLoss),
        takeProfit: takeProfit.length > 0 ? (takeProfit.length === 1 ? takeProfit[0] : takeProfit) : undefined,
        orderType: orderData.orderType,
        comment: orderData.comment.trim() || undefined,
        entryPrice: orderData.orderType !== 'Market' && orderData.entryPrice ? Number(orderData.entryPrice) : undefined,
      };

      console.log('Verifying order:', data);
      await verifyOrder(data);
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to verify order.';
      console.error(`[${new Date().toISOString()}] Verify order failed:`, err);
      toast.error(errorMessage);
      setErrorMessage(errorMessage);
      setTimeout(() => setIsSubmitting(false), 2000);
    }
  }, 3500);

  const handleConfirmOrder = _.debounce(async () => {
    if (!isFormValid()) {
      toast.error('Please fill in all required fields (Symbol, Side, Order Type, Stop Loss, Take Profit).');
      return;
    }
    setIsSubmitting(true);
    try {
      const takeProfit = orderData.takeProfit
        .map((val) => val.trim())
        .filter((val) => val !== '')
        .map(Number)
        .filter((n) => !isNaN(n));
      if (takeProfit.length === 0) {
        toast.error('Take Profit is required.');
        setIsSubmitting(false);
        return;
      }
      if (!orderData.stopLoss || Number(orderData.stopLoss) <= 0) {
        toast.error('Stop Loss is required and must be greater than 0.');
        setIsSubmitting(false);
        return;
      }
      if (!accountDetails?.autoLotSizeSet && (!orderData.lotSize || Number(orderData.lotSize) <= 0)) {
        toast.error('Lot Size is required and must be greater than 0 when Auto Lot Size is disabled.');
        setIsSubmitting(false);
        return;
      }
      const data = {
        _id: selectedAccountId,
        symbol: orderData.symbol.trim().toUpperCase(),
        entryType: orderData.entryType,
        lotSize: accountDetails?.autoLotSizeSet ? undefined : Number(orderData.lotSize),
        stopLoss: Number(orderData.stopLoss),
        takeProfit: takeProfit.length > 0 ? (takeProfit.length === 1 ? takeProfit[0] : takeProfit) : undefined,
        orderType: orderData.orderType,
        comment: orderData.comment.trim() || undefined,
        entryPrice: orderData.orderType !== 'Market' && orderData.entryPrice ? Number(orderData.entryPrice) : undefined,
      };

      console.log('Submitting order (validated):', data);
      const response = await placeOrder(data);
      if (response && typeof response === 'object' && !('error' in response && response.error)) {
        try {
          const updatedDetails = await getAccountDetails(selectedAccountId);
          setAccountDetails(updatedDetails);
          console.log('Updated account details:', updatedDetails);
        } catch (err: any) {
          console.error(`[${new Date().toISOString()}] Failed to fetch updated account details:`, err);
          toast.error('Failed to fetch updated account details.');
          setErrorMessage('Failed to fetch updated account details.');
        }
      }
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to place order.';
      console.error(`[${new Date().toISOString()}] Place order failed:`, err);
      toast.error(errorMessage);
      setErrorMessage(errorMessage);
      setShowConfirmation(false);
      setTimeout(() => setIsSubmitting(false), 2000);
    }
  }, 2500);

  const handleCancelConfirmation = () => {
    setShowConfirmation(false);
    setVerifiedData(null);
    setErrorMessage(null);
    setIsSubmitting(false);
  };

  const handleAccountChange = async (accountId: string) => {
    setSelectedAccountId(accountId);
    const account = accounts.find((acc) => acc._id === accountId);
    setSelectedMetaApiAccountId(account ? account.accountId : '');
    console.log('Selected MongoDB _id:', accountId, 'MetaApi accountId:', account ? account.accountId : '');
    setPositions([]);
    setPendingOrders([]);
    setAccountInformation(null);
    setAccountDetails(null);
    try {
      const response = await getAccountDetails(accountId);
      setAccountDetails(response);
    } catch (err: any) {
      console.error(`[${new Date().toISOString()}] Failed to fetch account details:`, err);
      toast.error('Failed to fetch account details.');
      setErrorMessage('Failed to fetch account details.');
    }
  };

  const isFormValid = () => {
    if (!selectedAccountId) return false;
    if (!orderData.symbol.trim()) return false;
    if (!accountDetails?.autoLotSizeSet && (!orderData.lotSize || Number(orderData.lotSize) <= 0)) return false;
    if (!orderData.stopLoss || Number(orderData.stopLoss) <= 0) return false;
    if (orderData.takeProfit.every((val) => val.trim() === '')) return false;
    if ((orderData.orderType === 'Stop' || orderData.orderType === 'Limit') && (!orderData.entryPrice || Number(orderData.entryPrice) <= 0)) return false;
    return true;
  };

  return (
    <>
      <Header selectedAccountId={selectedAccountId} onAccountChange={handleAccountChange} />
      <Box
        sx={{
          minHeight: '100vh',
          background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #121212, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, #f8fafc, #e0f2fe, #e0e7ff)',
          p: 1,
        }}
      >
        <Box sx={{ maxWidth: '1200px', mx: 'auto' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr 1fr' }, gap: 1 }}>
            <Card
              sx={{
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, white, #f1f5f9)',
                transition: 'box-shadow 0.3s',
                '&:hover': { boxShadow: '0 4px 15px rgba(0,0,0,0.15)' },
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #2563eb, #4f46e5)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Building2 size={18} />
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>Platform Details</Typography>
                  </Box>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                {accountInformation ? (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Platform:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{stringFmt(accountInformation.platform)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Type:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
                        {stringFmt(accountInformation.type).replace('ACCOUNT_TRADE_MODE_', '')}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Broker:</Typography>
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, maxWidth: '440px', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {stringFmt(accountInformation.broker)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Currency:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
                        {stringFmt(accountInformation.leverage)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Server:</Typography>
                      <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, maxWidth: '440px' }}>
                        {stringFmt(accountInformation.server)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Name:</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <User size={14} color={theme.palette.text.secondary} />
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{stringFmt(accountInformation.name)}</Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Login:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{stringFmt(accountInformation.login)}</Typography>
                    </Box>
                  </>
                ) : (
                  <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700 }}>
                    No platform details available
                  </Typography>
                )}
              </CardContent>
            </Card>

            <Card
              sx={{
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, white, #f1f5f9)',
                transition: 'box-shadow 0.3s',
                '&:hover': { boxShadow: '0 4px 15px rgba(0,0,0,0.15)' },
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #2563eb, #4f46e5)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Settings size={18} />
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>Risk Settings</Typography>
                  </Box>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                {accountDetails ? (
                  <>
                     <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Timezone:</Typography>
                 <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{(accountDetails.timezone)}</Typography>
                    </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
  <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Auto Lot Size:</Typography>
  <Typography sx={{ fontSize: '0.75rem', fontWeight: 200, color: accountDetails.autoLotSizeSet ? '#16a34a' : '#dc2626' }}>
    {accountDetails.autoLotSizeSet ? 'Enabled' : 'Disabled'}
  </Typography>
</Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Splitting Target:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{numberFmt(accountDetails.splittingTarget)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Max Position Limit:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{numberFmt(accountDetails.maxPositionLimit)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
  <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Total Max Position Limit:</Typography>
  <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
    {numberFmt(accountDetails.splittingTarget && accountDetails.maxPositionLimit 
      ? accountDetails.splittingTarget * accountDetails.maxPositionLimit 
      : undefined)}
  </Typography>
</Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Risk Percentage / Entry:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{numberFmt(accountDetails.riskPercentage)}%</Typography>
                    </Box>
                  
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Daily Risk %:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{numberFmt(accountDetails.dailyRiskPercentage)}%</Typography>
                    </Box>

                  </>
                ) : (
                  <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700 }}>
                    No risk settings available
                  </Typography>
                )}
              </CardContent>
            </Card>

            <Card
              sx={{
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, white, #f1f5f9)',
                transition: 'box-shadow 0.3s',
                '&:hover': { boxShadow: '0 4px 15px rgba(0,0,0,0.15)' },
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #2563eb, #4f46e5)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <DollarSign size={18} />
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>Financial Info</Typography>
                  </Box>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                {accountInformation ? (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Currency:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
                        {stringFmt(accountInformation.currency)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Balance:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>${numberFmt(accountInformation.balance)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Equity:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>${numberFmt(accountInformation.equity)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Credit:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>${numberFmt(accountInformation.credit)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Margin:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>${numberFmt(accountInformation.margin)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Free Margin:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#1cb7efff' }}>${numberFmt(accountInformation.freeMargin)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Today Risk Left:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#f97316' }}>${numberFmt(accountDetails?.remainingDailyRisk)}</Typography>
                    </Box>
                  </>
                ) : (
                  <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700 }}>
                    No financial info available
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'row', gap: 1, mt: 1, flexWrap: 'nowrap', maxWidth: '1200px' }}>
            <Card
              sx={{
                flex: '0 0 75%',
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? '#1e293b' : 'white',
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #1e293b, #334155)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>
                    Live Positions & Pending Orders
                  </Typography>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                <Box sx={{ mb: 1 }}>
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, color: theme.palette.text.primary }}>
                    <TrendingUp size={18} color="#16a34a" />
                    Live Positions
                  </Typography>
                  {positions.length === 0 ? (
                    <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700, py: 0.5 }}>
                      No open positions
                    </Typography>
                  ) : (
                    <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                      <Table size="small" aria-label="positions table">
                        <TableHead sx={{ background: theme.palette.mode === 'dark' ? '#2d3748' : '#f1f5f9' }}>
                          <TableRow>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Symbol</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Type</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Volume</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Timing</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Open Price</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Stop Loss</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Take Profit</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Comment</TableCell>
                            <TableCell align="left" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>P&L</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {positions.map((position) => {
                            const isProfit = position.liveProfit >= 0;
                            return (
                              <TableRow key={position.id} hover sx={{ '&:hover': { background: theme.palette.mode === 'dark' ? '#374151' : '#f8fafc' } }}>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{position.symbol}</TableCell>
                                <TableCell>
                                  <Chip
                                    label={position.type}
                                    sx={{
                                      background: position.type === 'BUY' ? '#16a34a' : '#dc2626',
                                      color: 'white',
                                      fontSize: '0.7rem',
                                      fontWeight: 700,
                                    }}
                                  />
                                </TableCell>
                                <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(position.volume)}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{position.brokerTime}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(position.openPrice)}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{numberFmt(position.stopLoss)}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>{numberFmt(position.takeProfit)}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{position.brokerComment}</TableCell>
                                <TableCell align="right">
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: isProfit ? '#16a34a' : '#dc2626', fontWeight: 700, fontSize: '0.75rem' }}>
                                    {isProfit ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                    ${numberFmt(position.liveProfit)}
                                  </Box>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, color: theme.palette.text.primary }}>
                    <TrendingUp size={18} color="#f97316" />
                    Pending Orders
                  </Typography>
                  {pendingOrders.length === 0 ? (
                    <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700, py: 0.5 }}>
                      No pending orders
                    </Typography>
                  ) : (
                    <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                      <Table size="small" aria-label="pending orders table">
                        <TableHead sx={{ background: theme.palette.mode === 'dark' ? '#2d3748' : '#f1f5f9' }}>
                          <TableRow>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Symbol</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Type</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Volume</TableCell>
                            <TableCell align="left" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Timing</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Open Price</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Stop Loss</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Take Profit</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Comment</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {pendingOrders.map((order) => (
                            <TableRow key={order.id} hover sx={{ '&:hover': { background: theme.palette.mode === 'dark' ? '#374151' : '#f8fafc' } }}>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{order.symbol}</TableCell>
                              <TableCell>
                                <Chip label={order.type} sx={{ background: '#fef3c7', color: '#c2410c', border: '1px solid #fed7aa', fontSize: '0.7rem', fontWeight: 700 }} />
                              </TableCell>
                              <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(order.currentVolume)}</TableCell>
                              <TableCell align="left" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{order.time}</TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(order.openPrice)}</TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{numberFmt(order.stopLoss)}</TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>{numberFmt(order.takeProfit)}</TableCell>
                              <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{stringFmt(order.brokerComment)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
              </CardContent>
            </Card>

          <Card
  sx={{
    flex: '0 0 25%',
    border: 'none',
    boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
    background: '#1e2a4d',
    borderRadius: 2,
    minHeight: 'auto', // Auto height for dynamic content
  }}
>
  <CardHeader
    sx={{
      background: orderData.entryType === 'buy' ? '#287419ff' : '#ef4444',
      color: '#d4d9e6',
      borderRadius: '6px 6px 0 0',
      py: 0.5,
    }}
    title={
      <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>
        Place Order
      </Typography>
    }
  />
  <CardContent sx={{ p: 1, pb: '8px !important', background: '#2d3748' }}>
    <Box component="form" noValidate autoComplete="off" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5, background: theme.palette.mode === 'dark' ? '#2d3748' : '#e2e8f0', p: 0.5, borderRadius: 2 }}>
        <Button
          onClick={() => setOrderData((prev) => ({ ...prev, entryType: 'buy' }))}
          sx={{
            width: '100%',
            borderRadius: 1,
            py: 0.5,
            fontSize: '0.75rem',
            fontWeight: 700,
            transition: 'all 0.2s',
            background: orderData.entryType === 'buy' ? '#287419ff' : 'transparent',
            color: orderData.entryType === 'buy' ? '#d4d9e6' : theme.palette.text.secondary,
            '&:hover': { background: orderData.entryType === 'buy' ? '#287419ff' : theme.palette.mode === 'dark' ? '#374151' : '#d1d5db' },
          }}
        >
          BUY
        </Button>
        <Button
          onClick={() => setOrderData((prev) => ({ ...prev, entryType: 'sell' }))}
          sx={{
            width: '100%',
            borderRadius: 1,
            py: 0.5,
            fontSize: '0.75rem',
            fontWeight: 700,
            transition: 'all 0.2s',
            background: orderData.entryType === 'sell' ? '#ef4444' : 'transparent',
            color: orderData.entryType === 'sell' ? '#d4d9e6' : theme.palette.text.secondary,
            '&:hover': { background: orderData.entryType === 'sell' ? '#dc2626' : theme.palette.mode === 'dark' ? '#374151' : '#d1d5db' },
          }}
        >
          SELL
        </Button>
      </Box>
      <TextField
        fullWidth
        label="Symbol (e.g., EURUSD)"
        name="symbol"
        variant="outlined"
        value={orderData.symbol}
        onChange={handleOrderChange}
        sx={{
          '& .MuiOutlinedInput-root': { borderRadius: 2, fontFamily: 'monospace', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1, fontSize: '0.75rem', background: '#2d3748', color: '#d4d9e6' },
          '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#d4d9e6' },
          '& .MuiInputBase-input': { fontSize: '0.75rem' },
          '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
          '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
        }}
      />
      <FormControl fullWidth>
        <InputLabel sx={{ fontSize: '0.75rem', color: '#d4d9e6' }}>Order Type</InputLabel>
        <Select
          name="orderType"
          value={orderData.orderType}
          onChange={handleOrderChange}
          label="Order Type"
          sx={{
            borderRadius: 2,
            '& .MuiSelect-select': { fontSize: '0.75rem', background: '#2d3748', color: '#d4d9e6' },
            '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
          }}
        >
          <MenuItem value="Market" sx={{ fontSize: '0.75rem', background: '#2d3748', color: '#d4d9e6' }}>Market</MenuItem>
          <MenuItem value="Stop" sx={{ fontSize: '0.75rem', background: '#2d3748', color: '#d4d9e6' }}>Stop</MenuItem>
          <MenuItem value="Limit" sx={{ fontSize: '0.75rem', background: '#2d3748', color: '#d4d9e6' }}>Limit</MenuItem>
        </Select>
      </FormControl>
      {(orderData.orderType === 'Stop' || orderData.orderType === 'Limit') && (
        <TextField
          fullWidth
          label="Entry Price"
          name="entryPrice"
          type="number"
          variant="outlined"
          value={orderData.entryPrice}
          onChange={handleOrderChange}
          sx={{
            '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontFamily: 'monospace', fontSize: '0.75rem', background: '#2d3748', color: '#d4d9e6' },
            '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#d4d9e6' },
            '& .MuiInputBase-input': { fontSize: '0.75rem' },
            '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
            '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
          }}
          inputProps={{ step: '0.00001', inputMode: 'decimal' }}
        />
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
        {!accountDetails?.autoLotSizeSet && (
          <TextField
            fullWidth
            label="Lot Size"
            name="lotSize"
            type="number"
            variant="outlined"
            value={orderData.lotSize}
            onChange={handleOrderChange}
            sx={{
              '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontSize: '0.75rem', background: '#2d3748', color: '#d4d9e6' },
              '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#d4d9e6' },
              '& .MuiInputBase-input': { fontSize: '0.75rem' },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
              '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
            }}
            inputProps={{ step: '0.01', inputMode: 'decimal' }}
          />
        )}
        <TextField
          fullWidth
          label="Stop Loss"
          name="stopLoss"
          type="number"
          variant="outlined"
          value={orderData.stopLoss}
          onChange={handleOrderChange}
          sx={{
            '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontFamily: 'monospace', background: '#2d3748', fontSize: '0.75rem' },
            '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#ef4444' },
            '& .MuiInputBase-input': { fontSize: '0.75rem', color: '#d4d9e6' },
            '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
            '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
          }}
          inputProps={{ step: '0.00001', inputMode: 'decimal' }}
        />
        {accountDetails?.splittingTarget && Array.from({ length: accountDetails.splittingTarget }, (_, index) => (
          <TextField
            key={`takeProfit-${index}`}
            fullWidth
            label={`Target ${index + 1}`}
            name={`takeProfit-${index}`}
            type="text"
            variant="outlined"
            value={orderData.takeProfit[index] || ''}
            onChange={handleOrderChange}
            sx={{
              '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontFamily: 'monospace', background: '#2d3748', fontSize: '0.75rem' },
              '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#16a34a' },
              '& .MuiInputBase-input': { fontSize: '0.75rem', color: '#d4d9e6' },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
              '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
            }}
            inputProps={{ inputMode: 'decimal' }}
          />
        ))}
        <TextField
          fullWidth
          label="Comment (optional)"
          name="comment"
          variant="outlined"
          value={orderData.comment}
          onChange={handleOrderChange}
          sx={{
            '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '0.75rem', background: '#2d3748', color: '#d4d9e6' },
            '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#d4d9e6' },
            '& .MuiInputBase-input': { fontSize: '0.75rem' },
            '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
            '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
          }}
        />
      </Box>
      <Button
        fullWidth
        variant="contained"
        onClick={handleVerifyOrder}
        disabled={isSubmitting}
        sx={{
          py: 0.75,
          borderRadius: 2,
          fontWeight: 700,
          fontSize: '0.8rem',
          textTransform: 'none',
          background: orderData.entryType === 'buy' ? '#487b33ff' : '#ef4444',
          color: '#d4d9e6',
          boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
          '&:hover': {
            background: orderData.entryType === 'buy' ? '#42802dff' : '#dc2626',
            boxShadow: '0 4px 15px rgba(0,0,0,0.25)',
          },
          '&.Mui-disabled': { background: '#6b7aa8', cursor: 'not-allowed' },
        }}
      >
        Place {orderData.entryType.toUpperCase()} Order
      </Button>
    </Box>
  </CardContent>
</Card>
          </Box>
        </Box>

        <Dialog 
          open={showConfirmation} 
          onClose={handleCancelConfirmation} 
          sx={{ 
            '& .MuiDialog-paper': { 
              width: '40%', 
              minHeight: '40%', 
              borderRadius: 3, 
              boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
              background: theme.palette.mode === 'dark' ? '#1e293b' : '#ffffff',
            } 
          }}
        >
          <DialogTitle 
            sx={{ 
              fontSize: '1.2rem', 
              fontWeight: 600, 
              textAlign: 'center', 
              py: 2, 
              color: theme.palette.text.primary,
              background: theme.palette.mode === 'dark' ? 'linear-gradient(to right, #1e293b, #2d3748)' : 'linear-gradient(to right, #f8fafc, #e0f2fe)',
              borderBottom: `1px solid ${theme.palette.divider}`,
            }}
          >
            Confirm Order
          </DialogTitle>
          <DialogContent sx={{ maxWidth: '1000px', p: 3, background: theme.palette.mode === 'dark' ? '#1e293b' : '#ffffff' }}>
            {verifiedData ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box 
                  sx={{ 
                    background: theme.palette.mode === 'dark' ? '#2d3748' : '#f8fafc', 
                    p: 2, 
                    borderRadius: 2, 
                    border: `1px solid ${theme.palette.mode === 'dark' ? '#374151' : '#e2e8f0'}` 
                  }}
                >
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, fontSize: '0.85rem' }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>Symbol:</Typography>
                        <Typography sx={{ fontFamily: 'monospace', fontWeight: 600, color: theme.palette.text.primary }}>{verifiedData.symbol}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>Side:</Typography>
                        <Chip
                          label={verifiedData.side}
                          sx={{
                            background: verifiedData.side === 'BUY' ? '#dc2626' : '#16a34a',
                            color: 'white',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            px: 1,
                            borderRadius: 1,
                          }}
                        />
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>Type:</Typography>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.primary }}>{verifiedData.orderType}</Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>Quantity:</Typography>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.primary }}>{numberFmt(verifiedData.quantity)}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>SL:-</Typography>
                        <Typography sx={{ fontFamily: 'monospace', fontWeight: 600, color: '#dc2626' }}>{numberFmt(verifiedData.stopLoss)}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>TP:</Typography>
                        <Typography sx={{ fontFamily: 'monospace', fontWeight: 600, color: '#16a34a' }}>
                          {Array.isArray(verifiedData.takeProfit) ? verifiedData.takeProfit.map(numberFmt).join(', ') : numberFmt(verifiedData.takeProfit)}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  <Box 
                    sx={{ 
                      background: '#fef2f2', 
                      border: '1px solid #fecaca', 
                      p: 2, 
                      borderRadius: 2, 
                      textAlign: 'center',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    }}
                  >
                    <Typography sx={{ color: '#dc2626', fontSize: '0.75rem', fontWeight: 600, mb: 0.5 }}>MAX LOSS</Typography>
                    <Typography sx={{ color: '#dc2626', fontSize: '1rem', fontWeight: 600 }}>${numberFmt(Math.abs(verifiedData.maxLoss))}</Typography>
                  </Box>
                  <Box 
                    sx={{ 
                      background: '#f0fdf4', 
                      border: '1px solid #bbf7d0', 
                      p: 2, 
                      borderRadius: 2, 
                      textAlign: 'center',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    }}
                  >
                    <Typography sx={{ color: '#16a34a', fontSize: '0.75rem', fontWeight: 600, mb: 0.5 }}>MAX PROFIT</Typography>
                    <Typography sx={{ color: '#16a34a', fontSize: '1rem', fontWeight: 600 }}>${numberFmt(verifiedData.maxProfit)}</Typography>
                  </Box>
                </Box>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, textAlign: 'center', color: theme.palette.text.primary, py: 2 }}>
                  Verifying order...
                </Typography>
                {errorMessage && (
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, textAlign: 'center', color: '#dc2626', py: 1 }}>
                    {errorMessage}
                  </Typography>
                )}
              </Box>
            )}
          </DialogContent>
          <DialogActions sx={{ pt: 1, pb: 2, px: 3, display: 'flex', gap: 2, justifyContent: 'center' }}>
            <Button
              onClick={handleCancelConfirmation}
              variant="outlined"
              sx={{ 
                flex: 1, 
                borderRadius: 2, 
                fontSize: '0.85rem', 
                fontWeight: 600, 
                textTransform: 'none', 
                py: 0.75,
                borderColor: theme.palette.mode === 'dark' ? '#4b5563' : '#d1d5db',
                color: theme.palette.text.primary,
                '&:hover': { 
                  background: theme.palette.mode === 'dark' ? '#374151' : '#f3f4f6',
                  borderColor: theme.palette.mode === 'dark' ? '#6b7280' : '#9ca3af',
                },
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmOrder}
              variant="contained"
              sx={{
                flex: 1,
                borderRadius: 2,
                fontSize: '0.85rem',
                fontWeight: 600,
                textTransform: 'none',
                background: '#7ceba5',
                py: 0.75,
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                '&:hover': { 
                  background: '#25e5e2',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                },
                visibility: errorMessage ? 'hidden' : 'visible',
              }}
            >
              Confirm
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
      <ToastContainer position="top-right" autoClose={5000} />
    </>
  );
};

export default Dashboard;
/*

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  useTheme,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import { verifyToken, placeOrder, verifyOrder, initializeSocket, getUserAccounts, getAccountDetails } from '../api/api';
import Header from './Header';
import _ from 'lodash';
import { TrendingUp, TrendingDown, DollarSign, Settings, User, Building2 } from 'lucide-react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

interface Position {
  id: string;
  platform: string;
  type: 'BUY' | 'SELL' | 'LIMIT';
  symbol: string;
  brokerTime: string;
  openPrice: number;
  volume: number;
  brokerComment: string;
  stopLoss?: number;
  takeProfit?: number;
  liveProfit: number;
}

interface PendingOrder {
  id: string;
  type: string;
  symbol: string;
  time: string;
  currentVolume: number;
  brokerComment: string;
  stopLoss?: number;
  takeProfit?: number;
  openPrice?: number;
}

interface AccountInformation {
  platform: string;
  type: string;
  broker: string;
  currency: string;
  credit: number;
  server: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  leverage: number;
  marginLevel: number;
  marginMode: string;
  name: string;
  login: number;
}

interface Account {
  _id: string;
  brokerName: string;
  accountId: string;
  maxPositionLimit?: number;
}

interface AccountDetails extends Account {
  splittingTarget?: number;
  riskPercentage?: number;
  autoLotSizeSet?: boolean;
  dailyRiskPercentage?: number;
  remainingDailyRisk?: number;
  timezone?: string;
  location?: string;
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

const numberFmt = (n: number | undefined | null) =>
  typeof n === 'number' && !isNaN(n) ? n.toFixed(2) : 'undefined';

const stringFmt = (v: any) => (v != null ? String(v) : 'undefined');

const Dashboard: React.FC = () => {
  const theme = useTheme();
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedMetaApiAccountId, setSelectedMetaApiAccountId] = useState<string>('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountDetails, setAccountDetails] = useState<AccountDetails | null>(null);
  const [orderData, setOrderData] = useState({
    symbol: '',
    entryType: 'buy' as 'buy' | 'sell',
    lotSize: '',
    stopLoss: '',
    takeProfit: [] as string[],
    orderType: 'Market' as 'Market' | 'Stop' | 'Limit',
    comment: '',
    entryPrice: '',
  });
  const [positions, setPositions] = useState<Position[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [accountInformation, setAccountInformation] = useState<AccountInformation | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [verifiedData, setVerifiedData] = useState<VerifiedOrderData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const checkToken = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('No token found, redirecting to login');
        navigate('/login');
        return;
      }
      try {
        await verifyToken();
        const accountsData = await getUserAccounts();
        setAccounts(accountsData);
        console.log('Accounts:', accountsData);
        if (accountsData.length > 0 && !selectedAccountId) {
          setSelectedAccountId(accountsData[0]._id);
          setSelectedMetaApiAccountId(accountsData[0].accountId);
        }
      } catch (err: any) {
        console.error('Token verification failed:', err, 'Response:', err.response?.data);
        localStorage.removeItem('token');
        toast.error('Session expired. Please log in again.');
        navigate('/login');
      }
    };
    checkToken();
  }, [navigate]);

  useEffect(() => {
    if (!selectedAccountId) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    const socket = initializeSocket(token, selectedAccountId);

    socket.on('connect', () => {
      console.log(`Socket.IO connected for account ${selectedAccountId}`);
    });

    socket.on('live-data', (data: { accountId: string; positionData: { livePositions: Position[], pendingOrders: PendingOrder[], accountInformation: AccountInformation } }) => {
      if (data.accountId !== selectedMetaApiAccountId) {
        console.log(`Ignoring live-data for account ${data.accountId}, expected ${selectedMetaApiAccountId}`);
        return;
      }
      if (data.positionData && Array.isArray(data.positionData.livePositions)) {
        setPositions(data.positionData.livePositions);
      }
      setPendingOrders(data.positionData.pendingOrders || []);
      setAccountInformation(data.positionData.accountInformation || null);
    });

    socket.on('order-response', (response: { message?: string; positionIds?: string[]; error?: string }) => {
      console.log(`[${new Date().toISOString()}] Order response in Dashboard:`, response);
      if (response.error) {
        toast.error(response.error);
        console.error('Order failed:', response.error);
        setErrorMessage(response.error);
      } else {
        toast.success('Order placed successfully');
        setOrderData({ symbol: '', entryType: 'buy', lotSize: '', stopLoss: '', takeProfit: [], orderType: 'Market', comment: '', entryPrice: '' });
        console.log('Order placed successfully:', response);
      }
      setShowConfirmation(false);
      setTimeout(() => setIsSubmitting(false), 2000);
    });

    socket.on('verify-order-response', (response: { data?: VerifiedOrderData; error?: string }) => {
      console.log(`[${new Date().toISOString()}] Verify order response in Dashboard:`, response);
      if (response.error) {
        toast.error(response.error);
        console.error('Verify order failed:', response.error);
        setErrorMessage(response.error);
        setShowConfirmation(false);
        setTimeout(() => setIsSubmitting(false), 2000);
      } else if (response.data) {
        setVerifiedData(response.data);
        setErrorMessage(null);
        setShowConfirmation(true);
      }
    });

    socket.on('equity-balance', (data: { accountId: string; equity: number; balance: number }) => {
      console.log(`[${new Date().toISOString()}] Equity/Balance:`, data);
      if (data.accountId === selectedMetaApiAccountId) {
        setAccountInformation(prev => ({
          ...prev,
          equity: data.equity,
          balance: data.balance,
        } as AccountInformation));
      } else {
        console.log(`Ignoring equity-balance for account ${data.accountId}, expected ${selectedMetaApiAccountId}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket.IO disconnected for account ${selectedAccountId}`);
    });

    return () => {
      socket.off('live-data');
      socket.off('order-response');
      socket.off('verify-order-response');
      socket.off('equity-balance');
      socket.off('connect');
      socket.off('disconnect');
      socket.disconnect();
    };
  }, [selectedAccountId, selectedMetaApiAccountId]);

  useEffect(() => {
    if (accountDetails?.splittingTarget) {
      setOrderData((prev) => ({
        ...prev,
        takeProfit: Array(accountDetails.splittingTarget).fill(''),
      }));
    }
  }, [accountDetails?.splittingTarget]);

  const handleOrderChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent
  ) => {
    const { name, value } = e.target as HTMLInputElement;
    if (name.startsWith('takeProfit-')) {
      const index = parseInt(name.split('-')[1]);
      setOrderData((prev) => {
        const newTakeProfit = [...prev.takeProfit];
        newTakeProfit[index] = value;
        return { ...prev, takeProfit: newTakeProfit };
      });
    } else {
      setOrderData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleVerifyOrder = _.debounce(async () => {
    if (!isFormValid()) {
      toast.error('Please fill in all required fields (Symbol, Side, Order Type, Stop Loss, Take Profit).');
      return;
    }
    setIsSubmitting(true);
    try {
      const takeProfit = orderData.takeProfit
        .map((val) => val.trim())
        .filter((val) => val !== '')
        .map(Number)
        .filter((n) => !isNaN(n));
      if (takeProfit.length === 0) {
        toast.error('Take Profit is required.');
        setIsSubmitting(false);
        return;
      }
      if (!orderData.stopLoss || Number(orderData.stopLoss) <= 0) {
        toast.error('Stop Loss is required and must be greater than 0.');
        setIsSubmitting(false);
        return;
      }
      const data = {
        _id: selectedAccountId,
        symbol: orderData.symbol.trim().toUpperCase(),
        entryType: orderData.entryType,
        lotSize: accountDetails?.autoLotSizeSet ? undefined : Number(orderData.lotSize),
        stopLoss: Number(orderData.stopLoss),
        takeProfit: takeProfit.length > 0 ? (takeProfit.length === 1 ? takeProfit[0] : takeProfit) : undefined,
        orderType: orderData.orderType,
        comment: orderData.comment.trim() || undefined,
        entryPrice: orderData.orderType !== 'Market' && orderData.entryPrice ? Number(orderData.entryPrice) : undefined,
      };

      console.log('Verifying order:', data);
      await verifyOrder(data);
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to verify order.';
      console.error(`[${new Date().toISOString()}] Verify order failed:`, err);
      toast.error(errorMessage);
      setErrorMessage(errorMessage);
      setTimeout(() => setIsSubmitting(false), 2000);
    }
  }, 3500);

  const handleConfirmOrder = _.debounce(async () => {
    if (!isFormValid()) {
      toast.error('Please fill in all required fields (Symbol, Side, Order Type, Stop Loss, Take Profit).');
      return;
    }
    setIsSubmitting(true);
    try {
      const takeProfit = orderData.takeProfit
        .map((val) => val.trim())
        .filter((val) => val !== '')
        .map(Number)
        .filter((n) => !isNaN(n));
      if (takeProfit.length === 0) {
        toast.error('Take Profit is required.');
        setIsSubmitting(false);
        return;
      }
      if (!orderData.stopLoss || Number(orderData.stopLoss) <= 0) {
        toast.error('Stop Loss is required and must be greater than 0.');
        setIsSubmitting(false);
        return;
      }
      const data = {
        _id: selectedAccountId,
        symbol: orderData.symbol.trim().toUpperCase(),
        entryType: orderData.entryType,
        lotSize: accountDetails?.autoLotSizeSet ? undefined : Number(orderData.lotSize),
        stopLoss: Number(orderData.stopLoss),
        takeProfit: takeProfit.length > 0 ? (takeProfit.length === 1 ? takeProfit[0] : takeProfit) : undefined,
        orderType: orderData.orderType,
        comment: orderData.comment.trim() || undefined,
        entryPrice: orderData.orderType !== 'Market' && orderData.entryPrice ? Number(orderData.entryPrice) : undefined,
      };

      console.log('Submitting order (validated):', data);
      const response = await placeOrder(data);
      if (response && typeof response === 'object' && !('error' in response && response.error)) {
        try {
          const updatedDetails = await getAccountDetails(selectedAccountId);
          setAccountDetails(updatedDetails);
          console.log('Updated account details:', updatedDetails);
        } catch (err: any) {
          console.error(`[${new Date().toISOString()}] Failed to fetch updated account details:`, err);
          toast.error('Failed to fetch updated account details.');
          setErrorMessage('Failed to fetch updated account details.');
        }
      }
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to place order.';
      console.error(`[${new Date().toISOString()}] Place order failed:`, err);
      toast.error(errorMessage);
      setErrorMessage(errorMessage);
      setShowConfirmation(false);
      setTimeout(() => setIsSubmitting(false), 2000);
    }
  }, 2500);

  const handleCancelConfirmation = () => {
    setShowConfirmation(false);
    setVerifiedData(null);
    setErrorMessage(null);
    setIsSubmitting(false);
  };

  const handleAccountChange = async (accountId: string) => {
    setSelectedAccountId(accountId);
    const account = accounts.find((acc) => acc._id === accountId);
    setSelectedMetaApiAccountId(account ? account.accountId : '');
    console.log('Selected MongoDB _id:', accountId, 'MetaApi accountId:', account ? account.accountId : '');
    setPositions([]);
    setPendingOrders([]);
    setAccountInformation(null);
    setAccountDetails(null);
    try {
      const response = await getAccountDetails(accountId);
      setAccountDetails(response);
    } catch (err: any) {
      console.error(`[${new Date().toISOString()}] Failed to fetch account details:`, err);
      toast.error('Failed to fetch account details.');
      setErrorMessage('Failed to fetch account details.');
    }
  };

  const isFormValid = () => {
    if (!selectedAccountId) return false;
    if (!orderData.symbol.trim()) return false;
    if (!accountDetails?.autoLotSizeSet && (!orderData.lotSize || Number(orderData.lotSize) <= 0)) return false;
    if (!orderData.stopLoss || Number(orderData.stopLoss) <= 0) return false;
    if (orderData.takeProfit.every((val) => val.trim() === '')) return false;
    if ((orderData.orderType === 'Stop' || orderData.orderType === 'Limit') && (!orderData.entryPrice || Number(orderData.entryPrice) <= 0)) return false;
    return true;
  };

  return (
    <>
      <Header selectedAccountId={selectedAccountId} onAccountChange={handleAccountChange} />
      <Box
        sx={{
          minHeight: '100vh',
          background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #121212, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, #f8fafc, #e0f2fe, #e0e7ff)',
          p: 1,
        }}
      >
        <Box sx={{ maxWidth: '1200px', mx: 'auto' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr 1fr' }, gap: 1 }}>
            <Card
              sx={{
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, white, #f1f5f9)',
                transition: 'box-shadow 0.3s',
                '&:hover': { boxShadow: '0 4px 15px rgba(0,0,0,0.15)' },
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #2563eb, #4f46e5)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Building2 size={18} />
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>Platform Details</Typography>
                  </Box>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                {accountInformation ? (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Platform:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{stringFmt(accountInformation.platform)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Type:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
                        {stringFmt(accountInformation.type).replace('ACCOUNT_TRADE_MODE_', '')}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Broker:</Typography>
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, maxWidth: '440px', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {stringFmt(accountInformation.broker)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Currency:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
                        {stringFmt(accountInformation.leverage)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Server:</Typography>
                      <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, maxWidth: '440px' }}>
                        {stringFmt(accountInformation.server)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Name:</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <User size={14} color={theme.palette.text.secondary} />
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{stringFmt(accountInformation.name)}</Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Login:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{stringFmt(accountInformation.login)}</Typography>
                    </Box>
                  </>
                ) : (
                  <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700 }}>
                    No platform details available
                  </Typography>
                )}
              </CardContent>
            </Card>

            <Card
              sx={{
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, white, #f1f5f9)',
                transition: 'box-shadow 0.3s',
                '&:hover': { boxShadow: '0 4px 15px rgba(0,0,0,0.15)' },
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #2563eb, #4f46e5)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Settings size={18} />
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>Risk Settings</Typography>
                  </Box>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                {accountDetails ? (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Splitting Target:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{numberFmt(accountDetails.splittingTarget)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Max Position Limit:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{numberFmt(accountDetails.maxPositionLimit)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Risk Percentage:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{numberFmt(accountDetails.riskPercentage)}%</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Auto Lot Size:</Typography>
                      <Chip
                        label={accountDetails.autoLotSizeSet ? 'Enabled' : 'Disabled'}
                        sx={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          background: accountDetails.autoLotSizeSet ? '#16a34a' : '#dc2626',
                          color: 'white',
                        }}
                      />
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Daily Risk %:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{numberFmt(accountDetails.dailyRiskPercentage)}%</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Timezone:</Typography>
                      <Chip label={stringFmt(accountDetails.timezone)} sx={{ fontSize: '0.7rem', fontWeight: 700, background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe' }} />
                    </Box>
                  </>
                ) : (
                  <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700 }}>
                    No risk settings available
                  </Typography>
                )}
              </CardContent>
            </Card>

            <Card
              sx={{
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, white, #f1f5f9)',
                transition: 'box-shadow 0.3s',
                '&:hover': { boxShadow: '0 4px 15px rgba(0,0,0,0.15)' },
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #2563eb, #4f46e5)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <DollarSign size={18} />
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>Financial Info</Typography>
                  </Box>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                {accountInformation ? (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Currency:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
                        {stringFmt(accountInformation.currency)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Balance:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>${numberFmt(accountInformation.balance)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Equity:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>${numberFmt(accountInformation.equity)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Credit:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>${numberFmt(accountInformation.credit)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Margin:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>${numberFmt(accountInformation.margin)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Free Margin:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#1cb7efff' }}>${numberFmt(accountInformation.freeMargin)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Daily Risk Left:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#f97316' }}>${numberFmt(accountDetails?.remainingDailyRisk)}</Typography>
                    </Box>
                  </>
                ) : (
                  <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700 }}>
                    No financial info available
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'row', gap: 1, mt: 1, flexWrap: 'nowrap', maxWidth: '1200px' }}>
            <Card
              sx={{
                flex: '0 0 75%',
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? '#1e293b' : 'white',
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #1e293b, #334155)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>
                    Live Positions & Pending Orders
                  </Typography>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                <Box sx={{ mb: 1 }}>
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, color: theme.palette.text.primary }}>
                    <TrendingUp size={18} color="#16a34a" />
                    Live Positions
                  </Typography>
                  {positions.length === 0 ? (
                    <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700, py: 0.5 }}>
                      No open positions
                    </Typography>
                  ) : (
                    <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                      <Table size="small" aria-label="positions table">
                        <TableHead sx={{ background: theme.palette.mode === 'dark' ? '#2d3748' : '#f1f5f9' }}>
                          <TableRow>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Symbol</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Type</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Volume</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Timing</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Open Price</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Stop Loss</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Take Profit</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Comment</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>PL</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {positions.map((position) => {
                            const isProfit = position.liveProfit >= 0;
                            return (
                              <TableRow key={position.id} hover sx={{ '&:hover': { background: theme.palette.mode === 'dark' ? '#374151' : '#f8fafc' } }}>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{position.symbol}</TableCell>
                                <TableCell>
                                  <Chip
                                    label={position.type}
                                    sx={{
                                      background: position.type === 'BUY' ? '#16a34a' : '#dc2626',
                                      color: 'white',
                                      fontSize: '0.7rem',
                                      fontWeight: 700,
                                    }}
                                  />
                                </TableCell>
                                <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(position.volume)}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{position.brokerTime}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(position.openPrice)}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{numberFmt(position.stopLoss)}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>{numberFmt(position.takeProfit)}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{position.brokerComment}</TableCell>
                                <TableCell align="right">
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: isProfit ? '#16a34a' : '#dc2626', fontWeight: 700, fontSize: '0.75rem' }}>
                                    {isProfit ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                    ${numberFmt(position.liveProfit)}
                                  </Box>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, color: theme.palette.text.primary }}>
                    <TrendingUp size={18} color="#f97316" />
                    Pending Orders
                  </Typography>
                  {pendingOrders.length === 0 ? (
                    <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700, py: 0.5 }}>
                      No pending orders
                    </Typography>
                  ) : (
                    <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                      <Table size="small" aria-label="pending orders table">
                        <TableHead sx={{ background: theme.palette.mode === 'dark' ? '#2d3748' : '#f1f5f9' }}>
                          <TableRow>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Symbol</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Type</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Volume</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Timing</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Open Price</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Stop Loss</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Take Profit</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Comment</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {pendingOrders.map((order) => (
                            <TableRow key={order.id} hover sx={{ '&:hover': { background: theme.palette.mode === 'dark' ? '#374151' : '#f8fafc' } }}>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{order.symbol}</TableCell>
                              <TableCell>
                                <Chip label={order.type} sx={{ background: '#fef3c7', color: '#c2410c', border: '1px solid #fed7aa', fontSize: '0.7rem', fontWeight: 700 }} />
                              </TableCell>
                              <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(order.currentVolume)}</TableCell>
                              <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{order.time}</TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(order.openPrice)}</TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{numberFmt(order.stopLoss)}</TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>{numberFmt(order.takeProfit)}</TableCell>
                              <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>{stringFmt(order.brokerComment)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
              </CardContent>
            </Card>

            <Card
              sx={{
                flex: '0 0 25%',
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: orderData.entryType === 'buy' ? '#bbf7d0' : '#fecaca',
              }}
            >
              <CardHeader
                sx={{
                  background: orderData.entryType === 'buy' ? '#bbf7d0' : '#fecaca',
                  color: '#000000',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>
                    Place Order
                  </Typography>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important', background: orderData.entryType === 'buy' ? '#bbf7d0' : '#fecaca' }}>
                <Box component="form" noValidate autoComplete="off" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5, background: theme.palette.mode === 'dark' ? '#2d3748' : '#f1f5f9', p: 0.5, borderRadius: 2 }}>
                    <Button
                      onClick={() => setOrderData((prev) => ({ ...prev, entryType: 'buy' }))}
                      sx={{
                        width: '100%',
                        borderRadius: 1,
                        py: 0.5,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        transition: 'all 0.2s',
                        background: orderData.entryType === 'buy' ? '#16a34a' : 'transparent',
                        color: orderData.entryType === 'buy' ? 'white' : theme.palette.text.secondary,
                        '&:hover': { background: orderData.entryType === 'buy' ? '#15803d' : theme.palette.mode === 'dark' ? '#374151' : '#e2e8f0' },
                      }}
                    >
                      BUY
                    </Button>
                    <Button
                      onClick={() => setOrderData((prev) => ({ ...prev, entryType: 'sell' }))}
                      sx={{
                        width: '100%',
                        borderRadius: 1,
                        py: 0.5,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        transition: 'all 0.2s',
                        background: orderData.entryType === 'sell' ? '#dc2626' : 'transparent',
                        color: orderData.entryType === 'sell' ? 'white' : theme.palette.text.secondary,
                        '&:hover': { background: orderData.entryType === 'sell' ? '#b91c1c' : theme.palette.mode === 'dark' ? '#374151' : '#e2e8f0' },
                      }}
                    >
                      SELL
                    </Button>
                  </Box>
                  <TextField
                    fullWidth
                    label="Symbol (e.g., EURUSD)"
                    name="symbol"
                    variant="outlined"
                    value={orderData.symbol}
                    onChange={handleOrderChange}
                    sx={{
                      '& .MuiOutlinedInput-root': { borderRadius: 2, fontFamily: 'monospace', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1, fontSize: '0.75rem', background: '#ffffff', color: '#000000' },
                      '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#000000' },
                      '& .MuiInputBase-input': { fontSize: '0.75rem' },
                      '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                      '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                    }}
                  />
                  <FormControl fullWidth>
                    <InputLabel sx={{ fontSize: '0.75rem', color: '#000000' }}>Order Type</InputLabel>
                    <Select
                      name="orderType"
                      value={orderData.orderType}
                      onChange={handleOrderChange}
                      label="Order Type"
                      sx={{
                        borderRadius: 2,
                        '& .MuiSelect-select': { fontSize: '0.75rem', background: '#ffffff', color: '#000000' },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                      }}
                    >
                      <MenuItem value="Market" sx={{ fontSize: '0.75rem' }}>Market</MenuItem>
                      <MenuItem value="Stop" sx={{ fontSize: '0.75rem' }}>Stop</MenuItem>
                      <MenuItem value="Limit" sx={{ fontSize: '0.75rem' }}>Limit</MenuItem>
                    </Select>
                  </FormControl>
                  {(orderData.orderType === 'Stop' || orderData.orderType === 'Limit') && (
                    <TextField
                      fullWidth
                      label="Entry Price"
                      name="entryPrice"
                      type="number"
                      variant="outlined"
                      value={orderData.entryPrice}
                      onChange={handleOrderChange}
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontFamily: 'monospace', fontSize: '0.75rem', background: '#ffffff', color: '#000000' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#000000' },
                        '& .MuiInputBase-input': { fontSize: '0.75rem' },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                        '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                      }}
                      inputProps={{ step: '0.00001', inputMode: 'decimal' }}
                    />
                  )}
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
                    {!accountDetails?.autoLotSizeSet && (
                      <TextField
                        fullWidth
                        label="Lot Size"
                        name="lotSize"
                        type="number"
                        variant="outlined"
                        value={orderData.lotSize}
                        onChange={handleOrderChange}
                        sx={{
                          '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontSize: '0.75rem', background: '#ffffff', color: '#000000' },
                          '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#000000' },
                          '& .MuiInputBase-input': { fontSize: '0.75rem' },
                          '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                          '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                        }}
                        inputProps={{ step: '0.01', inputMode: 'decimal' }}
                      />
                    )}
                    <TextField
                      fullWidth
                      label="Stop Loss"
                      name="stopLoss"
                      type="number"
                      variant="outlined"
                      value={orderData.stopLoss}
                      onChange={handleOrderChange}
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontFamily: 'monospace', background: '#ffffff', fontSize: '0.75rem' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#dc2626' },
                        '& .MuiInputBase-input': { fontSize: '0.75rem', color: '#000000' },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                        '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                      }}
                      inputProps={{ step: '0.00001', inputMode: 'decimal' }}
                    />
                    {accountDetails?.splittingTarget && Array.from({ length: accountDetails.splittingTarget }, (_, index) => (
                      <TextField
                        key={`takeProfit-${index}`}
                        fullWidth
                        label={`Target ${index + 1}`}
                        name={`takeProfit-${index}`}
                        type="text"
                        variant="outlined"
                        value={orderData.takeProfit[index] || ''}
                        onChange={handleOrderChange}
                        sx={{
                          '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontFamily: 'monospace', background: '#ffffff', fontSize: '0.75rem' },
                          '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#16a34a' },
                          '& .MuiInputBase-input': { fontSize: '0.75rem', color: '#000000' },
                          '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                          '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                        }}
                        inputProps={{ inputMode: 'decimal' }}
                      />
                    ))}
                    <TextField
                      fullWidth
                      label="Comment (optional)"
                      name="comment"
                      variant="outlined"
                      value={orderData.comment}
                      onChange={handleOrderChange}
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '0.75rem', background: '#ffffff', color: '#000000' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#000000' },
                        '& .MuiInputBase-input': { fontSize: '0.75rem' },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                        '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                      }}
                    />
                  </Box>
                  <Button
                    fullWidth
                    variant="contained"
                    onClick={handleVerifyOrder}
                    disabled={isSubmitting}
                    sx={{
                      py: 0.75,
                      borderRadius: 2,
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      textTransform: 'none',
                      background: orderData.entryType === 'buy' ? '#16a34a' : '#dc2626',
                      boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
                      '&:hover': {
                        background: orderData.entryType === 'buy' ? '#15803d' : '#b91c1c',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.25)',
                      },
                    }}
                  >
                    Place {orderData.entryType.toUpperCase()} Order
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Box>

        <Dialog 
          open={showConfirmation} 
          onClose={handleCancelConfirmation} 
          sx={{ 
            '& .MuiDialog-paper': { 
              width: '40%', 
              minHeight: '40%', 
              borderRadius: 3, 
              boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
              background: theme.palette.mode === 'dark' ? '#1e293b' : '#ffffff',
            } 
          }}
        >
          <DialogTitle 
            sx={{ 
              fontSize: '1.2rem', 
              fontWeight: 600, 
              textAlign: 'center', 
              py: 2, 
              color: theme.palette.text.primary,
              background: theme.palette.mode === 'dark' ? 'linear-gradient(to right, #1e293b, #2d3748)' : 'linear-gradient(to right, #f8fafc, #e0f2fe)',
              borderBottom: `1px solid ${theme.palette.divider}`,
            }}
          >
            Confirm Order
          </DialogTitle>
          <DialogContent sx={{ maxWidth: '1000px', p: 3, background: theme.palette.mode === 'dark' ? '#1e293b' : '#ffffff' }}>
            {verifiedData ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box 
                  sx={{ 
                    background: theme.palette.mode === 'dark' ? '#2d3748' : '#f8fafc', 
                    p: 2, 
                    borderRadius: 2, 
                    border: `1px solid ${theme.palette.mode === 'dark' ? '#374151' : '#e2e8f0'}` 
                  }}
                >
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, fontSize: '0.85rem' }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>Symbol:</Typography>
                        <Typography sx={{ fontFamily: 'monospace', fontWeight: 600, color: theme.palette.text.primary }}>{verifiedData.symbol}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>Side:</Typography>
                        <Chip
                          label={verifiedData.side}
                          sx={{
                            background: verifiedData.side === 'BUY' ? '#dc2626' : '#16a34a',
                            color: 'white',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            px: 1,
                            borderRadius: 1,
                          }}
                        />
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>Type:</Typography>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.primary }}>{verifiedData.orderType}</Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>Quantity:</Typography>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.primary }}>{numberFmt(verifiedData.quantity)}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>SL:</Typography>
                        <Typography sx={{ fontFamily: 'monospace', fontWeight: 600, color: '#dc2626' }}>{numberFmt(verifiedData.stopLoss)}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>TP:</Typography>
                        <Typography sx={{ fontFamily: 'monospace', fontWeight: 600, color: '#16a34a' }}>
                          {Array.isArray(verifiedData.takeProfit) ? verifiedData.takeProfit.map(numberFmt).join(', ') : numberFmt(verifiedData.takeProfit)}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  <Box 
                    sx={{ 
                      background: '#fef2f2', 
                      border: '1px solid #fecaca', 
                      p: 2, 
                      borderRadius: 2, 
                      textAlign: 'center',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    }}
                  >
                    <Typography sx={{ color: '#dc2626', fontSize: '0.75rem', fontWeight: 600, mb: 0.5 }}>MAX LOSS</Typography>
                    <Typography sx={{ color: '#dc2626', fontSize: '1rem', fontWeight: 600 }}>${numberFmt(Math.abs(verifiedData.maxLoss))}</Typography>
                  </Box>
                  <Box 
                    sx={{ 
                      background: '#f0fdf4', 
                      border: '1px solid #bbf7d0', 
                      p: 2, 
                      borderRadius: 2, 
                      textAlign: 'center',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    }}
                  >
                    <Typography sx={{ color: '#16a34a', fontSize: '0.75rem', fontWeight: 600, mb: 0.5 }}>MAX PROFIT</Typography>
                    <Typography sx={{ color: '#16a34a', fontSize: '1rem', fontWeight: 600 }}>${numberFmt(verifiedData.maxProfit)}</Typography>
                  </Box>
                </Box>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, textAlign: 'center', color: theme.palette.text.primary, py: 2 }}>
                  Verifying order...
                </Typography>
                {errorMessage && (
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, textAlign: 'center', color: '#dc2626', py: 1 }}>
                    {errorMessage}
                  </Typography>
                )}
              </Box>
            )}
          </DialogContent>
          <DialogActions sx={{ pt: 1, pb: 2, px: 3, display: 'flex', gap: 2, justifyContent: 'center' }}>
            <Button
              onClick={handleCancelConfirmation}
              variant="outlined"
              sx={{ 
                flex: 1, 
                borderRadius: 2, 
                fontSize: '0.85rem', 
                fontWeight: 600, 
                textTransform: 'none', 
                py: 0.75,
                borderColor: theme.palette.mode === 'dark' ? '#4b5563' : '#d1d5db',
                color: theme.palette.text.primary,
                '&:hover': { 
                  background: theme.palette.mode === 'dark' ? '#374151' : '#f3f4f6',
                  borderColor: theme.palette.mode === 'dark' ? '#6b7280' : '#9ca3af',
                },
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmOrder}
              variant="contained"
              sx={{
                flex: 1,
                borderRadius: 2,
                fontSize: '0.85rem',
                fontWeight: 600,
                textTransform: 'none',
                background: '#7ceba5',
                py: 0.75,
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                '&:hover': { 
                  background: '#25e5e2',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                },
                visibility: errorMessage ? 'hidden' : 'visible',
              }}
            >
              Confirm
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
      <ToastContainer position="top-right" autoClose={5000} />
    </>
  );
};

export default Dashboard;


/*

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,

  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  useTheme,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import { verifyToken, placeOrder, verifyOrder, initializeSocket, getUserAccounts, getAccountDetails } from '../api/api';
import Header from './Header';
import _ from 'lodash';
import { TrendingUp, TrendingDown, DollarSign, Settings, User, Building2 } from 'lucide-react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

interface Position {
  id: string;
  platform: string;
  type: 'BUY' | 'SELL' | 'LIMIT';
  symbol: string;
  brokerTime: string;
  openPrice: number;
  volume: number;
  brokerComment: string;
  stopLoss?: number;
  takeProfit?: number;
  liveProfit: number;
}

interface PendingOrder {
  id: string;
  type: string;
  symbol: string;
  time: string;
  currentVolume: number;
  brokerComment: string;
  stopLoss?: number;
  takeProfit?: number;
  openPrice?: number;
}

interface AccountInformation {
  platform: string;
  type: string;
  broker: string;
  currency: string;
  credit:number;
  server: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  leverage: number;
  marginLevel: number;
  marginMode: string;
  name: string;
  login: number;
}

interface Account {
  _id: string;
  brokerName: string;
  accountId: string;
  maxPositionLimit?: number;
}

interface AccountDetails extends Account {
  splittingTarget?: number;
  riskPercentage?: number;
  autoLotSizeSet?: boolean;
  dailyRiskPercentage?: number;
  remainingDailyRisk?: number;
  timezone?: string;
  location?: string;
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

const numberFmt = (n: number | undefined | null) =>
  typeof n === 'number' && !isNaN(n) ? n.toFixed(2) : 'undefined';

const stringFmt = (v: any) => (v != null ? String(v) : 'undefined');

const Dashboard: React.FC = () => {
  const theme = useTheme();
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedMetaApiAccountId, setSelectedMetaApiAccountId] = useState<string>('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountDetails, setAccountDetails] = useState<AccountDetails | null>(null);
  const [orderData, setOrderData] = useState({
    symbol: '',
    entryType: 'buy' as 'buy' | 'sell',
    lotSize: '',
    stopLoss: '',
    takeProfit: [] as string[],
    orderType: 'Market' as 'Market' | 'Stop' | 'Limit',
    comment: '',
    entryPrice: '',
  });
  const [positions, setPositions] = useState<Position[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [accountInformation, setAccountInformation] = useState<AccountInformation | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [verifiedData, setVerifiedData] = useState<VerifiedOrderData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const checkToken = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('No token found, redirecting to login');
        navigate('/login');
        return;
      }
      try {
        await verifyToken();
        const accountsData = await getUserAccounts();
        setAccounts(accountsData);
        console.log('Accounts:', accountsData);
        if (accountsData.length > 0 && !selectedAccountId) {
          setSelectedAccountId(accountsData[0]._id);
          setSelectedMetaApiAccountId(accountsData[0].accountId);
        }
      } catch (err: any) {
        console.error('Token verification failed:', err, 'Response:', err.response?.data);
        localStorage.removeItem('token');
        toast.error('Session expired. Please log in again.');
        navigate('/login');
      }
    };
    checkToken();
  }, [navigate]);

  useEffect(() => {
    if (!selectedAccountId) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    const socket = initializeSocket(token, selectedAccountId);

    socket.on('connect', () => {
      console.log(`Socket.IO connected for account ${selectedAccountId}`);
    });

    socket.on('live-data', (data: { accountId: string; positionData: { livePositions: Position[], pendingOrders: PendingOrder[], accountInformation: AccountInformation } }) => {
      if (data.accountId !== selectedMetaApiAccountId) {
        console.log(`Ignoring live-data for account ${data.accountId}, expected ${selectedMetaApiAccountId}`);
        return;
      }
      if (data.positionData && Array.isArray(data.positionData.livePositions)) {
        setPositions(data.positionData.livePositions);
      }
      setPendingOrders(data.positionData.pendingOrders || []);
      setAccountInformation(data.positionData.accountInformation || null);
    });

    socket.on('order-response', (response: { message?: string; positionIds?: string[]; error?: string }) => {
      console.log(`[${new Date().toISOString()}] Order response in Dashboard:`, response);
      if (response.error) {
        toast.error(response.error);
        console.error('Order failed:', response.error);
      } else {
        toast.success('Order placed successfully');
        setOrderData({ symbol: '', entryType: 'buy', lotSize: '', stopLoss: '', takeProfit: [], orderType: 'Market', comment: '', entryPrice: '' });
        console.log('Order placed successfully:', response);
      }
      setShowConfirmation(false);
      setTimeout(() => setIsSubmitting(false), 2000);
    });

    socket.on('verify-order-response', (response: { data?: VerifiedOrderData; error?: string }) => {
      console.log(`[${new Date().toISOString()}] Verify order response in Dashboard:`, response);
      if (response.error) {
        toast.error(response.error);
        console.error('Verify order failed:', response.error);
        setShowConfirmation(false);
        setTimeout(() => setIsSubmitting(false), 2000);
      } else if (response.data) {
        setVerifiedData(response.data);
        setShowConfirmation(true);
      }
    });

    socket.on('equity-balance', (data: { accountId: string; equity: number; balance: number }) => {
      console.log(`[${new Date().toISOString()}] Equity/Balance:`, data);
      if (data.accountId === selectedMetaApiAccountId) {
        setAccountInformation(prev => ({
          ...prev,
          equity: data.equity,
          balance: data.balance,
        } as AccountInformation));
      } else {
        console.log(`Ignoring equity-balance for account ${data.accountId}, expected ${selectedMetaApiAccountId}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket.IO disconnected for account ${selectedAccountId}`);
    });

    return () => {
      socket.off('live-data');
      socket.off('order-response');
      socket.off('verify-order-response');
      socket.off('equity-balance');
      socket.off('connect');
      socket.off('disconnect');
      socket.disconnect();
    };
  }, [selectedAccountId, selectedMetaApiAccountId]);

  useEffect(() => {
    // Initialize takeProfit array based on splittingTarget
    if (accountDetails?.splittingTarget) {
      setOrderData((prev) => ({
        ...prev,
        takeProfit: Array(accountDetails.splittingTarget).fill(''),
      }));
    }
  }, [accountDetails?.splittingTarget]);

  const handleOrderChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent
  ) => {
    const { name, value } = e.target as HTMLInputElement;
    if (name.startsWith('takeProfit-')) {
      const index = parseInt(name.split('-')[1]);
      setOrderData((prev) => {
        const newTakeProfit = [...prev.takeProfit];
        newTakeProfit[index] = value;
        return { ...prev, takeProfit: newTakeProfit };
      });
    } else {
      setOrderData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleVerifyOrder = _.debounce(async () => {
    setIsSubmitting(true);
    try {
      const takeProfit = orderData.takeProfit
        .map((val) => val.trim())
        .filter((val) => val !== '')
        .map(Number)
        .filter((n) => !isNaN(n));
      const data = {
        _id: selectedAccountId,
        symbol: orderData.symbol.trim().toUpperCase(),
        entryType: orderData.entryType,
        lotSize: orderData.lotSize ? Number(orderData.lotSize) : undefined,
        stopLoss: orderData.stopLoss ? Number(orderData.stopLoss) : undefined,
        takeProfit: takeProfit.length > 0 ? (takeProfit.length === 1 ? takeProfit[0] : takeProfit) : undefined,
        orderType: orderData.orderType,
        comment: orderData.comment.trim() || undefined,
        entryPrice: orderData.orderType !== 'Market' && orderData.entryPrice ? Number(orderData.entryPrice) : undefined,
      };

      console.log('Verifying order:', data);
      await verifyOrder(data);
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to verify order.';
      console.error(`[${new Date().toISOString()}] Verify order failed:`, err);
      toast.error(errorMessage);
      setTimeout(() => setIsSubmitting(false), 2000);
    }
  }, 3500);

  const handleConfirmOrder = _.debounce(async () => {
    setIsSubmitting(true);
    try {
      const takeProfit = orderData.takeProfit
        .map((val) => val.trim())
        .filter((val) => val !== '')
        .map(Number)
        .filter((n) => !isNaN(n));
      const data = {
        _id: selectedAccountId,
        symbol: orderData.symbol.trim().toUpperCase(),
        entryType: orderData.entryType,
        lotSize: orderData.lotSize ? Number(orderData.lotSize) : undefined,
        stopLoss: orderData.stopLoss ? Number(orderData.stopLoss) : undefined,
        takeProfit: takeProfit.length > 0 ? (takeProfit.length === 1 ? takeProfit[0] : takeProfit) : undefined,
        orderType: orderData.orderType,
        comment: orderData.comment.trim() || undefined,
        entryPrice: orderData.orderType !== 'Market' && orderData.entryPrice ? Number(orderData.entryPrice) : undefined,
      };

      console.log('Submitting order (validated):', data);
      const response = await placeOrder(data);
      if (response && typeof response === 'object' && !('error' in response && response.error)) {
        try {
          const updatedDetails = await getAccountDetails(selectedAccountId);
          setAccountDetails(updatedDetails);
          console.log('Updated account details:', updatedDetails);
        } catch (err: any) {
          console.error(`[${new Date().toISOString()}] Failed to fetch updated account details:`, err);
          toast.error('Failed to fetch updated account details.');
        }
      }
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to place order.';
      console.error(`[${new Date().toISOString()}] Place order failed:`, err);
      toast.error(errorMessage);
      setShowConfirmation(false);
      setTimeout(() => setIsSubmitting(false), 2000);
    }
  }, 2500);

  const handleCancelConfirmation = () => {
    setShowConfirmation(false);
    setVerifiedData(null);
    setIsSubmitting(false);
  };

  const handleAccountChange = async (accountId: string) => {
    setSelectedAccountId(accountId);
    const account = accounts.find((acc) => acc._id === accountId);
    setSelectedMetaApiAccountId(account ? account.accountId : '');
    console.log('Selected MongoDB _id:', accountId, 'MetaApi accountId:', account ? account.accountId : '');
    setPositions([]);
    setPendingOrders([]);
    setAccountInformation(null);
    setAccountDetails(null);
    try {
      const response = await getAccountDetails(accountId);
      setAccountDetails(response);
    } catch (err: any) {
      console.error(`[${new Date().toISOString()}] Failed to fetch account details:`, err);
      toast.error('Failed to fetch account details.');
    }
  };

  const isFormValid = () => {
    if (!selectedAccountId) return false;
    if (!orderData.symbol.trim()) return false;
    if (!orderData.lotSize || Number(orderData.lotSize) <= 0) return false;
    if ((orderData.orderType === 'Stop' || orderData.orderType === 'Limit') && (!orderData.entryPrice || Number(orderData.entryPrice) <= 0)) return false;
    return true;
  };

  return (
    <>
      <Header selectedAccountId={selectedAccountId} onAccountChange={handleAccountChange} />
      <Box
        sx={{
          minHeight: '100vh',
          background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #121212, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, #f8fafc, #e0f2fe, #e0e7ff)',
          p: 1,
        }}
      >
        <Box sx={{ maxWidth: '1200px', mx: 'auto' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr 1fr' }, gap: 1 }}>
            <Card
              sx={{
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, white, #f1f5f9)',
                transition: 'box-shadow 0.3s',
                '&:hover': { boxShadow: '0 4px 15px rgba(0,0,0,0.15)' },
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #2563eb, #4f46e5)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Building2 size={18} />
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>Platform Details</Typography>
                  </Box>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                {accountInformation ? (
                  <>

                  
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Platform:</Typography>
     <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{stringFmt(accountInformation.platform)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Type:</Typography>
                 <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
               {stringFmt(accountInformation.type).replace('ACCOUNT_TRADE_MODE_', '')}
                 </Typography>
                     
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Broker:</Typography>
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, maxWidth: '440px', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {stringFmt(accountInformation.broker)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Currency:</Typography>
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
              {stringFmt(accountInformation.leverage)}
                 </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>

                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Server:</Typography>
                      <Typography sx={{ fontSize: '0.65rem', fontWeight: 700 ,maxWidth: '440px',}}>
                        {stringFmt(accountInformation.server)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Name:</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <User size={14} color={theme.palette.text.secondary} />
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{stringFmt(accountInformation.name)}</Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Login:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{stringFmt(accountInformation.login)}</Typography>
                    </Box>
                  </>
                ) : (
                  <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700 }}>
                    No platform details available
                  </Typography>
                )}
              </CardContent>
            </Card>

            <Card
              sx={{
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, white, #f1f5f9)',
                transition: 'box-shadow 0.3s',
                '&:hover': { boxShadow: '0 4px 15px rgba(0,0,0,0.15)' },
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #2563eb, #4f46e5)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Settings size={18} />
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>Risk Settings</Typography>
                  </Box>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                {accountDetails ? (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Splitting Target:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{numberFmt(accountDetails.splittingTarget)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Max Position Limit:</Typography>
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{numberFmt(accountDetails.maxPositionLimit)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Risk Percentage:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{numberFmt(accountDetails.riskPercentage)}%</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Auto Lot Size:</Typography>
                      <Chip
                        label={accountDetails.autoLotSizeSet ? 'Enabled' : 'Disabled'}
                        sx={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          background: accountDetails.autoLotSizeSet ? '#16a34a' : '#dc2626',
                          color: 'white',
                        }}
                      />
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Daily Risk %:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{numberFmt(accountDetails.dailyRiskPercentage)}%</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Timezone:</Typography>
                      <Chip label={stringFmt(accountDetails.timezone)} sx={{ fontSize: '0.7rem', fontWeight: 700, background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe' }} />
                    </Box>
                  </>
                ) : (
                  <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700 }}>
                    No risk settings available
                  </Typography>
                )}
              </CardContent>
            </Card>

            <Card
              sx={{
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, white, #f1f5f9)',
                transition: 'box-shadow 0.3s',
                '&:hover': { boxShadow: '0 4px 15px rgba(0,0,0,0.15)' },
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #2563eb, #4f46e5)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <DollarSign size={18} />
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>Financial Info</Typography>
                  </Box>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                {accountInformation ? (
                  <>
                   <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Currency:</Typography>
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
              {stringFmt(accountInformation.currency)}
                 </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Balance:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>${numberFmt(accountInformation.balance)}</Typography>
                    </Box>
                     <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Equity:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>${numberFmt(accountInformation.equity)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Credit:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>${numberFmt(accountInformation.credit)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Margin:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>${numberFmt(accountInformation.margin)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Free Margin:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#1cb7efff' }}>${numberFmt(accountInformation.freeMargin)}</Typography>
                    </Box>
                  
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Daily Risk Left:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#f97316' }}>${numberFmt(accountDetails?.remainingDailyRisk)}</Typography>
                    </Box>
                  </>
                ) : (
                  <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700 }}>
                    No financial info available
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'row', gap: 1, mt: 1, flexWrap: 'nowrap', maxWidth: '1200px' }}>
            <Card
              sx={{
                flex: '0 0 75%',
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? '#1e293b' : 'white',
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #1e293b, #334155)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>
                    Live Positions & Pending Orders
                  </Typography>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                <Box sx={{ mb: 1 }}>
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, color: theme.palette.text.primary }}>
                    <TrendingUp size={18} color="#16a34a" />
                    Live Positions
                  </Typography>
                  {positions.length === 0 ? (
                    <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700, py: 0.5 }}>
                      No open positions
                    </Typography>
                  ) : (
                    <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                      <Table size="small" aria-label="positions table">
                        <TableHead sx={{ background: theme.palette.mode === 'dark' ? '#2d3748' : '#f1f5f9' }}>
                          <TableRow>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Symbol</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Type</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Volume</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Timing</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Open Price</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Stop Loss</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Take Profit</TableCell>
                               <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Comment</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>PL</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {positions.map((position) => {
                            const isProfit = position.liveProfit >= 0;
                            return (
                              <TableRow key={position.id} hover sx={{ '&:hover': { background: theme.palette.mode === 'dark' ? '#374151' : '#f8fafc' } }}>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{position.symbol}</TableCell>
                                <TableCell>
                                  <Chip
                                    label={position.type}
                                    sx={{
                                      background: position.type === 'BUY' ? '#16a34a' : '#dc2626',
                                      color: 'white',
                                      fontSize: '0.7rem',
                                      fontWeight: 700,
                                    }}
                                  />
                                </TableCell>
                                <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(position.volume)}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{position.brokerTime}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(position.openPrice)}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{numberFmt(position.stopLoss)}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>{numberFmt(position.takeProfit)}</TableCell>
                                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{position.brokerComment}</TableCell>
            
                                <TableCell align="right">
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: isProfit ? '#16a34a' : '#dc2626', fontWeight: 700, fontSize: '0.75rem' }}>
                                    {isProfit ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                    ${numberFmt(position.liveProfit)}
                                  </Box>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, color: theme.palette.text.primary }}>
                    <TrendingUp size={18} color="#f97316" />
                    Pending Orders
                  </Typography>
                  {pendingOrders.length === 0 ? (
                    <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700, py: 0.5 }}>
                      No pending orders
                    </Typography>
                  ) : (
                    <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                      <Table size="small" aria-label="pending orders table">
                        <TableHead sx={{ background: theme.palette.mode === 'dark' ? '#2d3748' : '#f1f5f9' }}>
                          <TableRow>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Symbol</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Type</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Volume</TableCell>
                                 <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Timing</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Open Price</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Stop Loss</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Take Profit</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Comment</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {pendingOrders.map((order) => (
                            <TableRow key={order.id} hover sx={{ '&:hover': { background: theme.palette.mode === 'dark' ? '#374151' : '#f8fafc' } }}>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{order.symbol}</TableCell>
                              <TableCell>
                                <Chip label={order.type} sx={{ background: '#fef3c7', color: '#c2410c', border: '1px solid #fed7aa', fontSize: '0.7rem', fontWeight: 700 }} />
                              </TableCell>
                              <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(order.currentVolume)}</TableCell>
                                    <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{(order.time)}</TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(order.openPrice)}</TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{numberFmt(order.stopLoss)}</TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>{numberFmt(order.takeProfit)}</TableCell>
                              <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>{stringFmt(order.brokerComment)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
              </CardContent>
            </Card>

            <Card
              sx={{
                flex: '0 0 25%',
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: orderData.entryType === 'buy' ? '#bbf7d0' : '#fecaca',
              }}
            >
              <CardHeader
                sx={{
                  background: orderData.entryType === 'buy' ? '#bbf7d0' : '#fecaca',
                  color: '#000000',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>
                    Place Order
                  </Typography>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important', background: orderData.entryType === 'buy' ? '#bbf7d0' : '#fecaca' }}>
                <Box component="form" noValidate autoComplete="off" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5, background: theme.palette.mode === 'dark' ? '#2d3748' : '#f1f5f9', p: 0.5, borderRadius: 2 }}>
                    <Button
                      onClick={() => setOrderData((prev) => ({ ...prev, entryType: 'buy' }))}
                      sx={{
                        width: '100%',
                        borderRadius: 1,
                        py: 0.5,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        transition: 'all 0.2s',
                        background: orderData.entryType === 'buy' ? '#16a34a' : 'transparent',
                        color: orderData.entryType === 'buy' ? 'white' : theme.palette.text.secondary,
                        '&:hover': { background: orderData.entryType === 'buy' ? '#15803d' : theme.palette.mode === 'dark' ? '#374151' : '#e2e8f0' },
                      }}
                    >
                      BUY
                    </Button>
                    <Button
                      onClick={() => setOrderData((prev) => ({ ...prev, entryType: 'sell' }))}
                      sx={{
                        width: '100%',
                        borderRadius: 1,
                        py: 0.5,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        transition: 'all 0.2s',
                        background: orderData.entryType === 'sell' ? '#dc2626' : 'transparent',
                        color: orderData.entryType === 'sell' ? 'white' : theme.palette.text.secondary,
                        '&:hover': { background: orderData.entryType === 'sell' ? '#b91c1c' : theme.palette.mode === 'dark' ? '#374151' : '#e2e8f0' },
                      }}
                    >
                      SELL
                    </Button>
                  </Box>
                  <TextField
                    fullWidth
                    label="Symbol (e.g., EURUSD)"
                    name="symbol"
                    variant="outlined"
                    value={orderData.symbol}
                    onChange={handleOrderChange}
                    sx={{
                      '& .MuiOutlinedInput-root': { borderRadius: 2, fontFamily: 'monospace', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1, fontSize: '0.75rem', background: '#ffffff', color: '#000000' },
                      '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#000000' },
                      '& .MuiInputBase-input': { fontSize: '0.75rem' },
                      '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                      '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                    }}
                  />
                  <FormControl fullWidth>
                    <InputLabel sx={{ fontSize: '0.75rem', color: '#000000' }}>Order Type</InputLabel>
                    <Select
                      name="orderType"
                      value={orderData.orderType}
                      onChange={handleOrderChange}
                      label="Order Type"
                      sx={{
                        borderRadius: 2,
                        '& .MuiSelect-select': { fontSize: '0.75rem', background: '#ffffff', color: '#000000' },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                      }}
                    >
                      <MenuItem value="Market" sx={{ fontSize: '0.75rem' }}>Market</MenuItem>
                      <MenuItem value="Stop" sx={{ fontSize: '0.75rem' }}>Stop</MenuItem>
                      <MenuItem value="Limit" sx={{ fontSize: '0.75rem' }}>Limit</MenuItem>
                    </Select>
                  </FormControl>
                  {(orderData.orderType === 'Stop' || orderData.orderType === 'Limit') && (
                    <TextField
                      fullWidth
                      label="Entry Price"
                      name="entryPrice"
                      type="number"
                      variant="outlined"
                      value={orderData.entryPrice}
                      onChange={handleOrderChange}
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontFamily: 'monospace', fontSize: '0.75rem', background: '#ffffff', color: '#000000' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#000000' },
                        '& .MuiInputBase-input': { fontSize: '0.75rem' },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                        '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                      }}
                      inputProps={{ step: '0.00001', inputMode: 'decimal' }}
                    />
                  )}
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
                    <TextField
                      fullWidth
                      label="Lot Size"
                      name="lotSize"
                      type="number"
                      variant="outlined"
                      value={orderData.lotSize}
                      onChange={handleOrderChange}
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontSize: '0.75rem', background: '#ffffff', color: '#000000' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#000000' },
                        '& .MuiInputBase-input': { fontSize: '0.75rem' },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                        '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                      }}
                      inputProps={{ step: '0.01', inputMode: 'decimal' }}
                    />
                    <TextField
                      fullWidth
                      label="Stop Loss"
                      name="stopLoss"
                      type="number"
                      variant="outlined"
                      value={orderData.stopLoss}
                      onChange={handleOrderChange}
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontFamily: 'monospace', background: '#ffffff', fontSize: '0.75rem' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#dc2626' },
                        '& .MuiInputBase-input': { fontSize: '0.75rem', color: '#000000' },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                        '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                      }}
                      inputProps={{ step: '0.00001', inputMode: 'decimal' }}
                    />
                    {accountDetails?.splittingTarget && Array.from({ length: accountDetails.splittingTarget }, (_, index) => (
                      <TextField
                        key={`takeProfit-${index}`}
                        fullWidth
                        label={`Target ${index + 1}`}
                        name={`takeProfit-${index}`}
                        type="text"
                        variant="outlined"
                        value={orderData.takeProfit[index] || ''}
                        onChange={handleOrderChange}
                        sx={{
                          '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontFamily: 'monospace', background: '#ffffff', fontSize: '0.75rem' },
                          '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#16a34a' },
                          '& .MuiInputBase-input': { fontSize: '0.75rem', color: '#000000' },
                          '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                          '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                        }}
                        inputProps={{ inputMode: 'decimal' }}
                      />
                    ))}
                    <TextField
                      fullWidth
                      label="Comment (optional)"
                      name="comment"
                      variant="outlined"
                      value={orderData.comment}
                      onChange={handleOrderChange}
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '0.75rem', background: '#ffffff', color: '#000000' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#000000' },
                        '& .MuiInputBase-input': { fontSize: '0.75rem' },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                        '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                      }}
                    />
                  </Box>
                  <Button
                    fullWidth
                    variant="contained"
                    onClick={handleVerifyOrder}
                    disabled={isSubmitting}
                    sx={{
                      py: 0.75,
                      borderRadius: 2,
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      textTransform: 'none',
                      background: orderData.entryType === 'buy' ? '#16a34a' : '#dc2626',
                      boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
                      '&:hover': {
                        background: orderData.entryType === 'buy' ? '#15803d' : '#b91c1c',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.25)',
                      },
                    }}
                  >
                    Place {orderData.entryType.toUpperCase()} Order
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Box>

       <Dialog 
  open={showConfirmation} 
  onClose={handleCancelConfirmation} 
  sx={{ 
    '& .MuiDialog-paper': { 
      width: '40%', 
      minHeight: '40%', 
      borderRadius: 3, 
      boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
      background: theme.palette.mode === 'dark' ? '#1e293b' : '#ffffff',
    } 
  }}
>
  <DialogTitle 
    sx={{ 
      fontSize: '1.2rem', 
      fontWeight: 600, 
      textAlign: 'center', 
      py: 2, 
      color: theme.palette.text.primary,
      background: theme.palette.mode === 'dark' ? 'linear-gradient(to right, #1e293b, #2d3748)' : 'linear-gradient(to right, #f8fafc, #e0f2fe)',
      borderBottom: `1px solid ${theme.palette.divider}`,
    }}
  >
    Confirm Order
  </DialogTitle>
  <DialogContent sx={{ maxWidth: '1000px', p: 3, background: theme.palette.mode === 'dark' ? '#1e293b' : '#ffffff' }}>
    {verifiedData ? (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box 
          sx={{ 
            background: theme.palette.mode === 'dark' ? '#2d3748' : '#f8fafc', 
            p: 2, 
            borderRadius: 2, 
            border: `1px solid ${theme.palette.mode === 'dark' ? '#374151' : '#e2e8f0'}` 
          }}
        >
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, fontSize: '0.85rem' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>Symbol:</Typography>
                <Typography sx={{ fontFamily: 'monospace', fontWeight: 600, color: theme.palette.text.primary }}>{verifiedData.symbol}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>Side:</Typography>
                <Chip
                  label={verifiedData.side}
                  sx={{
                    background: verifiedData.side === 'BUY' ? '#dc2626' : '#16a34a',
                    color: 'white',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    px: 1,
                    borderRadius: 1,
                  }}
                />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>Type:</Typography>
                <Typography sx={{ fontWeight: 600, color: theme.palette.text.primary }}>{verifiedData.orderType}</Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>Quantity:</Typography>
                <Typography sx={{ fontWeight: 600, color: theme.palette.text.primary }}>{numberFmt(verifiedData.quantity)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>SL:</Typography>
                <Typography sx={{ fontFamily: 'monospace', fontWeight: 600, color: '#dc2626' }}>{numberFmt(verifiedData.stopLoss)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary }}>TP:</Typography>
                <Typography sx={{ fontFamily: 'monospace', fontWeight: 600, color: '#16a34a' }}>
                  {Array.isArray(verifiedData.takeProfit) ? verifiedData.takeProfit.map(numberFmt).join(', ') : numberFmt(verifiedData.takeProfit)}
                </Typography>
              </Box>
            </Box>
          </Box>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          <Box 
            sx={{ 
              background: '#fef2f2', 
              border: '1px solid #fecaca', 
              p: 2, 
              borderRadius: 2, 
              textAlign: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            }}
          >
            <Typography sx={{ color: '#dc2626', fontSize: '0.75rem', fontWeight: 600, mb: 0.5 }}>MAX LOSS</Typography>
            <Typography sx={{ color: '#dc2626', fontSize: '1rem', fontWeight: 600 }}>${numberFmt(Math.abs(verifiedData.maxLoss))}</Typography>
          </Box>
          <Box 
            sx={{ 
              background: '#f0fdf4', 
              border: '1px solid #bbf7d0', 
              p: 2, 
              borderRadius: 2, 
              textAlign: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            }}
          >
            <Typography sx={{ color: '#16a34a', fontSize: '0.75rem', fontWeight: 600, mb: 0.5 }}>MAX PROFIT</Typography>
            <Typography sx={{ color: '#16a34a', fontSize: '1rem', fontWeight: 600 }}>${numberFmt(verifiedData.maxProfit)}</Typography>
          </Box>
        </Box>
      </Box>
    ) : (
      <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, textAlign: 'center', color: theme.palette.text.primary, py: 2 }}>
        Verifying order...
      </Typography>
    )}
  </DialogContent>
  <DialogActions sx={{ pt: 1, pb: 2, px: 3, display: 'flex', gap: 2, justifyContent: 'center' }}>
    <Button
      onClick={handleCancelConfirmation}
      variant="outlined"
      sx={{ 
        flex: 1, 
        borderRadius: 2, 
        fontSize: '0.85rem', 
        fontWeight: 600, 
        textTransform: 'none', 
        py: 0.75,
        borderColor: theme.palette.mode === 'dark' ? '#4b5563' : '#d1d5db',
        color: theme.palette.text.primary,
        '&:hover': { 
          background: theme.palette.mode === 'dark' ? '#374151' : '#f3f4f6',
          borderColor: theme.palette.mode === 'dark' ? '#6b7280' : '#9ca3af',
        },
      }}
    >
      Cancel
    </Button>
    <Button
      onClick={handleConfirmOrder}
      variant="contained"
      sx={{
        flex: 1,
        borderRadius: 2,
        fontSize: '0.85rem',
        fontWeight: 600,
        textTransform: 'none',
        background: '#7ceba5',
        py: 0.75,
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        '&:hover': { 
          background: '#25e5e2',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        },
      }}
    >
      Confirm
    </Button>
  </DialogActions>
</Dialog>
      </Box>
      <ToastContainer position="top-right" autoClose={5000} />
    </>
  );
};

export default Dashboard;

/*
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  useTheme,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import { verifyToken, placeOrder, verifyOrder, initializeSocket, getUserAccounts, getAccountDetails } from '../api/api';
import Header from './Header';
import _ from 'lodash';
import { TrendingUp, TrendingDown, DollarSign, Settings, User, Building2 } from 'lucide-react';

interface Position {
  id: string;
  platform: string;
  type: 'BUY' | 'SELL' | 'LIMIT';
  symbol: string;
  brokerTime: string;
  openPrice: number;
  volume: number;
  brokerComment: string;
  stopLoss?: number;
  takeProfit?: number;
  liveProfit: number;
}

interface PendingOrder {
  id: string;
  type: string;
  symbol: string;
  time: string;
  currentVolume: number;
  brokerComment: string;
  stopLoss?: number;
  takeProfit?: number;
  openPrice?: number;
}

interface AccountInformation {
  platform: string;
  type: string;
  broker: string;
  currency: string;
  credit:number;
  server: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  leverage: number;
  marginLevel: number;
  marginMode: string;
  name: string;
  login: number;
}

interface Account {
  _id: string;
  brokerName: string;
  accountId: string;
  maxPositionLimit?: number;
}

interface AccountDetails extends Account {
  splittingTarget?: number;
  riskPercentage?: number;
  autoLotSizeSet?: boolean;
  dailyRiskPercentage?: number;
  remainingDailyRisk?: number;
  timezone?: string;
  location?: string;
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

const numberFmt = (n: number | undefined | null) =>
  typeof n === 'number' && !isNaN(n) ? n.toFixed(2) : 'undefined';

const stringFmt = (v: any) => (v != null ? String(v) : 'undefined');

const Dashboard: React.FC = () => {
  const theme = useTheme();
  const [error, setError] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedMetaApiAccountId, setSelectedMetaApiAccountId] = useState<string>('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountDetails, setAccountDetails] = useState<AccountDetails | null>(null);
  const [orderData, setOrderData] = useState({
    symbol: '',
    entryType: 'buy' as 'buy' | 'sell',
    lotSize: '',
    stopLoss: '',
    takeProfit: [] as string[],
    orderType: 'Market' as 'Market' | 'Stop' | 'Limit',
    comment: '',
    entryPrice: '',
  });
  const [positions, setPositions] = useState<Position[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [accountInformation, setAccountInformation] = useState<AccountInformation | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [verifiedData, setVerifiedData] = useState<VerifiedOrderData | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const checkToken = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('No token found, redirecting to login');
        navigate('/login');
        return;
      }
      try {
        await verifyToken();
        setError('');
        const accountsData = await getUserAccounts();
        setAccounts(accountsData);
        console.log('Accounts:', accountsData);
        if (accountsData.length > 0 && !selectedAccountId) {
          setSelectedAccountId(accountsData[0]._id);
          setSelectedMetaApiAccountId(accountsData[0].accountId);
        }
      } catch (err: any) {
        console.error('Token verification failed:', err, 'Response:', err.response?.data);
        localStorage.removeItem('token');
        setError('Session expired. Please log in again.');
        navigate('/login');
      }
    };
    checkToken();
  }, [navigate]);

  useEffect(() => {
    if (!selectedAccountId) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    const socket = initializeSocket(token, selectedAccountId);

    socket.on('connect', () => {
      console.log(`Socket.IO connected for account ${selectedAccountId}`);
    });

    socket.on('live-data', (data: { accountId: string; positionData: { livePositions: Position[], pendingOrders: PendingOrder[], accountInformation: AccountInformation } }) => {
      if (data.accountId !== selectedMetaApiAccountId) {
        console.log(`Ignoring live-data for account ${data.accountId}, expected ${selectedMetaApiAccountId}`);
        return;
      }
      if (data.positionData && Array.isArray(data.positionData.livePositions)) {
        setPositions(data.positionData.livePositions);
      }
      setPendingOrders(data.positionData.pendingOrders || []);
      setAccountInformation(data.positionData.accountInformation || null);
    });

    socket.on('order-response', (response: { message?: string; positionIds?: string[]; error?: string }) => {
      console.log(`[${new Date().toISOString()}] Order response in Dashboard:`, response);
      if (response.error) {
        setError(response.error);
        console.error('Order failed:', response.error);
      } else {
        setError('');
        setOrderData({ symbol: '', entryType: 'buy', lotSize: '', stopLoss: '', takeProfit: [], orderType: 'Market', comment: '', entryPrice: '' });
        console.log('Order placed successfully:', response);
      }
      setShowConfirmation(false);
    });

    socket.on('verify-order-response', (response: { data?: VerifiedOrderData; error?: string }) => {
      console.log(`[${new Date().toISOString()}] Verify order response in Dashboard:`, response);
      if (response.error) {
        setError(response.error);
        console.error('Verify order failed:', response.error);
      } else if (response.data) {
        setVerifiedData(response.data);
        setShowConfirmation(true);
        setError('');
      }
    });

    socket.on('equity-balance', (data: { accountId: string; equity: number; balance: number }) => {
      console.log(`[${new Date().toISOString()}] Equity/Balance:`, data);
      if (data.accountId === selectedMetaApiAccountId) {
        setAccountInformation(prev => ({
          ...prev,
          equity: data.equity,
          balance: data.balance,
        } as AccountInformation));
      } else {
        console.log(`Ignoring equity-balance for account ${data.accountId}, expected ${selectedMetaApiAccountId}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket.IO disconnected for account ${selectedAccountId}`);
    });

    return () => {
      socket.off('live-data');
      socket.off('order-response');
      socket.off('verify-order-response');
      socket.off('equity-balance');
      socket.off('connect');
      socket.off('disconnect');
      socket.disconnect();
    };
  }, [selectedAccountId, selectedMetaApiAccountId]);

  useEffect(() => {
    // Initialize takeProfit array based on splittingTarget
    if (accountDetails?.splittingTarget) {
      setOrderData((prev) => ({
        ...prev,
        takeProfit: Array(accountDetails.splittingTarget).fill(''),
      }));
    }
  }, [accountDetails?.splittingTarget]);

  const handleOrderChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent
  ) => {
    const { name, value } = e.target as HTMLInputElement;
    if (name.startsWith('takeProfit-')) {
      const index = parseInt(name.split('-')[1]);
      setOrderData((prev) => {
        const newTakeProfit = [...prev.takeProfit];
        newTakeProfit[index] = value;
        return { ...prev, takeProfit: newTakeProfit };
      });
    } else {
      setOrderData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleVerifyOrder = _.debounce(async () => {
    try {
      const takeProfit = orderData.takeProfit
        .map((val) => val.trim())
        .filter((val) => val !== '')
        .map(Number)
        .filter((n) => !isNaN(n));
      const data = {
        _id: selectedAccountId,
        symbol: orderData.symbol.trim().toUpperCase(),
        entryType: orderData.entryType,
        lotSize: orderData.lotSize ? Number(orderData.lotSize) : undefined,
        stopLoss: orderData.stopLoss ? Number(orderData.stopLoss) : undefined,
        takeProfit: takeProfit.length > 0 ? (takeProfit.length === 1 ? takeProfit[0] : takeProfit) : undefined,
        orderType: orderData.orderType,
        comment: orderData.comment.trim() || undefined,
        entryPrice: orderData.orderType !== 'Market' && orderData.entryPrice ? Number(orderData.entryPrice) : undefined,
      };

      console.log('Verifying order:', data);
      await verifyOrder(data);
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to verify order.';
      console.error(`[${new Date().toISOString()}] Verify order failed:`, err);
      setError(errorMessage);
    }
  }, 3500);

  const handleConfirmOrder = _.debounce(async () => {
    try {
      const takeProfit = orderData.takeProfit
        .map((val) => val.trim())
        .filter((val) => val !== '')
        .map(Number)
        .filter((n) => !isNaN(n));
      const data = {
        _id: selectedAccountId,
        symbol: orderData.symbol.trim().toUpperCase(),
        entryType: orderData.entryType,
        lotSize: orderData.lotSize ? Number(orderData.lotSize) : undefined,
        stopLoss: orderData.stopLoss ? Number(orderData.stopLoss) : undefined,
        takeProfit: takeProfit.length > 0 ? (takeProfit.length === 1 ? takeProfit[0] : takeProfit) : undefined,
        orderType: orderData.orderType,
        comment: orderData.comment.trim() || undefined,
        entryPrice: orderData.orderType !== 'Market' && orderData.entryPrice ? Number(orderData.entryPrice) : undefined,
      };

      console.log('Submitting order (validated):', data);
      const response = await placeOrder(data);
      if (response && typeof response === 'object' && !('error' in response && response.error)) {
        try {
          const updatedDetails = await getAccountDetails(selectedAccountId);
          setAccountDetails(updatedDetails);
          console.log('Updated account details:', updatedDetails);
        } catch (err: any) {
          console.error(`[${new Date().toISOString()}] Failed to fetch updated account details:`, err);
          setError('Failed to fetch updated account details.');
        }
      }
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to place order.';
      console.error(`[${new Date().toISOString()}] Place order failed:`, err);
      setError(errorMessage);
      setShowConfirmation(false);
    }
  }, 2500);

  const handleCancelConfirmation = () => {
    setShowConfirmation(false);
    setVerifiedData(null);
  };

  const handleAccountChange = async (accountId: string) => {
    setSelectedAccountId(accountId);
    const account = accounts.find((acc) => acc._id === accountId);
    setSelectedMetaApiAccountId(account ? account.accountId : '');
    console.log('Selected MongoDB _id:', accountId, 'MetaApi accountId:', account ? account.accountId : '');
    setPositions([]);
    setPendingOrders([]);
    setAccountInformation(null);
    setAccountDetails(null);
    try {
      const response = await getAccountDetails(accountId);
      setAccountDetails(response);
    } catch (err: any) {
      console.error(`[${new Date().toISOString()}] Failed to fetch account details:`, err);
      setError('Failed to fetch account details.');
    }
  };

  const isFormValid = () => {
    if (!selectedAccountId) return false;
    if (!orderData.symbol.trim()) return false;
    if (!orderData.lotSize || Number(orderData.lotSize) <= 0) return false;
    if ((orderData.orderType === 'Stop' || orderData.orderType === 'Limit') && (!orderData.entryPrice || Number(orderData.entryPrice) <= 0)) return false;
    return true;
  };

  return (
    <>
      <Header selectedAccountId={selectedAccountId} onAccountChange={handleAccountChange} />
      <Box
        sx={{
          minHeight: '100vh',
          background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #121212, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, #f8fafc, #e0f2fe, #e0e7ff)',
          p: 1,
        }}
      >
        <Box sx={{ maxWidth: '1200px', mx: 'auto' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr 1fr' }, gap: 1 }}>
            <Card
              sx={{
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, white, #f1f5f9)',
                transition: 'box-shadow 0.3s',
                '&:hover': { boxShadow: '0 4px 15px rgba(0,0,0,0.15)' },
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #2563eb, #4f46e5)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Building2 size={18} />
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>Platform Details</Typography>
                  </Box>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                {accountInformation ? (
                  <>

                  
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Platform:</Typography>
     <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{stringFmt(accountInformation.platform)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Type:</Typography>
                 <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
               {stringFmt(accountInformation.type).replace('ACCOUNT_TRADE_MODE_', '')}
                 </Typography>
                     
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Broker:</Typography>
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, maxWidth: '440px', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {stringFmt(accountInformation.broker)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Currency:</Typography>
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
              {stringFmt(accountInformation.leverage)}
                 </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>

                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Server:</Typography>
                      <Typography sx={{ fontSize: '0.65rem', fontWeight: 700 ,maxWidth: '440px',}}>
                        {stringFmt(accountInformation.server)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Name:</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <User size={14} color={theme.palette.text.secondary} />
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{stringFmt(accountInformation.name)}</Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Login:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{stringFmt(accountInformation.login)}</Typography>
                    </Box>
                  </>
                ) : (
                  <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700 }}>
                    No platform details available
                  </Typography>
                )}
              </CardContent>
            </Card>

            <Card
              sx={{
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, white, #f1f5f9)',
                transition: 'box-shadow 0.3s',
                '&:hover': { boxShadow: '0 4px 15px rgba(0,0,0,0.15)' },
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #2563eb, #4f46e5)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Settings size={18} />
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>Risk Settings</Typography>
                  </Box>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                {accountDetails ? (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Splitting Target:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{numberFmt(accountDetails.splittingTarget)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Max Position Limit:</Typography>
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{numberFmt(accountDetails.maxPositionLimit)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Risk Percentage:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{numberFmt(accountDetails.riskPercentage)}%</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Auto Lot Size:</Typography>
                      <Chip
                        label={accountDetails.autoLotSizeSet ? 'Enabled' : 'Disabled'}
                        sx={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          background: accountDetails.autoLotSizeSet ? '#16a34a' : '#dc2626',
                          color: 'white',
                        }}
                      />
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Daily Risk %:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{numberFmt(accountDetails.dailyRiskPercentage)}%</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Timezone:</Typography>
                      <Chip label={stringFmt(accountDetails.timezone)} sx={{ fontSize: '0.7rem', fontWeight: 700, background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe' }} />
                    </Box>
                  </>
                ) : (
                  <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700 }}>
                    No risk settings available
                  </Typography>
                )}
              </CardContent>
            </Card>

            <Card
              sx={{
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, white, #f1f5f9)',
                transition: 'box-shadow 0.3s',
                '&:hover': { boxShadow: '0 4px 15px rgba(0,0,0,0.15)' },
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #2563eb, #4f46e5)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <DollarSign size={18} />
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>Financial Info</Typography>
                  </Box>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                {accountInformation ? (
                  <>
                   <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Currency:</Typography>
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
              {stringFmt(accountInformation.currency)}
                 </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Balance:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>${numberFmt(accountInformation.balance)}</Typography>
                    </Box>
                     <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Equity:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>${numberFmt(accountInformation.equity)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Credit:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>${numberFmt(accountInformation.credit)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Margin:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>${numberFmt(accountInformation.margin)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Free Margin:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#1cb7efff' }}>${numberFmt(accountInformation.freeMargin)}</Typography>
                    </Box>
                  
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Daily Risk Left:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#f97316' }}>${numberFmt(accountDetails?.remainingDailyRisk)}</Typography>
                    </Box>
                  </>
                ) : (
                  <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700 }}>
                    No financial info available
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'row', gap: 1, mt: 1, flexWrap: 'nowrap', maxWidth: '1200px' }}>
            <Card
              sx={{
                flex: '0 0 75%',
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? '#1e293b' : 'white',
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #1e293b, #334155)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>
                    Live Positions & Pending Orders
                  </Typography>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                <Box sx={{ mb: 1 }}>
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, color: theme.palette.text.primary }}>
                    <TrendingUp size={18} color="#16a34a" />
                    Live Positions
                  </Typography>
                  {positions.length === 0 ? (
                    <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700, py: 0.5 }}>
                      No open positions
                    </Typography>
                  ) : (
                    <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                      <Table size="small" aria-label="positions table">
                        <TableHead sx={{ background: theme.palette.mode === 'dark' ? '#2d3748' : '#f1f5f9' }}>
                          <TableRow>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Symbol</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Type</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Volume</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Timing</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Open Price</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Stop Loss</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Take Profit</TableCell>
                               <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Comment</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>PL</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {positions.map((position) => {
                            const isProfit = position.liveProfit >= 0;
                            return (
                              <TableRow key={position.id} hover sx={{ '&:hover': { background: theme.palette.mode === 'dark' ? '#374151' : '#f8fafc' } }}>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{position.symbol}</TableCell>
                                <TableCell>
                                  <Chip
                                    label={position.type}
                                    sx={{
                                      background: position.type === 'BUY' ? '#16a34a' : '#dc2626',
                                      color: 'white',
                                      fontSize: '0.7rem',
                                      fontWeight: 700,
                                    }}
                                  />
                                </TableCell>
                                <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(position.volume)}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{position.brokerTime}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(position.openPrice)}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{numberFmt(position.stopLoss)}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>{numberFmt(position.takeProfit)}</TableCell>
                                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{position.brokerComment}</TableCell>
            
                                <TableCell align="right">
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: isProfit ? '#16a34a' : '#dc2626', fontWeight: 700, fontSize: '0.75rem' }}>
                                    {isProfit ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                    ${numberFmt(position.liveProfit)}
                                  </Box>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, color: theme.palette.text.primary }}>
                    <TrendingUp size={18} color="#f97316" />
                    Pending Orders
                  </Typography>
                  {pendingOrders.length === 0 ? (
                    <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700, py: 0.5 }}>
                      No pending orders
                    </Typography>
                  ) : (
                    <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                      <Table size="small" aria-label="pending orders table">
                        <TableHead sx={{ background: theme.palette.mode === 'dark' ? '#2d3748' : '#f1f5f9' }}>
                          <TableRow>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Symbol</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Type</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Volume</TableCell>
                                 <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Timing</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Open Price</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Stop Loss</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Take Profit</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Comment</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {pendingOrders.map((order) => (
                            <TableRow key={order.id} hover sx={{ '&:hover': { background: theme.palette.mode === 'dark' ? '#374151' : '#f8fafc' } }}>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{order.symbol}</TableCell>
                              <TableCell>
                                <Chip label={order.type} sx={{ background: '#fef3c7', color: '#c2410c', border: '1px solid #fed7aa', fontSize: '0.7rem', fontWeight: 700 }} />
                              </TableCell>
                              <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(order.currentVolume)}</TableCell>
                                    <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{(order.time)}</TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(order.openPrice)}</TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{numberFmt(order.stopLoss)}</TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>{numberFmt(order.takeProfit)}</TableCell>
                              <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>{stringFmt(order.brokerComment)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
              </CardContent>
            </Card>

            <Card
              sx={{
                flex: '0 0 25%',
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: orderData.entryType === 'buy' ? '#bbf7d0' : '#fecaca',
              }}
            >
              <CardHeader
                sx={{
                  background: orderData.entryType === 'buy' ? '#bbf7d0' : '#fecaca',
                  color: '#000000',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>
                    Place Order
                  </Typography>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important', background: orderData.entryType === 'buy' ? '#bbf7d0' : '#fecaca' }}>
                {error && (
                  <Alert severity="error" sx={{ mb: 0.5, borderRadius: 2, fontSize: '0.75rem', background: '#fef2f2', color: '#dc2626' }}>
                    {error}
                  </Alert>
                )}
                <Box component="form" noValidate autoComplete="off" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5, background: theme.palette.mode === 'dark' ? '#2d3748' : '#f1f5f9', p: 0.5, borderRadius: 2 }}>
                    <Button
                      onClick={() => setOrderData((prev) => ({ ...prev, entryType: 'buy' }))}
                      sx={{
                        width: '100%',
                        borderRadius: 1,
                        py: 0.5,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        transition: 'all 0.2s',
                        background: orderData.entryType === 'buy' ? '#16a34a' : 'transparent',
                        color: orderData.entryType === 'buy' ? 'white' : theme.palette.text.secondary,
                        '&:hover': { background: orderData.entryType === 'buy' ? '#15803d' : theme.palette.mode === 'dark' ? '#374151' : '#e2e8f0' },
                      }}
                    >
                      BUY
                    </Button>
                    <Button
                      onClick={() => setOrderData((prev) => ({ ...prev, entryType: 'sell' }))}
                      sx={{
                        width: '100%',
                        borderRadius: 1,
                        py: 0.5,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        transition: 'all 0.2s',
                        background: orderData.entryType === 'sell' ? '#dc2626' : 'transparent',
                        color: orderData.entryType === 'sell' ? 'white' : theme.palette.text.secondary,
                        '&:hover': { background: orderData.entryType === 'sell' ? '#b91c1c' : theme.palette.mode === 'dark' ? '#374151' : '#e2e8f0' },
                      }}
                    >
                      SELL
                    </Button>
                  </Box>
                  <TextField
                    fullWidth
                    label="Symbol (e.g., EURUSD)"
                    name="symbol"
                    variant="outlined"
                    value={orderData.symbol}
                    onChange={handleOrderChange}
                    sx={{
                      '& .MuiOutlinedInput-root': { borderRadius: 2, fontFamily: 'monospace', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1, fontSize: '0.75rem', background: '#ffffff', color: '#000000' },
                      '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#000000' },
                      '& .MuiInputBase-input': { fontSize: '0.75rem' },
                      '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                      '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                    }}
                  />
                  <FormControl fullWidth>
                    <InputLabel sx={{ fontSize: '0.75rem', color: '#000000' }}>Order Type</InputLabel>
                    <Select
                      name="orderType"
                      value={orderData.orderType}
                      onChange={handleOrderChange}
                      label="Order Type"
                      sx={{
                        borderRadius: 2,
                        '& .MuiSelect-select': { fontSize: '0.75rem', background: '#ffffff', color: '#000000' },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                      }}
                    >
                      <MenuItem value="Market" sx={{ fontSize: '0.75rem' }}>Market</MenuItem>
                      <MenuItem value="Stop" sx={{ fontSize: '0.75rem' }}>Stop</MenuItem>
                      <MenuItem value="Limit" sx={{ fontSize: '0.75rem' }}>Limit</MenuItem>
                    </Select>
                  </FormControl>
                  {(orderData.orderType === 'Stop' || orderData.orderType === 'Limit') && (
                    <TextField
                      fullWidth
                      label="Entry Price"
                      name="entryPrice"
                      type="number"
                      variant="outlined"
                      value={orderData.entryPrice}
                      onChange={handleOrderChange}
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontFamily: 'monospace', fontSize: '0.75rem', background: '#ffffff', color: '#000000' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#000000' },
                        '& .MuiInputBase-input': { fontSize: '0.75rem' },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                        '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                      }}
                      inputProps={{ step: '0.00001', inputMode: 'decimal' }}
                    />
                  )}
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
                    <TextField
                      fullWidth
                      label="Lot Size"
                      name="lotSize"
                      type="number"
                      variant="outlined"
                      value={orderData.lotSize}
                      onChange={handleOrderChange}
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontSize: '0.75rem', background: '#ffffff', color: '#000000' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#000000' },
                        '& .MuiInputBase-input': { fontSize: '0.75rem' },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                        '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                      }}
                      inputProps={{ step: '0.01', inputMode: 'decimal' }}
                    />
                    <TextField
                      fullWidth
                      label="Stop Loss"
                      name="stopLoss"
                      type="number"
                      variant="outlined"
                      value={orderData.stopLoss}
                      onChange={handleOrderChange}
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontFamily: 'monospace', background: '#ffffff', fontSize: '0.75rem' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#dc2626' },
                        '& .MuiInputBase-input': { fontSize: '0.75rem', color: '#000000' },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                        '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                      }}
                      inputProps={{ step: '0.00001', inputMode: 'decimal' }}
                    />
                    {accountDetails?.splittingTarget && Array.from({ length: accountDetails.splittingTarget }, (_, index) => (
                      <TextField
                        key={`takeProfit-${index}`}
                        fullWidth
                        label={`Target ${index + 1}`}
                        name={`takeProfit-${index}`}
                        type="text"
                        variant="outlined"
                        value={orderData.takeProfit[index] || ''}
                        onChange={handleOrderChange}
                        sx={{
                          '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontFamily: 'monospace', background: '#ffffff', fontSize: '0.75rem' },
                          '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#16a34a' },
                          '& .MuiInputBase-input': { fontSize: '0.75rem', color: '#000000' },
                          '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                          '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                        }}
                        inputProps={{ inputMode: 'decimal' }}
                      />
                    ))}
                    <TextField
                      fullWidth
                      label="Comment (optional)"
                      name="comment"
                      variant="outlined"
                      value={orderData.comment}
                      onChange={handleOrderChange}
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '0.75rem', background: '#ffffff', color: '#000000' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#000000' },
                        '& .MuiInputBase-input': { fontSize: '0.75rem' },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                        '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#e2e8f0' },
                      }}
                    />
                  </Box>
                  <Button
                    fullWidth
                    variant="contained"
                    onClick={handleVerifyOrder}
                    disabled={!isFormValid()}
                    sx={{
                      py: 0.75,
                      borderRadius: 2,
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      textTransform: 'none',
                      background: orderData.entryType === 'buy' ? '#16a34a' : '#dc2626',
                      boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
                      '&:hover': {
                        background: orderData.entryType === 'buy' ? '#15803d' : '#b91c1c',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.25)',
                      },
                    }}
                  >
                    Place {orderData.entryType.toUpperCase()} Order
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Box>

        <Dialog open={showConfirmation} onClose={handleCancelConfirmation}>
          <DialogTitle sx={{ fontSize: '1.1rem', fontWeight: 700, textAlign: 'center', mb: 1, color: theme.palette.text.primary }}>
            Confirm Order
          </DialogTitle>
          <DialogContent sx={{ maxWidth: '600px', p: 1 }}>
            {verifiedData ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ background: theme.palette.mode === 'dark' ? '#2d3748' : '#f1f5f9', p: 1, borderRadius: 2 }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, fontSize: '0.75rem' }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontWeight: 700, color: theme.palette.text.secondary }}>Symbol:</Typography>
                        <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, color: theme.palette.text.primary }}>{verifiedData.symbol}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontWeight: 700, color: theme.palette.text.secondary }}>Side:</Typography>
                        <Chip
                          label={verifiedData.side}
                          sx={{
                            background: verifiedData.side === 'BUY' ?  '#dc2626':'#16a34a' ,
                            color: 'white',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                          }}
                        />
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontWeight: 700, color: theme.palette.text.secondary }}>Type:</Typography>
                        <Typography sx={{ fontWeight: 700, color: theme.palette.text.primary }}>{verifiedData.orderType}</Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontWeight: 700, color: theme.palette.text.secondary }}>Quantity:</Typography>
                        <Typography sx={{ fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(verifiedData.quantity)}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontWeight: 700, color: theme.palette.text.secondary }}>SL:</Typography>
                        <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#dc2626' }}>{numberFmt(verifiedData.stopLoss)}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontWeight: 700, color: theme.palette.text.secondary }}>TP:</Typography>
                        <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#16a34a' }}>
                          {Array.isArray(verifiedData.takeProfit) ? verifiedData.takeProfit.map(numberFmt).join(', ') : numberFmt(verifiedData.takeProfit)}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                  <Box sx={{ background: '#fef2f2', border: '1px solid #fecaca', p: 1, borderRadius: 2, textAlign: 'center' }}>
                    <Typography sx={{ color: '#dc2626', fontSize: '0.65rem', fontWeight: 700 }}>MAX LOSS</Typography>
                    <Typography sx={{ color: '#dc2626', fontSize: '0.9rem', fontWeight: 700 }}>${numberFmt(Math.abs(verifiedData.maxLoss))}</Typography>
                  </Box>
                  <Box sx={{ background: '#f0fdf4', border: '1px solid #bbf7d0', p: 1, borderRadius: 2, textAlign: 'center' }}>
                    <Typography sx={{ color: '#16a34a', fontSize: '0.65rem', fontWeight: 700 }}>MAX PROFIT</Typography>
                    <Typography sx={{ color: '#16a34a', fontSize: '0.9rem', fontWeight: 700 }}>${numberFmt(verifiedData.maxProfit)}</Typography>
                  </Box>
                </Box>
              </Box>
            ) : (
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, textAlign: 'center', color: theme.palette.text.primary }}>Verifying order...</Typography>
            )}
          </DialogContent>
          <DialogActions sx={{ pt: 1, display: 'flex', gap: 1 }}>
            <Button
              onClick={handleCancelConfirmation}
              variant="outlined"
              sx={{ flex: 1, borderRadius: 2, fontSize: '0.75rem', fontWeight: 700, textTransform: 'none', py: 0.5 }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmOrder}
              variant="contained"
              sx={{
                flex: 1,
                borderRadius: 2,
                fontSize: '0.75rem',
                fontWeight: 700,
                textTransform: 'none',
                background: '#16a34a',
                py: 0.5,
                '&:hover': { background: '#15803d' },
              }}
            >
              Confirm
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </>
  );
};

export default Dashboard;

/*
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  useTheme,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import { verifyToken, placeOrder, verifyOrder, initializeSocket, getUserAccounts, getAccountDetails } from '../api/api';
import Header from './Header';
import _ from 'lodash';
import { TrendingUp, TrendingDown, DollarSign, Settings, User, Building2 } from 'lucide-react';

interface Position {
  id: string;
  platform: string;
  type: 'BUY' | 'SELL' | 'LIMIT';
  symbol: string;
  brokerTime: string;
  openPrice: number;
  volume: number;
  brokerComment: string;
  stopLoss?: number;
  takeProfit?: number;
  liveProfit: number;
}

interface PendingOrder {
  id: string;
  type: string;
  symbol: string;
  time: string;
  currentVolume: number;
  brokerComment: string;
  stopLoss?: number;
  takeProfit?: number;
  openPrice?: number;
}

interface AccountInformation {
  platform: string;
  type: string;
  broker: string;
  currency: string;
  server: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  leverage: number;
  marginLevel: number;
  marginMode: string;
  name: string;
  login: number;
}

interface Account {
  _id: string;
  brokerName: string;
  accountId: string;
  maxPositionLimit?: number;
}

interface AccountDetails extends Account {
  splittingTarget?: number;
  riskPercentage?: number;
  autoLotSizeSet?: boolean;
  dailyRiskPercentage?: number;
  remainingDailyRisk?: number;
  timezone?: string;
  location?: string;
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

const numberFmt = (n: number | undefined | null) =>
  typeof n === 'number' && !isNaN(n) ? n.toFixed(2) : 'undefined';

const stringFmt = (v: any) => (v != null ? String(v) : 'undefined');

const Dashboard: React.FC = () => {
  const theme = useTheme();
  const [error, setError] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedMetaApiAccountId, setSelectedMetaApiAccountId] = useState<string>('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountDetails, setAccountDetails] = useState<AccountDetails | null>(null);
  const [orderData, setOrderData] = useState({
    symbol: '',
    entryType: 'buy' as 'buy' | 'sell',
    lotSize: '',
    stopLoss: '',
    takeProfit: [] as string[],
    orderType: 'Market' as 'Market' | 'Stop' | 'Limit',
    comment: '',
    entryPrice: '',
  });
  const [positions, setPositions] = useState<Position[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [accountInformation, setAccountInformation] = useState<AccountInformation | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [verifiedData, setVerifiedData] = useState<VerifiedOrderData | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const checkToken = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('No token found, redirecting to login');
        navigate('/login');
        return;
      }
      try {
        await verifyToken();
        setError('');
        const accountsData = await getUserAccounts();
        setAccounts(accountsData);
        console.log('Accounts:', accountsData);
        if (accountsData.length > 0 && !selectedAccountId) {
          setSelectedAccountId(accountsData[0]._id);
          setSelectedMetaApiAccountId(accountsData[0].accountId);
        }
      } catch (err: any) {
        console.error('Token verification failed:', err, 'Response:', err.response?.data);
        localStorage.removeItem('token');
        setError('Session expired. Please log in again.');
        navigate('/login');
      }
    };
    checkToken();
  }, [navigate]);

  useEffect(() => {
    if (!selectedAccountId) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    const socket = initializeSocket(token, selectedAccountId);

    socket.on('connect', () => {
      console.log(`Socket.IO connected for account ${selectedAccountId}`);
    });

    socket.on('live-data', (data: { accountId: string; positionData: { livePositions: Position[], pendingOrders: PendingOrder[], accountInformation: AccountInformation } }) => {
      if (data.accountId !== selectedMetaApiAccountId) {
        console.log(`Ignoring live-data for account ${data.accountId}, expected ${selectedMetaApiAccountId}`);
        return;
      }
      if (data.positionData && Array.isArray(data.positionData.livePositions)) {
        setPositions(data.positionData.livePositions);
      }
      setPendingOrders(data.positionData.pendingOrders || []);
      setAccountInformation(data.positionData.accountInformation || null);
    });

    socket.on('order-response', (response: { message?: string; positionIds?: string[]; error?: string }) => {
      console.log(`[${new Date().toISOString()}] Order response in Dashboard:`, response);
      if (response.error) {
        setError(response.error);
        console.error('Order failed:', response.error);
      } else {
        setError('');
        setOrderData({ symbol: '', entryType: 'buy', lotSize: '', stopLoss: '', takeProfit: [], orderType: 'Market', comment: '', entryPrice: '' });
        console.log('Order placed successfully:', response);
      }
      setShowConfirmation(false);
    });

    socket.on('verify-order-response', (response: { data?: VerifiedOrderData; error?: string }) => {
      console.log(`[${new Date().toISOString()}] Verify order response in Dashboard:`, response);
      if (response.error) {
        setError(response.error);
        console.error('Verify order failed:', response.error);
      } else if (response.data) {
        setVerifiedData(response.data);
        setShowConfirmation(true);
        setError('');
      }
    });

    socket.on('equity-balance', (data: { accountId: string; equity: number; balance: number }) => {
      console.log(`[${new Date().toISOString()}] Equity/Balance:`, data);
      if (data.accountId === selectedMetaApiAccountId) {
        setAccountInformation(prev => ({
          ...prev,
          equity: data.equity,
          balance: data.balance,
        } as AccountInformation));
      } else {
        console.log(`Ignoring equity-balance for account ${data.accountId}, expected ${selectedMetaApiAccountId}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket.IO disconnected for account ${selectedAccountId}`);
    });

    return () => {
      socket.off('live-data');
      socket.off('order-response');
      socket.off('verify-order-response');
      socket.off('equity-balance');
      socket.off('connect');
      socket.off('disconnect');
      socket.disconnect();
    };
  }, [selectedAccountId, selectedMetaApiAccountId]);

  useEffect(() => {
    // Initialize takeProfit array based on splittingTarget
    if (accountDetails?.splittingTarget) {
      setOrderData((prev) => ({
        ...prev,
        takeProfit: Array(accountDetails.splittingTarget).fill(''),
      }));
    }
  }, [accountDetails?.splittingTarget]);

  const handleOrderChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent
  ) => {
    const { name, value } = e.target as HTMLInputElement;
    if (name.startsWith('takeProfit-')) {
      const index = parseInt(name.split('-')[1]);
      setOrderData((prev) => {
        const newTakeProfit = [...prev.takeProfit];
        newTakeProfit[index] = value;
        return { ...prev, takeProfit: newTakeProfit };
      });
    } else {
      setOrderData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleVerifyOrder = _.debounce(async () => {
    try {
      const takeProfit = orderData.takeProfit
        .map((val) => val.trim())
        .filter((val) => val !== '')
        .map(Number)
        .filter((n) => !isNaN(n));
      const data = {
        _id: selectedAccountId,
        symbol: orderData.symbol.trim().toUpperCase(),
        entryType: orderData.entryType,
        lotSize: orderData.lotSize ? Number(orderData.lotSize) : undefined,
        stopLoss: orderData.stopLoss ? Number(orderData.stopLoss) : undefined,
        takeProfit: takeProfit.length > 0 ? (takeProfit.length === 1 ? takeProfit[0] : takeProfit) : undefined,
        orderType: orderData.orderType,
        comment: orderData.comment.trim() || undefined,
        entryPrice: orderData.orderType !== 'Market' && orderData.entryPrice ? Number(orderData.entryPrice) : undefined,
      };

      console.log('Verifying order:', data);
      await verifyOrder(data);
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to verify order.';
      console.error(`[${new Date().toISOString()}] Verify order failed:`, err);
      setError(errorMessage);
    }
  }, 3500);

  const handleConfirmOrder = _.debounce(async () => {
    try {
      const takeProfit = orderData.takeProfit
        .map((val) => val.trim())
        .filter((val) => val !== '')
        .map(Number)
        .filter((n) => !isNaN(n));
      const data = {
        _id: selectedAccountId,
        symbol: orderData.symbol.trim().toUpperCase(),
        entryType: orderData.entryType,
        lotSize: orderData.lotSize ? Number(orderData.lotSize) : undefined,
        stopLoss: orderData.stopLoss ? Number(orderData.stopLoss) : undefined,
        takeProfit: takeProfit.length > 0 ? (takeProfit.length === 1 ? takeProfit[0] : takeProfit) : undefined,
        orderType: orderData.orderType,
        comment: orderData.comment.trim() || undefined,
        entryPrice: orderData.orderType !== 'Market' && orderData.entryPrice ? Number(orderData.entryPrice) : undefined,
      };

      console.log('Submitting order (validated):', data);
      const response = await placeOrder(data);
      if (response && typeof response === 'object' && !('error' in response && response.error)) {
        try {
          const updatedDetails = await getAccountDetails(selectedAccountId);
          setAccountDetails(updatedDetails);
          console.log('Updated account details:', updatedDetails);
        } catch (err: any) {
          console.error(`[${new Date().toISOString()}] Failed to fetch updated account details:`, err);
          setError('Failed to fetch updated account details.');
        }
      }
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to place order.';
      console.error(`[${new Date().toISOString()}] Place order failed:`, err);
      setError(errorMessage);
      setShowConfirmation(false);
    }
  }, 2500);

  const handleCancelConfirmation = () => {
    setShowConfirmation(false);
    setVerifiedData(null);
  };

  const handleAccountChange = async (accountId: string) => {
    setSelectedAccountId(accountId);
    const account = accounts.find((acc) => acc._id === accountId);
    setSelectedMetaApiAccountId(account ? account.accountId : '');
    console.log('Selected MongoDB _id:', accountId, 'MetaApi accountId:', account ? account.accountId : '');
    setPositions([]);
    setPendingOrders([]);
    setAccountInformation(null);
    setAccountDetails(null);
    try {
      const response = await getAccountDetails(accountId);
      setAccountDetails(response);
    } catch (err: any) {
      console.error(`[${new Date().toISOString()}] Failed to fetch account details:`, err);
      setError('Failed to fetch account details.');
    }
  };

  const isFormValid = () => {
    if (!selectedAccountId) return false;
    if (!orderData.symbol.trim()) return false;
    if (!orderData.lotSize || Number(orderData.lotSize) <= 0) return false;
    if ((orderData.orderType === 'Stop' || orderData.orderType === 'Limit') && (!orderData.entryPrice || Number(orderData.entryPrice) <= 0)) return false;
    return true;
  };

  return (
    <>
      <Header selectedAccountId={selectedAccountId} onAccountChange={handleAccountChange} />
      <Box
        sx={{
          minHeight: '100vh',
          background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #121212, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, #f8fafc, #e0f2fe, #e0e7ff)',
          p: 1,
        }}
      >
        <Box sx={{ maxWidth: '1200px', mx: 'auto' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr 1fr' }, gap: 1 }}>
            <Card
              sx={{
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, white, #f1f5f9)',
                transition: 'box-shadow 0.3s',
                '&:hover': { boxShadow: '0 4px 15px rgba(0,0,0,0.15)' },
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #2563eb, #4f46e5)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Building2 size={18} />
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>Platform Details</Typography>
                  </Box>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                {accountInformation ? (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Platform:</Typography>
                      <Chip label={stringFmt(accountInformation.platform)} sx={{ fontSize: '0.7rem', fontWeight: 700, background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe' }} />
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Type:</Typography>
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, background: '#f1f5f9', px: 0.5, py: 0.25, borderRadius: 1 }}>
                        {stringFmt(accountInformation.type).replace('ACCOUNT_TRADE_MODE_', '')}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Broker:</Typography>
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, maxWidth: '150px', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {stringFmt(accountInformation.broker)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Currency:</Typography>
                      <Chip label={stringFmt(accountInformation.currency)} sx={{ fontSize: '0.7rem', fontWeight: 700, background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0' }} />
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Server:</Typography>
                      <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, background: '#f1f5f9', px: 0.5, py: 0.25, borderRadius: 1, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {stringFmt(accountInformation.server)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Name:</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <User size={14} color={theme.palette.text.secondary} />
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{stringFmt(accountInformation.name)}</Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Login:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{stringFmt(accountInformation.login)}</Typography>
                    </Box>
                  </>
                ) : (
                  <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700 }}>
                    No platform details available
                  </Typography>
                )}
              </CardContent>
            </Card>

            <Card
              sx={{
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, white, #f1f5f9)',
                transition: 'box-shadow 0.3s',
                '&:hover': { boxShadow: '0 4px 15px rgba(0,0,0,0.15)' },
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #2563eb, #4f46e5)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Settings size={18} />
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>Risk Settings</Typography>
                  </Box>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                {accountDetails ? (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Splitting Target:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{numberFmt(accountDetails.splittingTarget)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Max Position Limit:</Typography>
                      <Chip label={numberFmt(accountDetails.maxPositionLimit)} sx={{ fontSize: '0.7rem', fontWeight: 700, background: '#ffedd5', color: '#c2410c', border: '1px solid #fed7aa' }} />
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Risk Percentage:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{numberFmt(accountDetails.riskPercentage)}%</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Auto Lot Size:</Typography>
                      <Chip
                        label={accountDetails.autoLotSizeSet ? 'Enabled' : 'Disabled'}
                        sx={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          background: accountDetails.autoLotSizeSet ? '#16a34a' : '#dc2626',
                          color: 'white',
                        }}
                      />
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Daily Risk %:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{numberFmt(accountDetails.dailyRiskPercentage)}%</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Timezone:</Typography>
                      <Chip label={stringFmt(accountDetails.timezone)} sx={{ fontSize: '0.7rem', fontWeight: 700, background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe' }} />
                    </Box>
                  </>
                ) : (
                  <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700 }}>
                    No risk settings available
                  </Typography>
                )}
              </CardContent>
            </Card>

            <Card
              sx={{
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, white, #f1f5f9)',
                transition: 'box-shadow 0.3s',
                '&:hover': { boxShadow: '0 4px 15px rgba(0,0,0,0.15)' },
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #2563eb, #4f46e5)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <DollarSign size={18} />
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>Financial Info</Typography>
                  </Box>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                {accountInformation ? (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Balance:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>${numberFmt(accountInformation.balance)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Equity:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>${numberFmt(accountInformation.equity)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Margin:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>${numberFmt(accountInformation.margin)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Free Margin:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#1e40af' }}>${numberFmt(accountInformation.freeMargin)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Leverage:</Typography>
                      <Chip label={`1:${stringFmt(accountInformation.leverage)}`} sx={{ fontSize: '0.7rem', fontWeight: 700, background: '#f3e8ff', color: '#6b21a8', border: '1px solid #d8b4fe' }} />
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Daily Risk Left:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#f97316' }}>${numberFmt(accountDetails?.remainingDailyRisk)}</Typography>
                    </Box>
                  </>
                ) : (
                  <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700 }}>
                    No financial info available
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'row', gap: 1, mt: 1, flexWrap: 'nowrap', maxWidth: '1200px' }}>
            <Card
              sx={{
                flex: '0 0 75%',
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? '#1e293b' : 'white',
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #1e293b, #334155)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>
                    Live Positions & Pending Orders
                  </Typography>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                <Box sx={{ mb: 1 }}>
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, color: theme.palette.text.primary }}>
                    <TrendingUp size={18} color="#16a34a" />
                    Live Positions
                  </Typography>
                  {positions.length === 0 ? (
                    <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700, py: 0.5 }}>
                      No open positions
                    </Typography>
                  ) : (
                    <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                      <Table size="small" aria-label="positions table">
                        <TableHead sx={{ background: theme.palette.mode === 'dark' ? '#2d3748' : '#f1f5f9' }}>
                          <TableRow>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Symbol</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Type</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Volume</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Open Price</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Stop Loss</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Take Profit</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>P/L</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {positions.map((position) => {
                            const isProfit = position.liveProfit >= 0;
                            return (
                              <TableRow key={position.id} hover sx={{ '&:hover': { background: theme.palette.mode === 'dark' ? '#374151' : '#f8fafc' } }}>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{position.symbol}</TableCell>
                                <TableCell>
                                  <Chip
                                    label={position.type}
                                    sx={{
                                      background: position.type === 'BUY' ? '#16a34a' : '#dc2626',
                                      color: 'white',
                                      fontSize: '0.7rem',
                                      fontWeight: 700,
                                    }}
                                  />
                                </TableCell>
                                <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(position.volume)}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(position.openPrice)}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{numberFmt(position.stopLoss)}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>{numberFmt(position.takeProfit)}</TableCell>
                                <TableCell align="right">
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: isProfit ? '#16a34a' : '#dc2626', fontWeight: 700, fontSize: '0.75rem' }}>
                                    {isProfit ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                    ${numberFmt(position.liveProfit)}
                                  </Box>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, color: theme.palette.text.primary }}>
                    <TrendingUp size={18} color="#f97316" />
                    Pending Orders
                  </Typography>
                  {pendingOrders.length === 0 ? (
                    <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700, py: 0.5 }}>
                      No pending orders
                    </Typography>
                  ) : (
                    <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                      <Table size="small" aria-label="pending orders table">
                        <TableHead sx={{ background: theme.palette.mode === 'dark' ? '#2d3748' : '#f1f5f9' }}>
                          <TableRow>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Symbol</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Type</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Volume</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Open Price</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Stop Loss</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Take Profit</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Comment</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {pendingOrders.map((order) => (
                            <TableRow key={order.id} hover sx={{ '&:hover': { background: theme.palette.mode === 'dark' ? '#374151' : '#f8fafc' } }}>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{order.symbol}</TableCell>
                              <TableCell>
                                <Chip label={order.type} sx={{ background: '#fef3c7', color: '#c2410c', border: '1px solid #fed7aa', fontSize: '0.7rem', fontWeight: 700 }} />
                              </TableCell>
                              <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(order.currentVolume)}</TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(order.openPrice)}</TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{numberFmt(order.stopLoss)}</TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>{numberFmt(order.takeProfit)}</TableCell>
                              <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>{stringFmt(order.brokerComment)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
              </CardContent>
            </Card>

            <Card
              sx={{
                flex: '0 0 25%',
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? '#1e293b' : 'white',
              }}
            >
              <CardHeader
                sx={{
                  background: orderData.entryType === 'buy'
                    ? 'linear-gradient(to right, #16a34a, #059669)'
                    : 'linear-gradient(to right, #dc2626, #e11d48)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>
                    Place Order
                  </Typography>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important', background: orderData.entryType === 'buy' ? '#16a34a' : '#dc2626' }}>
                {error && (
                  <Alert severity="error" sx={{ mb: 0.5, borderRadius: 2, fontSize: '0.75rem', background: '#fef2f2', color: '#dc2626' }}>
                    {error}
                  </Alert>
                )}
                <Box component="form" noValidate autoComplete="off" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5, background: theme.palette.mode === 'dark' ? '#2d3748' : '#f1f5f9', p: 0.5, borderRadius: 2 }}>
                    <Button
                      onClick={() => setOrderData((prev) => ({ ...prev, entryType: 'buy' }))}
                      sx={{
                        width: '100%',
                        borderRadius: 1,
                        py: 0.5,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        transition: 'all 0.2s',
                        background: orderData.entryType === 'buy' ? '#16a34a' : 'transparent',
                        color: orderData.entryType === 'buy' ? 'white' : theme.palette.text.secondary,
                        '&:hover': { background: orderData.entryType === 'buy' ? '#15803d' : theme.palette.mode === 'dark' ? '#374151' : '#e2e8f0' },
                      }}
                    >
                      BUY
                    </Button>
                    <Button
                      onClick={() => setOrderData((prev) => ({ ...prev, entryType: 'sell' }))}
                      sx={{
                        width: '100%',
                        borderRadius: 1,
                        py: 0.5,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        transition: 'all 0.2s',
                        background: orderData.entryType === 'sell' ? '#dc2626' : 'transparent',
                        color: orderData.entryType === 'sell' ? 'white' : theme.palette.text.secondary,
                        '&:hover': { background: orderData.entryType === 'sell' ? '#b91c1c' : theme.palette.mode === 'dark' ? '#374151' : '#e2e8f0' },
                      }}
                    >
                      SELL
                    </Button>
                  </Box>
                  <TextField
                    fullWidth
                    label="Symbol (e.g., EURUSD)"
                    name="symbol"
                    variant="outlined"
                    value={orderData.symbol}
                    onChange={handleOrderChange}
                    sx={{
                      '& .MuiOutlinedInput-root': { borderRadius: 2, fontFamily: 'monospace', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1, fontSize: '0.75rem', background: '#fff', color: '#000' },
                      '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#fff' },
                      '& .MuiInputBase-input': { fontSize: '0.75rem' },
                      '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#fff' },
                    }}
                  />
                  <FormControl fullWidth>
                    <InputLabel sx={{ fontSize: '0.75rem', color: '#fff' }}>Order Type</InputLabel>
                    <Select
                      name="orderType"
                      value={orderData.orderType}
                      onChange={handleOrderChange}
                      label="Order Type"
                      sx={{
                        borderRadius: 2,
                        '& .MuiSelect-select': { fontSize: '0.75rem', background: '#fff', color: '#000' },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#fff' },
                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#fff' },
                      }}
                    >
                      <MenuItem value="Market" sx={{ fontSize: '0.75rem' }}>Market</MenuItem>
                      <MenuItem value="Stop" sx={{ fontSize: '0.75rem' }}>Stop</MenuItem>
                      <MenuItem value="Limit" sx={{ fontSize: '0.75rem' }}>Limit</MenuItem>
                    </Select>
                  </FormControl>
                  {(orderData.orderType === 'Stop' || orderData.orderType === 'Limit') && (
                    <TextField
                      fullWidth
                      label="Entry Price"
                      name="entryPrice"
                      type="number"
                      variant="outlined"
                      value={orderData.entryPrice}
                      onChange={handleOrderChange}
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontFamily: 'monospace', fontSize: '0.75rem', background: '#fff', color: '#000' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#fff' },
                        '& .MuiInputBase-input': { fontSize: '0.75rem' },
                        '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#fff' },
                      }}
                      inputProps={{ step: '0.00001', inputMode: 'decimal' }}
                    />
                  )}
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
                    <TextField
                      fullWidth
                      label="Lot Size"
                      name="lotSize"
                      type="number"
                      variant="outlined"
                      value={orderData.lotSize}
                      onChange={handleOrderChange}
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontSize: '0.75rem', background: '#fff', color: '#000' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#fff' },
                        '& .MuiInputBase-input': { fontSize: '0.75rem' },
                        '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#fff' },
                      }}
                      inputProps={{ step: '0.01', inputMode: 'decimal' }}
                    />
                    <TextField
                      fullWidth
                      label="Stop Loss"
                      name="stopLoss"
                      type="number"
                      variant="outlined"
                      value={orderData.stopLoss}
                      onChange={handleOrderChange}
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontFamily: 'monospace', background: '#fff', borderColor: '#fff', fontSize: '0.75rem' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#dc2626' },
                        '& .MuiInputBase-input': { fontSize: '0.75rem', color: '#dc2626' },
                        '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#fff' },
                      }}
                      inputProps={{ step: '0.00001', inputMode: 'decimal' }}
                    />
                    {accountDetails?.splittingTarget && Array.from({ length: accountDetails.splittingTarget }, (_, index) => (
                      <TextField
                        key={`takeProfit-${index}`}
                        fullWidth
                        label={`Target ${index + 1}`}
                        name={`takeProfit-${index}`}
                        type="text"
                        variant="outlined"
                        value={orderData.takeProfit[index] || ''}
                        onChange={handleOrderChange}
                        sx={{
                          '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontFamily: 'monospace', background: '#fff', borderColor: '#fff', fontSize: '0.75rem' },
                          '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#16a34a' },
                          '& .MuiInputBase-input': { fontSize: '0.75rem', color: '#16a34a' },
                          '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#fff' },
                        }}
                        inputProps={{ inputMode: 'decimal' }}
                      />
                    ))}
                    <TextField
                      fullWidth
                      label="Comment (optional)"
                      name="comment"
                      variant="outlined"
                      value={orderData.comment}
                      onChange={handleOrderChange}
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '0.75rem', background: '#fff', color: '#000' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#fff' },
                        '& .MuiInputBase-input': { fontSize: '0.75rem' },
                        '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#fff' },
                      }}
                    />
                  </Box>
                  <Button
                    fullWidth
                    variant="contained"
                    onClick={handleVerifyOrder}
                    disabled={!isFormValid()}
                    sx={{
                      py: 0.75,
                      borderRadius: 2,
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      textTransform: 'none',
                      background: orderData.entryType === 'buy'
                        ? 'linear-gradient(to right, #16a34a, #059669)'
                        : 'linear-gradient(to right, #dc2626, #e11d48)',
                      boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
                      '&:hover': {
                        background: orderData.entryType === 'buy'
                          ? 'linear-gradient(to right, #15803d, #047857)'
                          : 'linear-gradient(to right, #b91c1c, #be123c)',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.25)',
                      },
                    }}
                  >
                    Place {orderData.entryType.toUpperCase()} Order
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Box>

        <Dialog open={showConfirmation} onClose={handleCancelConfirmation}>
          <DialogTitle sx={{ fontSize: '1.1rem', fontWeight: 700, textAlign: 'center', mb: 1, color: theme.palette.text.primary }}>
            Confirm Order
          </DialogTitle>
          <DialogContent sx={{ maxWidth: '400px', p: 1 }}>
            {verifiedData ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ background: theme.palette.mode === 'dark' ? '#2d3748' : '#f1f5f9', p: 1, borderRadius: 2 }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, fontSize: '0.75rem' }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontWeight: 700, color: theme.palette.text.secondary }}>Symbol:</Typography>
                        <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, color: theme.palette.text.primary }}>{verifiedData.symbol}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontWeight: 700, color: theme.palette.text.secondary }}>Side:</Typography>
                        <Chip
                          label={verifiedData.side}
                          sx={{
                            background: verifiedData.side === 'BUY' ? '#16a34a' : '#dc2626',
                            color: 'white',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                          }}
                        />
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontWeight: 700, color: theme.palette.text.secondary }}>Type:</Typography>
                        <Typography sx={{ fontWeight: 700, color: theme.palette.text.primary }}>{verifiedData.orderType}</Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontWeight: 700, color: theme.palette.text.secondary }}>Quantity:</Typography>
                        <Typography sx={{ fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(verifiedData.quantity)}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontWeight: 700, color: theme.palette.text.secondary }}>SL:</Typography>
                        <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#dc2626' }}>{numberFmt(verifiedData.stopLoss)}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontWeight: 700, color: theme.palette.text.secondary }}>TP:</Typography>
                        <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#16a34a' }}>
                          {Array.isArray(verifiedData.takeProfit) ? verifiedData.takeProfit.map(numberFmt).join(', ') : numberFmt(verifiedData.takeProfit)}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                  <Box sx={{ background: '#fef2f2', border: '1px solid #fecaca', p: 1, borderRadius: 2, textAlign: 'center' }}>
                    <Typography sx={{ color: '#dc2626', fontSize: '0.65rem', fontWeight: 700 }}>MAX LOSS</Typography>
                    <Typography sx={{ color: '#dc2626', fontSize: '0.9rem', fontWeight: 700 }}>${numberFmt(Math.abs(verifiedData.maxLoss))}</Typography>
                  </Box>
                  <Box sx={{ background: '#f0fdf4', border: '1px solid #bbf7d0', p: 1, borderRadius: 2, textAlign: 'center' }}>
                    <Typography sx={{ color: '#16a34a', fontSize: '0.65rem', fontWeight: 700 }}>MAX PROFIT</Typography>
                    <Typography sx={{ color: '#16a34a', fontSize: '0.9rem', fontWeight: 700 }}>${numberFmt(verifiedData.maxProfit)}</Typography>
                  </Box>
                </Box>
              </Box>
            ) : (
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, textAlign: 'center', color: theme.palette.text.primary }}>Verifying order...</Typography>
            )}
          </DialogContent>
          <DialogActions sx={{ pt: 1, display: 'flex', gap: 1 }}>
            <Button
              onClick={handleCancelConfirmation}
              variant="outlined"
              sx={{ flex: 1, borderRadius: 2, fontSize: '0.75rem', fontWeight: 700, textTransform: 'none', py: 0.5 }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmOrder}
              variant="contained"
              sx={{
                flex: 1,
                borderRadius: 2,
                fontSize: '0.75rem',
                fontWeight: 700,
                textTransform: 'none',
                background: '#16a34a',
                py: 0.5,
                '&:hover': { background: '#15803d' },
              }}
            >
              Confirm
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </>
  );
};

export default Dashboard;


/*
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  useTheme,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import { verifyToken, placeOrder, verifyOrder, initializeSocket, getUserAccounts, getAccountDetails } from '../api/api';
import Header from './Header';
import _ from 'lodash';
import { TrendingUp, TrendingDown, DollarSign, Settings, User, Building2 } from 'lucide-react';

interface Position {
  id: string;
  platform: string;
  type: 'BUY' | 'SELL' | 'LIMIT';
  symbol: string;
  brokerTime: string;
  openPrice: number;
  volume: number;
  brokerComment: string;
  stopLoss?: number;
  takeProfit?: number;
  liveProfit: number;
}

interface PendingOrder {
  id: string;
  type: string;
  symbol: string;
  time: string;
  currentVolume: number;
  brokerComment: string;
  stopLoss?: number;
  takeProfit?: number;
}

interface AccountInformation {
  platform: string;
  type: string;
  broker: string;
  currency: string;
  server: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  leverage: number;
  marginLevel: number;
  marginMode: string;
  name: string;
  login: number;
}

interface Account {
  _id: string;
  brokerName: string;
  accountId: string;
  maxPositionLimit?: number;
}

interface AccountDetails extends Account {
  splittingTarget?: number;
  riskPercentage?: number;
  autoLotSizeSet?: boolean;
  dailyRiskPercentage?: number;
  remainingDailyRisk?: number;
  timezone?: string;
  location?: string;
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

const numberFmt = (n: number | undefined | null) =>
  typeof n === 'number' && !isNaN(n) ? n.toFixed(2) : 'undefined';

const stringFmt = (v: any) => (v != null ? String(v) : 'undefined');

const Dashboard: React.FC = () => {
  const theme = useTheme();
  const [error, setError] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedMetaApiAccountId, setSelectedMetaApiAccountId] = useState<string>('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountDetails, setAccountDetails] = useState<AccountDetails | null>(null);
  const [orderData, setOrderData] = useState({
    symbol: '',
    entryType: 'buy' as 'buy' | 'sell',
    lotSize: '',
    stopLoss: '',
    takeProfit: '',
    orderType: 'Market' as 'Market' | 'Stop' | 'Limit',
    comment: '',
    entryPrice: '',
  });
  const [positions, setPositions] = useState<Position[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [accountInformation, setAccountInformation] = useState<AccountInformation | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [verifiedData, setVerifiedData] = useState<VerifiedOrderData | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const checkToken = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('No token found, redirecting to login');
        navigate('/login');
        return;
      }
      try {
        await verifyToken();
        setError('');
        const accountsData = await getUserAccounts();
        setAccounts(accountsData);
        console.log('Accounts:', accountsData);
        if (accountsData.length > 0 && !selectedAccountId) {
          setSelectedAccountId(accountsData[0]._id);
          setSelectedMetaApiAccountId(accountsData[0].accountId);
        }
      } catch (err: any) {
        console.error('Token verification failed:', err, 'Response:', err.response?.data);
        localStorage.removeItem('token');
        setError('Session expired. Please log in again.');
        navigate('/login');
      }
    };
    checkToken();
  }, [navigate]);

  useEffect(() => {
    if (!selectedAccountId) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    const socket = initializeSocket(token, selectedAccountId);

    socket.on('connect', () => {
      console.log(`Socket.IO connected for account ${selectedAccountId}`);
    });

    socket.on('live-data', (data: { accountId: string; positionData: { livePositions: Position[], pendingOrders: PendingOrder[], accountInformation: AccountInformation } }) => {
      if (data.accountId !== selectedMetaApiAccountId) {
        console.log(`Ignoring live-data for account ${data.accountId}, expected ${selectedMetaApiAccountId}`);
        return;
      }
      if (data.positionData && Array.isArray(data.positionData.livePositions)) {
        setPositions(data.positionData.livePositions);
      }
      setPendingOrders(data.positionData.pendingOrders || []);
      setAccountInformation(data.positionData.accountInformation || null);
    });

    socket.on('order-response', (response: { message?: string; positionIds?: string[]; error?: string }) => {
      console.log(`[${new Date().toISOString()}] Order response in Dashboard:`, response);
      if (response.error) {
        setError(response.error);
        console.error('Order failed:', response.error);
      } else {
        setError('');
        setOrderData({ symbol: '', entryType: 'buy', lotSize: '', stopLoss: '', takeProfit: '', orderType: 'Market', comment: '', entryPrice: '' });
        console.log('Order placed successfully:', response);
      }
      setShowConfirmation(false);
    });

    socket.on('verify-order-response', (response: { data?: VerifiedOrderData; error?: string }) => {
      console.log(`[${new Date().toISOString()}] Verify order response in Dashboard:`, response);
      if (response.error) {
        setError(response.error);
        console.error('Verify order failed:', response.error);
      } else if (response.data) {
        setVerifiedData(response.data);
        setShowConfirmation(true);
        setError('');
      }
    });

    socket.on('equity-balance', (data: { accountId: string; equity: number; balance: number }) => {
      console.log(`[${new Date().toISOString()}] Equity/Balance:`, data);
      if (data.accountId === selectedMetaApiAccountId) {
        setAccountInformation(prev => ({
          ...prev,
          equity: data.equity,
          balance: data.balance,
        } as AccountInformation));
      } else {
        console.log(`Ignoring equity-balance for account ${data.accountId}, expected ${selectedMetaApiAccountId}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket.IO disconnected for account ${selectedAccountId}`);
    });

    return () => {
      socket.off('live-data');
      socket.off('order-response');
      socket.off('verify-order-response');
      socket.off('equity-balance');
      socket.off('connect');
      socket.off('disconnect');
      socket.disconnect();
    };
  }, [selectedAccountId, selectedMetaApiAccountId]);

  const handleOrderChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent
  ) => {
    const { name, value } = e.target as HTMLInputElement;
    setOrderData((prev) => ({ ...prev, [name]: value }));
  };

  const handleVerifyOrder = _.debounce(async () => {
    try {
      const takeProfitValue = orderData.takeProfit.trim();
      const takeProfit = takeProfitValue
        ? takeProfitValue.split(',').map(Number).filter((n) => !isNaN(n))
        : undefined;
      const data = {
        _id: selectedAccountId,
        symbol: orderData.symbol.trim().toUpperCase(),
        entryType: orderData.entryType,
        lotSize: orderData.lotSize ? Number(orderData.lotSize) : undefined,
        stopLoss: orderData.stopLoss ? Number(orderData.stopLoss) : undefined,
        takeProfit: takeProfit && takeProfit.length > 0 ? (takeProfit.length === 1 ? takeProfit[0] : takeProfit) : undefined,
        orderType: orderData.orderType,
        comment: orderData.comment.trim() || undefined,
        entryPrice: orderData.orderType !== 'Market' && orderData.entryPrice ? Number(orderData.entryPrice) : undefined,
      };

      console.log('Verifying order:', data);
      await verifyOrder(data);
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to verify order.';
      console.error(`[${new Date().toISOString()}] Verify order failed:`, err);
      setError(errorMessage);
    }
  }, 3500);

  const handleConfirmOrder = _.debounce(async () => {
    try {
      const takeProfitValue = orderData.takeProfit.trim();
      const takeProfit = takeProfitValue
        ? takeProfitValue.split(',').map(Number).filter((n) => !isNaN(n))
        : undefined;
      const data = {
        _id: selectedAccountId,
        symbol: orderData.symbol.trim().toUpperCase(),
        entryType: orderData.entryType,
        lotSize: orderData.lotSize ? Number(orderData.lotSize) : undefined,
        stopLoss: orderData.stopLoss ? Number(orderData.stopLoss) : undefined,
        takeProfit: takeProfit && takeProfit.length > 0 ? (takeProfit.length === 1 ? takeProfit[0] : takeProfit) : undefined,
        orderType: orderData.orderType,
        comment: orderData.comment.trim() || undefined,
        entryPrice: orderData.orderType !== 'Market' && orderData.entryPrice ? Number(orderData.entryPrice) : undefined,
      };

      console.log('Submitting order (validated):', data);
      const response = await placeOrder(data);
      if (response && typeof response === 'object' && !('error' in response && response.error)) {
        try {
          const updatedDetails = await getAccountDetails(selectedAccountId);
          setAccountDetails(updatedDetails);
          console.log('Updated account details:', updatedDetails);
        } catch (err: any) {
          console.error(`[${new Date().toISOString()}] Failed to fetch updated account details:`, err);
          setError('Failed to fetch updated account details.');
        }
      }
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to place order.';
      console.error(`[${new Date().toISOString()}] Place order failed:`, err);
      setError(errorMessage);
      setShowConfirmation(false);
    }
  }, 2500);

  const handleCancelConfirmation = () => {
    setShowConfirmation(false);
    setVerifiedData(null);
  };

  const handleAccountChange = async (accountId: string) => {
    setSelectedAccountId(accountId);
    const account = accounts.find((acc) => acc._id === accountId);
    setSelectedMetaApiAccountId(account ? account.accountId : '');
    console.log('Selected MongoDB _id:', accountId, 'MetaApi accountId:', account ? account.accountId : '');
    setPositions([]);
    setPendingOrders([]);
    setAccountInformation(null);
    setAccountDetails(null);
    try {
      const response = await getAccountDetails(accountId);
      setAccountDetails(response);
    } catch (err: any) {
      console.error(`[${new Date().toISOString()}] Failed to fetch account details:`, err);
      setError('Failed to fetch account details.');
    }
  };

  const isFormValid = () => {
    if (!selectedAccountId) return false;
    if (!orderData.symbol.trim()) return false;
    if (!orderData.lotSize || Number(orderData.lotSize) <= 0) return false;
    if ((orderData.orderType === 'Stop' || orderData.orderType === 'Limit') && (!orderData.entryPrice || Number(orderData.entryPrice) <= 0)) return false;
    return true;
  };

  return (
    <>
      <Header selectedAccountId={selectedAccountId} onAccountChange={handleAccountChange} />
      <Box
        sx={{
          minHeight: '100vh',
          background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #121212, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, #f8fafc, #e0f2fe, #e0e7ff)',
          p: 1,
        }}
      >
        <Box sx={{ maxWidth: '1200px', mx: 'auto' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr 1fr' }, gap: 1 }}>
            <Card
              sx={{
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, white, #f1f5f9)',
                transition: 'box-shadow 0.3s',
                '&:hover': { boxShadow: '0 4px 15px rgba(0,0,0,0.15)' },
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #2563eb, #4f46e5)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Building2 size={18} />
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>Platform Details</Typography>
                  </Box>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                {accountInformation ? (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Platform:</Typography>
                      <Chip label={stringFmt(accountInformation.platform)} sx={{ fontSize: '0.7rem', fontWeight: 700, background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe' }} />
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Type:</Typography>
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, background: '#f1f5f9', px: 0.5, py: 0.25, borderRadius: 1 }}>
                        {stringFmt(accountInformation.type).replace('ACCOUNT_TRADE_MODE_', '')}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Broker:</Typography>
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, maxWidth: '150px', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {stringFmt(accountInformation.broker)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Currency:</Typography>
                      <Chip label={stringFmt(accountInformation.currency)} sx={{ fontSize: '0.7rem', fontWeight: 700, background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0' }} />
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Server:</Typography>
                      <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, background: '#f1f5f9', px: 0.5, py: 0.25, borderRadius: 1, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {stringFmt(accountInformation.server)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Name:</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <User size={14} color={theme.palette.text.secondary} />
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{stringFmt(accountInformation.name)}</Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Login:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{stringFmt(accountInformation.login)}</Typography>
                    </Box>
                  </>
                ) : (
                  <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700 }}>
                    No platform details available
                  </Typography>
                )}
              </CardContent>
            </Card>

            <Card
              sx={{
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, white, #f1f5f9)',
                transition: 'box-shadow 0.3s',
                '&:hover': { boxShadow: '0 4px 15px rgba(0,0,0,0.15)' },
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #2563eb, #4f46e5)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Settings size={18} />
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>Risk Settings</Typography>
                  </Box>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                {accountDetails ? (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Splitting Target:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{numberFmt(accountDetails.splittingTarget)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Max Position Limit:</Typography>
                      <Chip label={numberFmt(accountDetails.maxPositionLimit)} sx={{ fontSize: '0.7rem', fontWeight: 700, background: '#ffedd5', color: '#c2410c', border: '1px solid #fed7aa' }} />
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Risk Percentage:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{numberFmt(accountDetails.riskPercentage)}%</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Auto Lot Size:</Typography>
                      <Chip
                        label={accountDetails.autoLotSizeSet ? 'Enabled' : 'Disabled'}
                        sx={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          background: accountDetails.autoLotSizeSet ? '#16a34a' : '#dc2626',
                          color: 'white',
                        }}
                      />
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Daily Risk %:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{numberFmt(accountDetails.dailyRiskPercentage)}%</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Timezone:</Typography>
                      <Chip label={stringFmt(accountDetails.timezone)} sx={{ fontSize: '0.7rem', fontWeight: 700, background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe' }} />
                    </Box>
                  </>
                ) : (
                  <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700 }}>
                    No risk settings available
                  </Typography>
                )}
              </CardContent>
            </Card>

            <Card
              sx={{
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? 'linear-gradient(to bottom right, #1e293b, #2d3748)' : 'linear-gradient(to bottom right, white, #f1f5f9)',
                transition: 'box-shadow 0.3s',
                '&:hover': { boxShadow: '0 4px 15px rgba(0,0,0,0.15)' },
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #2563eb, #4f46e5)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <DollarSign size={18} />
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>Financial Info</Typography>
                  </Box>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                {accountInformation ? (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Balance:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>${numberFmt(accountInformation.balance)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Equity:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>${numberFmt(accountInformation.equity)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Margin:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>${numberFmt(accountInformation.margin)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Free Margin:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#1e40af' }}>${numberFmt(accountInformation.freeMargin)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Leverage:</Typography>
                      <Chip label={`1:${stringFmt(accountInformation.leverage)}`} sx={{ fontSize: '0.7rem', fontWeight: 700, background: '#f3e8ff', color: '#6b21a8', border: '1px solid #d8b4fe' }} />
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>Daily Risk Left:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#f97316' }}>${numberFmt(accountDetails?.remainingDailyRisk)}</Typography>
                    </Box>
                  </>
                ) : (
                  <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700 }}>
                    No financial info available
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'row', gap: 1, mt: 1, flexWrap: 'nowrap', maxWidth: '1200px' }}>
            <Card
              sx={{
                flex: '0 0 75%',
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? '#1e293b' : 'white',
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #1e293b, #334155)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>
                    Live Positions & Pending Orders
                  </Typography>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                <Box sx={{ mb: 1 }}>
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, color: theme.palette.text.primary }}>
                    <TrendingUp size={18} color="#16a34a" />
                    Live Positions
                  </Typography>
                  {positions.length === 0 ? (
                    <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700, py: 0.5 }}>
                      No open positions
                    </Typography>
                  ) : (
                    <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                      <Table size="small" aria-label="positions table">
                        <TableHead sx={{ background: theme.palette.mode === 'dark' ? '#2d3748' : '#f1f5f9' }}>
                          <TableRow>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Symbol</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Type</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Volume</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Open Price</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>SL/TP</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>P/L</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {positions.map((position) => {
                            const isProfit = position.liveProfit >= 0;
                            return (
                              <TableRow key={position.id} hover sx={{ '&:hover': { background: theme.palette.mode === 'dark' ? '#374151' : '#f8fafc' } }}>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{position.symbol}</TableCell>
                                <TableCell>
                                  <Chip
                                    label={position.type}
                                    sx={{
                                      background: position.type === 'BUY' ? '#16a34a' : '#dc2626',
                                      color: 'white',
                                      fontSize: '0.7rem',
                                      fontWeight: 700,
                                    }}
                                  />
                                </TableCell>
                                <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(position.volume)}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(position.openPrice)}</TableCell>
                                <TableCell sx={{ fontSize: '0.7rem', fontWeight: 700, color: theme.palette.text.primary }}>
                                  <Box>SL: {numberFmt(position.stopLoss)}</Box>
                                  <Box>TP: {numberFmt(position.takeProfit)}</Box>
                                </TableCell>
                                <TableCell align="right">
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: isProfit ? '#16a34a' : '#dc2626', fontWeight: 700, fontSize: '0.75rem' }}>
                                    {isProfit ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                    ${numberFmt(position.liveProfit)}
                                  </Box>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, color: theme.palette.text.primary }}>
                    <TrendingUp size={18} color="#f97316" />
                    Pending Orders
                  </Typography>
                  {pendingOrders.length === 0 ? (
                    <Typography sx={{ textAlign: 'center', color: theme.palette.text.secondary, fontStyle: 'italic', fontSize: '0.75rem', fontWeight: 700, py: 0.5 }}>
                      No pending orders
                    </Typography>
                  ) : (
                    <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                      <Table size="small" aria-label="pending orders table">
                        <TableHead sx={{ background: theme.palette.mode === 'dark' ? '#2d3748' : '#f1f5f9' }}>
                          <TableRow>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Symbol</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Type</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Volume</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>SL/TP</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>Comment</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {pendingOrders.map((order) => (
                            <TableRow key={order.id} hover sx={{ '&:hover': { background: theme.palette.mode === 'dark' ? '#374151' : '#f8fafc' } }}>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{order.symbol}</TableCell>
                              <TableCell>
                                <Chip label={order.type} sx={{ background: '#fef3c7', color: '#c2410c', border: '1px solid #fed7aa', fontSize: '0.7rem', fontWeight: 700 }} />
                              </TableCell>
                              <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(order.currentVolume)}</TableCell>
                              <TableCell sx={{ fontSize: '0.7rem', fontWeight: 700, color: theme.palette.text.primary }}>
                                <Box>SL: {numberFmt(order.stopLoss)}</Box>
                                <Box>TP: {numberFmt(order.takeProfit)}</Box>
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.75rem', fontWeight: 700, color: theme.palette.text.secondary }}>{stringFmt(order.brokerComment)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
              </CardContent>
            </Card>

            <Card
              sx={{
                flex: '0 0 25%',
                border: 'none',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                background: theme.palette.mode === 'dark' ? '#1e293b' : 'white',
              }}
            >
              <CardHeader
                sx={{
                  background: orderData.entryType === 'buy'
                    ? 'linear-gradient(to right, #16a34a, #059669)'
                    : 'linear-gradient(to right, #dc2626, #e11d48)',
                  color: 'white',
                  borderRadius: '6px 6px 0 0',
                  py: 0.5,
                }}
                title={
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>
                    Place Order
                  </Typography>
                }
              />
              <CardContent sx={{ p: 1, pb: '8px !important' }}>
                {error && (
                  <Alert severity="error" sx={{ mb: 0.5, borderRadius: 2, fontSize: '0.75rem' }}>
                    {error}
                  </Alert>
                )}
                <Box component="form" noValidate autoComplete="off" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5, background: theme.palette.mode === 'dark' ? '#2d3748' : '#f1f5f9', p: 0.5, borderRadius: 2 }}>
                    <Button
                      onClick={() => setOrderData((prev) => ({ ...prev, entryType: 'buy' }))}
                      sx={{
                        width: '100%',
                        borderRadius: 1,
                        py: 0.5,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        transition: 'all 0.2s',
                        background: orderData.entryType === 'buy' ? '#16a34a' : 'transparent',
                        color: orderData.entryType === 'buy' ? 'white' : theme.palette.text.secondary,
                        '&:hover': { background: orderData.entryType === 'buy' ? '#15803d' : theme.palette.mode === 'dark' ? '#374151' : '#e2e8f0' },
                      }}
                    >
                      BUY
                    </Button>
                    <Button
                      onClick={() => setOrderData((prev) => ({ ...prev, entryType: 'sell' }))}
                      sx={{
                        width: '100%',
                        borderRadius: 1,
                        py: 0.5,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        transition: 'all 0.2s',
                        background: orderData.entryType === 'sell' ? '#dc2626' : 'transparent',
                        color: orderData.entryType === 'sell' ? 'white' : theme.palette.text.secondary,
                        '&:hover': { background: orderData.entryType === 'sell' ? '#b91c1c' : theme.palette.mode === 'dark' ? '#374151' : '#e2e8f0' },
                      }}
                    >
                      SELL
                    </Button>
                  </Box>
                  <TextField
                    fullWidth
                    label="Symbol (e.g., EURUSD)"
                    name="symbol"
                    variant="outlined"
                    value={orderData.symbol}
                    onChange={handleOrderChange}
                    sx={{
                      '& .MuiOutlinedInput-root': { borderRadius: 2, fontFamily: 'monospace', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1, fontSize: '0.75rem' },
                      '& .MuiInputLabel-root': { fontSize: '0.75rem', color: theme.palette.text.secondary },
                      '& .MuiInputBase-input': { fontSize: '0.75rem' },
                    }}
                  />
                  <FormControl fullWidth>
                    <InputLabel sx={{ fontSize: '0.75rem', color: theme.palette.text.secondary }}>Order Type</InputLabel>
                    <Select
                      name="orderType"
                      value={orderData.orderType}
                      onChange={handleOrderChange}
                      label="Order Type"
                      sx={{
                        borderRadius: 2,
                        '& .MuiSelect-select': { fontSize: '0.75rem' },
                      }}
                    >
                      <MenuItem value="Market" sx={{ fontSize: '0.75rem' }}>Market</MenuItem>
                      <MenuItem value="Stop" sx={{ fontSize: '0.75rem' }}>Stop</MenuItem>
                      <MenuItem value="Limit" sx={{ fontSize: '0.75rem' }}>Limit</MenuItem>
                    </Select>
                  </FormControl>
                  {(orderData.orderType === 'Stop' || orderData.orderType === 'Limit') && (
                    <TextField
                      fullWidth
                      label="Entry Price"
                      name="entryPrice"
                      type="number"
                      variant="outlined"
                      value={orderData.entryPrice}
                      onChange={handleOrderChange}
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontFamily: 'monospace', fontSize: '0.75rem' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem', color: theme.palette.text.secondary },
                        '& .MuiInputBase-input': { fontSize: '0.75rem' },
                      }}
                      inputProps={{ step: '0.00001', inputMode: 'decimal' }}
                    />
                  )}
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
                    <TextField
                      fullWidth
                      label="Lot Size"
                      name="lotSize"
                      type="number"
                      variant="outlined"
                      value={orderData.lotSize}
                      onChange={handleOrderChange}
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontSize: '0.75rem' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem', color: theme.palette.text.secondary },
                        '& .MuiInputBase-input': { fontSize: '0.75rem' },
                      }}
                      inputProps={{ step: '0.01', inputMode: 'decimal' }}
                    />
                    <TextField
                      fullWidth
                      label="Stop Loss"
                      name="stopLoss"
                      type="number"
                      variant="outlined"
                      value={orderData.stopLoss}
                      onChange={handleOrderChange}
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontFamily: 'monospace', background: '#fef2f2', borderColor: '#fecaca', fontSize: '0.75rem' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#dc2626' },
                        '& .MuiInputBase-input': { fontSize: '0.75rem', color: '#dc2626' },
                        '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#dc2626' },
                      }}
                      inputProps={{ step: '0.00001', inputMode: 'decimal' }}
                    />
                    <TextField
                      fullWidth
                      label="Take Profit"
                      name="takeProfit"
                      type="text"
                      variant="outlined"
                      value={orderData.takeProfit}
                      onChange={handleOrderChange}
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontFamily: 'monospace', background: '#f0fdf4', borderColor: '#bbf7d0', fontSize: '0.75rem' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem', color: '#16a34a' },
                        '& .MuiInputBase-input': { fontSize: '0.75rem', color: '#16a34a' },
                        '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#16a34a' },
                      }}
                      inputProps={{ inputMode: 'decimal' }}
                    />
                    <TextField
                      fullWidth
                      label="Comment (optional)"
                      name="comment"
                      variant="outlined"
                      value={orderData.comment}
                      onChange={handleOrderChange}
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '0.75rem' },
                        '& .MuiInputLabel-root': { fontSize: '0.75rem', color: theme.palette.text.secondary },
                        '& .MuiInputBase-input': { fontSize: '0.75rem' },
                      }}
                    />
                  </Box>
                  <Button
                    fullWidth
                    variant="contained"
                    onClick={handleVerifyOrder}
                    disabled={!isFormValid()}
                    sx={{
                      py: 0.75,
                      borderRadius: 2,
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      textTransform: 'none',
                      background: orderData.entryType === 'buy'
                        ? 'linear-gradient(to right, #16a34a, #059669)'
                        : 'linear-gradient(to right, #dc2626, #e11d48)',
                      boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
                      '&:hover': {
                        background: orderData.entryType === 'buy'
                          ? 'linear-gradient(to right, #15803d, #047857)'
                          : 'linear-gradient(to right, #b91c1c, #be123c)',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.25)',
                      },
                    }}
                  >
                    Place {orderData.entryType.toUpperCase()} Order
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Box>

        <Dialog open={showConfirmation} onClose={handleCancelConfirmation}>
          <DialogTitle sx={{ fontSize: '1.1rem', fontWeight: 700, textAlign: 'center', mb: 1, color: theme.palette.text.primary }}>
            Confirm Order
          </DialogTitle>
          <DialogContent sx={{ maxWidth: '400px', p: 1 }}>
            {verifiedData ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ background: theme.palette.mode === 'dark' ? '#2d3748' : '#f1f5f9', p: 1, borderRadius: 2 }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, fontSize: '0.75rem' }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontWeight: 700, color: theme.palette.text.secondary }}>Symbol:</Typography>
                        <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, color: theme.palette.text.primary }}>{verifiedData.symbol}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontWeight: 700, color: theme.palette.text.secondary }}>Side:</Typography>
                        <Chip
                          label={verifiedData.side}
                          sx={{
                            background: verifiedData.side === 'BUY' ? '#16a34a' : '#dc2626',
                            color: 'white',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                          }}
                        />
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontWeight: 700, color: theme.palette.text.secondary }}>Type:</Typography>
                        <Typography sx={{ fontWeight: 700, color: theme.palette.text.primary }}>{verifiedData.orderType}</Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontWeight: 700, color: theme.palette.text.secondary }}>Quantity:</Typography>
                        <Typography sx={{ fontWeight: 700, color: theme.palette.text.primary }}>{numberFmt(verifiedData.quantity)}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontWeight: 700, color: theme.palette.text.secondary }}>SL:</Typography>
                        <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#dc2626' }}>{numberFmt(verifiedData.stopLoss)}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontWeight: 700, color: theme.palette.text.secondary }}>TP:</Typography>
                        <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#16a34a' }}>
                          {Array.isArray(verifiedData.takeProfit) ? verifiedData.takeProfit.map(numberFmt).join(', ') : numberFmt(verifiedData.takeProfit)}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                  <Box sx={{ background: '#fef2f2', border: '1px solid #fecaca', p: 1, borderRadius: 2, textAlign: 'center' }}>
                    <Typography sx={{ color: '#dc2626', fontSize: '0.65rem', fontWeight: 700 }}>MAX LOSS</Typography>
                    <Typography sx={{ color: '#dc2626', fontSize: '0.9rem', fontWeight: 700 }}>${numberFmt(Math.abs(verifiedData.maxLoss))}</Typography>
                  </Box>
                  <Box sx={{ background: '#f0fdf4', border: '1px solid #bbf7d0', p: 1, borderRadius: 2, textAlign: 'center' }}>
                    <Typography sx={{ color: '#16a34a', fontSize: '0.65rem', fontWeight: 700 }}>MAX PROFIT</Typography>
                    <Typography sx={{ color: '#16a34a', fontSize: '0.9rem', fontWeight: 700 }}>${numberFmt(verifiedData.maxProfit)}</Typography>
                  </Box>
                </Box>
              </Box>
            ) : (
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, textAlign: 'center', color: theme.palette.text.primary }}>Verifying order...</Typography>
            )}
          </DialogContent>
          <DialogActions sx={{ pt: 1, display: 'flex', gap: 1 }}>
            <Button
              onClick={handleCancelConfirmation}
              variant="outlined"
              sx={{ flex: 1, borderRadius: 2, fontSize: '0.75rem', fontWeight: 700, textTransform: 'none', py: 0.5 }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmOrder}
              variant="contained"
              sx={{
                flex: 1,
                borderRadius: 2,
                fontSize: '0.75rem',
                fontWeight: 700,
                textTransform: 'none',
                background: '#16a34a',
                py: 0.5,
                '&:hover': { background: '#15803d' },
              }}
            >
              Confirm
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </>
  );
};

export default Dashboard;
/*
import React, { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  CardHeader,

  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import { verifyToken, placeOrder, verifyOrder, initializeSocket, getUserAccounts, getAccountDetails } from '../api/api';
import { ThemeContext } from '../main';
import Header from './Header';
import _ from 'lodash';
import { TrendingUp, TrendingDown, DollarSign, Settings, User, Building2 } from 'lucide-react';

interface Position {
  id: string;
  platform: string;
  type: 'BUY' | 'SELL' | 'LIMIT';
  symbol: string;
  brokerTime: string;
  openPrice: number;
  volume: number;
  brokerComment: string;
  stopLoss?: number;
  takeProfit?: number;
  liveProfit: number;
}

interface PendingOrder {
  id: string;
  type: string;
  symbol: string;
  time: string;
  currentVolume: number;
  brokerComment: string;
  stopLoss?: number;
  takeProfit?: number;
}

interface AccountInformation {
  platform: string;
  type: string;
  broker: string;
  currency: string;
  server: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  leverage: number;
  marginLevel: number;
  marginMode: string;
  name: string;
  login: number;
}

interface Account {
  _id: string;
  brokerName: string;
  accountId: string;
  maxPositionLimit?: number;
}

interface AccountDetails extends Account {
  splittingTarget?: number;
  riskPercentage?: number;
  autoLotSizeSet?: boolean;
  dailyRiskPercentage?: number;
  remainingDailyRisk?: number;
  timezone?: string;
  location?: string;
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

const numberFmt = (n: number | undefined | null) =>
  typeof n === 'number' && !isNaN(n) ? n.toFixed(2) : 'undefined';

const stringFmt = (v: any) => v != null ? String(v) : 'undefined';

const Dashboard: React.FC = () => {
  useContext(ThemeContext);
  const [error, setError] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedMetaApiAccountId, setSelectedMetaApiAccountId] = useState<string>('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountDetails, setAccountDetails] = useState<AccountDetails | null>(null);
  const [orderData, setOrderData] = useState({
    symbol: '',
    entryType: 'buy' as 'buy' | 'sell',
    lotSize: '',
    stopLoss: '',
    takeProfit: '',
    orderType: 'Market' as 'Market' | 'Stop' | 'Limit',
    comment: '',
    entryPrice: '',
  });
  const [positions, setPositions] = useState<Position[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [accountInformation, setAccountInformation] = useState<AccountInformation | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [verifiedData, setVerifiedData] = useState<VerifiedOrderData | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const checkToken = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('No token found, redirecting to login');
        navigate('/login');
        return;
      }
      try {
        await verifyToken();
        setError('');
        const accountsData = await getUserAccounts();
        setAccounts(accountsData);
        console.log('Accounts:', accountsData);
        if (accountsData.length > 0 && !selectedAccountId) {
          setSelectedAccountId(accountsData[0]._id);
          setSelectedMetaApiAccountId(accountsData[0].accountId);
        }
      } catch (err: any) {
        console.error('Token verification failed:', err, 'Response:', err.response?.data);
        localStorage.removeItem('token');
        setError('Session expired. Please log in again.');
        navigate('/login');
      }
    };
    checkToken();
  }, [navigate]);

  useEffect(() => {
    if (!selectedAccountId) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    const socket = initializeSocket(token, selectedAccountId);

    socket.on('connect', () => {
      console.log(`Socket.IO connected for account ${selectedAccountId}`);
    });

    socket.on('live-data', (data: { accountId: string; positionData: { livePositions: Position[], pendingOrders: PendingOrder[], accountInformation: AccountInformation } }) => {
      if (data.accountId !== selectedMetaApiAccountId) {
        console.log(`Ignoring live-data for account ${data.accountId}, expected ${selectedMetaApiAccountId}`);
        return;
      }
      if (data.positionData && Array.isArray(data.positionData.livePositions)) {
        setPositions(data.positionData.livePositions);
      }
      setPendingOrders(data.positionData.pendingOrders || []);
      setAccountInformation(data.positionData.accountInformation || null);
    });

    socket.on('order-response', (response: { message?: string; positionIds?: string[]; error?: string }) => {
      console.log(`[${new Date().toISOString()}] Order response in Dashboard:`, response);
      if (response.error) {
        setError(response.error);
        console.error('Order failed:', response.error);
      } else {
        setError('');
        setOrderData({ symbol: '', entryType: 'buy', lotSize: '', stopLoss: '', takeProfit: '', orderType: 'Market', comment: '', entryPrice: '' });
        console.log('Order placed successfully:', response);
      }
      setShowConfirmation(false);
    });

    socket.on('verify-order-response', (response: { data?: VerifiedOrderData; error?: string }) => {
      console.log(`[${new Date().toISOString()}] Verify order response in Dashboard:`, response);
      if (response.error) {
        setError(response.error);
        console.error('Verify order failed:', response.error);
      } else if (response.data) {
        setVerifiedData(response.data);
        setShowConfirmation(true);
        setError('');
      }
    });

    socket.on('equity-balance', (data: { accountId: string; equity: number; balance: number }) => {
      console.log(`[${new Date().toISOString()}] Equity/Balance:`, data);
      if (data.accountId === selectedMetaApiAccountId) {
        setAccountInformation(prev => ({
          ...prev,
          equity: data.equity,
          balance: data.balance,
        } as AccountInformation));
      } else {
        console.log(`Ignoring equity-balance for account ${data.accountId}, expected ${selectedMetaApiAccountId}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket.IO disconnected for account ${selectedAccountId}`);
    });

    return () => {
      socket.off('live-data');
      socket.off('order-response');
      socket.off('verify-order-response');
      socket.off('equity-balance');
      socket.off('connect');
      socket.off('disconnect');
      socket.disconnect();
    };
  }, [selectedAccountId, selectedMetaApiAccountId]);

  const handleOrderChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent
  ) => {
    const { name, value } = e.target as HTMLInputElement;
    setOrderData((prev) => ({ ...prev, [name]: value }));
  };

  const handleVerifyOrder = _.debounce(async () => {
    try {
      const takeProfitValue = orderData.takeProfit.trim();
      const takeProfit = takeProfitValue
        ? takeProfitValue.split(',').map(Number).filter((n) => !isNaN(n))
        : undefined;
      const data = {
        _id: selectedAccountId,
        symbol: orderData.symbol.trim().toUpperCase(),
        entryType: orderData.entryType,
        lotSize: orderData.lotSize ? Number(orderData.lotSize) : undefined,
        stopLoss: orderData.stopLoss ? Number(orderData.stopLoss) : undefined,
        takeProfit: takeProfit && takeProfit.length > 0 ? (takeProfit.length === 1 ? takeProfit[0] : takeProfit) : undefined,
        orderType: orderData.orderType,
        comment: orderData.comment.trim() || undefined,
        entryPrice: orderData.orderType !== 'Market' && orderData.entryPrice ? Number(orderData.entryPrice) : undefined,
      };

      console.log('Verifying order:', data);
      await verifyOrder(data);
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to verify order.';
      console.error(`[${new Date().toISOString()}] Verify order failed:`, err);
      setError(errorMessage);
    }
  }, 3500);

  const handleConfirmOrder = _.debounce(async () => {
    try {
      const takeProfitValue = orderData.takeProfit.trim();
      const takeProfit = takeProfitValue
        ? takeProfitValue.split(',').map(Number).filter((n) => !isNaN(n))
        : undefined;
      const data = {
        _id: selectedAccountId,
        symbol: orderData.symbol.trim().toUpperCase(),
        entryType: orderData.entryType,
        lotSize: orderData.lotSize ? Number(orderData.lotSize) : undefined,
        stopLoss: orderData.stopLoss ? Number(orderData.stopLoss) : undefined,
        takeProfit: takeProfit && takeProfit.length > 0 ? (takeProfit.length === 1 ? takeProfit[0] : takeProfit) : undefined,
        orderType: orderData.orderType,
        comment: orderData.comment.trim() || undefined,
        entryPrice: orderData.orderType !== 'Market' && orderData.entryPrice ? Number(orderData.entryPrice) : undefined,
      };

      console.log('Submitting order (validated):', data);
      const response = await placeOrder(data);
      if (response && typeof response === 'object' && !('error' in response && response.error)) {
        try {
          const updatedDetails = await getAccountDetails(selectedAccountId);
          setAccountDetails(updatedDetails);
          console.log('Updated account details:', updatedDetails);
        } catch (err: any) {
          console.error(`[${new Date().toISOString()}] Failed to fetch updated account details:`, err);
          setError('Failed to fetch updated account details.');
        }
      }
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to place order.';
      console.error(`[${new Date().toISOString()}] Place order failed:`, err);
      setError(errorMessage);
      setShowConfirmation(false);
    }
  }, 2500);

  const handleCancelConfirmation = () => {
    setShowConfirmation(false);
    setVerifiedData(null);
  };

  const handleAccountChange = async (accountId: string) => {
    setSelectedAccountId(accountId);
    const account = accounts.find((acc) => acc._id === accountId);
    setSelectedMetaApiAccountId(account ? account.accountId : '');
    console.log('Selected MongoDB _id:', accountId, 'MetaApi accountId:', account ? account.accountId : '');
    setPositions([]);
    setPendingOrders([]);
    setAccountInformation(null);
    setAccountDetails(null);
    try {
      const response = await getAccountDetails(accountId);
      setAccountDetails(response);
    } catch (err: any) {
      console.error(`[${new Date().toISOString()}] Failed to fetch account details:`, err);
      setError('Failed to fetch account details.');
    }
  };

  const isFormValid = () => {
    if (!selectedAccountId) return false;
    if (!orderData.symbol.trim()) return false;
    if (!orderData.lotSize || Number(orderData.lotSize) <= 0) return false;
    if ((orderData.orderType === 'Stop' || orderData.orderType === 'Limit') && (!orderData.entryPrice || Number(orderData.entryPrice) <= 0)) return false;
    return true;
  };

  return (
    <>
      <Header selectedAccountId={selectedAccountId} onAccountChange={handleAccountChange} />
      <Box
        sx={{
          minHeight: '100vh',
          background: 'linear-gradient(to bottom right, #f8fafc, #e0f2fe, #e0e7ff)',
          p: 3,
        }}
      >
    

        <Box sx={{ maxWidth: '1400px', mx: 'auto', mb: 4 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr 1fr' }, gap: 3 }}>
            <Card
              sx={{
                border: 'none',
                boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                background: 'linear-gradient(to bottom right, white, #f1f5f9)',
                transition: 'box-shadow 0.3s',
                '&:hover': { boxShadow: '0 6px 24px rgba(0,0,0,0.15)' },
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #2563eb, #4f46e5)',
                  color: 'white',
                  borderRadius: '8px 8px 0 0',
                  py: 1.5,
                }}
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Building2 size={20} />
                    <Typography sx={{ fontSize: '1rem', fontWeight: 600 }}>Platform Details</Typography>
                  </Box>
                }
              />
              <CardContent sx={{ p: 3 }}>
                {accountInformation ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ color: '#475569', fontSize: '0.8rem', fontWeight: 500 }}>Platform:</Typography>
                      <Chip label={stringFmt(accountInformation.platform)} sx={{ background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', fontFamily: 'monospace', fontSize: '0.75rem' }} />
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ color: '#475569', fontSize: '0.8rem', fontWeight: 500 }}>Type:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', background: '#f1f5f9', px: 1, py: 0.5, borderRadius: 1, fontFamily: 'monospace' }}>
                        {stringFmt(accountInformation.type).replace('ACCOUNT_TRADE_MODE_', '')}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ color: '#475569', fontSize: '0.8rem', fontWeight: 500 }}>Broker:</Typography>
                      <Typography sx={{ fontSize: '0.75rem', maxWidth: '200px', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {stringFmt(accountInformation.broker)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ color: '#475569', fontSize: '0.8rem', fontWeight: 500 }}>Currency:</Typography>
                      <Chip label={stringFmt(accountInformation.currency)} sx={{ background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', fontSize: '0.75rem' }} />
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ color: '#475569', fontSize: '0.8rem', fontWeight: 500 }}>Server:</Typography>
                      <Typography sx={{ fontSize: '0.7rem', background: '#f1f5f9', px: 1, py: 0.5, borderRadius: 1, fontFamily: 'monospace', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {stringFmt(accountInformation.server)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ color: '#475569', fontSize: '0.8rem', fontWeight: 500 }}>Name:</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <User size={16} color="#64748b" />
                        <Typography sx={{ fontSize: '0.8rem', fontWeight: 500 }}>{stringFmt(accountInformation.name)}</Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ color: '#475569', fontSize: '0.8rem', fontWeight: 500 }}>Login:</Typography>
                      <Typography sx={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>{stringFmt(accountInformation.login)}</Typography>
                    </Box>
                  </Box>
                ) : (
                  <Typography sx={{ textAlign: 'center', color: '#64748b', fontStyle: 'italic', fontSize: '0.8rem' }}>
                    No platform details available
                  </Typography>
                )}
              </CardContent>
            </Card>

            <Card
              sx={{
                border: 'none',
                boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                background: 'linear-gradient(to bottom right, white, #fef3c7)',
                transition: 'box-shadow 0.3s',
                '&:hover': { boxShadow: '0 6px 24px rgba(0,0,0,0.15)' },
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #f97316, #ef4444)',
                  color: 'white',
                  borderRadius: '8px 8px 0 0',
                  py: 1.5,
                }}
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Settings size={20} />
                    <Typography sx={{ fontSize: '1rem', fontWeight: 600 }}>Risk Settings</Typography>
                  </Box>
                }
              />
              <CardContent sx={{ p: 3 }}>
                {accountDetails ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ color: '#475569', fontSize: '0.8rem', fontWeight: 500 }}>Splitting Target:</Typography>
                      <Typography sx={{ fontSize: '0.8rem', fontWeight: 700 }}>{numberFmt(accountDetails.splittingTarget)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ color: '#475569', fontSize: '0.8rem', fontWeight: 500 }}>Max Position Limit:</Typography>
                      <Chip label={numberFmt(accountDetails.maxPositionLimit)} sx={{ background: '#ffedd5', color: '#c2410c', border: '1px solid #fed7aa', fontSize: '0.75rem' }} />
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ color: '#475569', fontSize: '0.8rem', fontWeight: 500 }}>Risk Percentage:</Typography>
                      <Typography sx={{ color: '#dc2626', fontSize: '0.8rem', fontWeight: 700 }}>{numberFmt(accountDetails.riskPercentage)}%</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ color: '#475569', fontSize: '0.8rem', fontWeight: 500 }}>Auto Lot Size:</Typography>
                      <Chip
                        label={accountDetails.autoLotSizeSet ? 'Enabled' : 'Disabled'}
                        sx={{
                          background: accountDetails.autoLotSizeSet ? '#16a34a' : '#dc2626',
                          color: 'white',
                          fontSize: '0.75rem',
                        }}
                      />
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ color: '#475569', fontSize: '0.8rem', fontWeight: 500 }}>Daily Risk %:</Typography>
                      <Typography sx={{ color: '#dc2626', fontSize: '0.8rem', fontWeight: 700 }}>{numberFmt(accountDetails.dailyRiskPercentage)}%</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ color: '#475569', fontSize: '0.8rem', fontWeight: 500 }}>Timezone:</Typography>
                      <Chip label={stringFmt(accountDetails.timezone)} sx={{ background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', fontSize: '0.75rem' }} />
                    </Box>
                  </Box>
                ) : (
                  <Typography sx={{ textAlign: 'center', color: '#64748b', fontStyle: 'italic', fontSize: '0.8rem' }}>
                    No risk settings available
                  </Typography>
                )}
              </CardContent>
            </Card>

            <Card
              sx={{
                border: 'none',
                boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                background: 'linear-gradient(to bottom right, white, #dcfce7)',
                transition: 'box-shadow 0.3s',
                '&:hover': { boxShadow: '0 6px 24px rgba(0,0,0,0.15)' },
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #16a34a, #059669)',
                  color: 'white',
                  borderRadius: '8px 8px 0 0',
                  py: 1.5,
                }}
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <DollarSign size={20} />
                    <Typography sx={{ fontSize: '1rem', fontWeight: 600 }}>Financial Info</Typography>
                  </Box>
                }
              />
              <CardContent sx={{ p: 3 }}>
                {accountInformation ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ color: '#475569', fontSize: '0.8rem', fontWeight: 500 }}>Balance:</Typography>
                      <Typography sx={{ color: '#16a34a', fontSize: '1rem', fontWeight: 700 }}>${numberFmt(accountInformation.balance)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ color: '#475569', fontSize: '0.8rem', fontWeight: 500 }}>Equity:</Typography>
                      <Typography sx={{ color: '#16a34a', fontSize: '1rem', fontWeight: 700 }}>${numberFmt(accountInformation.equity)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ color: '#475569', fontSize: '0.8rem', fontWeight: 500 }}>Margin:</Typography>
                      <Typography sx={{ fontSize: '0.8rem', fontWeight: 700 }}>${numberFmt(accountInformation.margin)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ color: '#475569', fontSize: '0.8rem', fontWeight: 500 }}>Free Margin:</Typography>
                      <Typography sx={{ color: '#1e40af', fontSize: '0.8rem', fontWeight: 700 }}>${numberFmt(accountInformation.freeMargin)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ color: '#475569', fontSize: '0.8rem', fontWeight: 500 }}>Leverage:</Typography>
                      <Chip label={`1:${stringFmt(accountInformation.leverage)}`} sx={{ background: '#f3e8ff', color: '#6b21a8', border: '1px solid #d8b4fe', fontSize: '0.75rem' }} />
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ color: '#475569', fontSize: '0.8rem', fontWeight: 500 }}>Daily Risk Left:</Typography>
                      <Typography sx={{ color: '#f97316', fontSize: '0.8rem', fontWeight: 700 }}>${numberFmt(accountDetails?.remainingDailyRisk)}</Typography>
                    </Box>
                  </Box>
                ) : (
                  <Typography sx={{ textAlign: 'center', color: '#64748b', fontStyle: 'italic', fontSize: '0.8rem' }}>
                    No financial info available
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '7fr 3fr' }, gap: 3 }}>
            <Card
              sx={{
                border: 'none',
                boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                background: 'white',
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #1e293b, #334155)',
                  color: 'white',
                  borderRadius: '8px 8px 0 0',
                  py: 1.5,
                }}
                title={
                  <Typography sx={{ fontSize: '1.1rem', fontWeight: 600 }}>
                    Live Positions & Pending Orders
                  </Typography>
                }
              />
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ mb: 4 }}>
                  <Typography sx={{ fontSize: '1rem', fontWeight: 600, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TrendingUp size={20} color="#16a34a" />
                    Live Positions
                  </Typography>
                  {positions.length === 0 ? (
                    <Typography sx={{ textAlign: 'center', color: '#64748b', fontStyle: 'italic', fontSize: '0.8rem', py: 2 }}>
                      No open positions
                    </Typography>
                  ) : (
                    <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                      <Table size="small" aria-label="positions table">
                        <TableHead sx={{ background: '#f1f5f9' }}>
                          <TableRow>
                            <TableCell sx={{ fontSize: '0.8rem', fontWeight: 600 }}>Symbol</TableCell>
                            <TableCell sx={{ fontSize: '0.8rem', fontWeight: 600 }}>Type</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>Volume</TableCell>
                            <TableCell sx={{ fontSize: '0.8rem', fontWeight: 600 }}>Open Price</TableCell>
                            <TableCell sx={{ fontSize: '0.8rem', fontWeight: 600 }}>SL/TP</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>P/L</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {positions.map((position) => {
                            const isProfit = position.liveProfit >= 0;
                            return (
                              <TableRow key={position.id} hover sx={{ '&:hover': { background: '#f8fafc' } }}>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 600 }}>{position.symbol}</TableCell>
                                <TableCell>
                                  <Chip
                                    label={position.type}
                                    sx={{
                                      background: position.type === 'BUY' ? '#16a34a' : '#dc2626',
                                      color: 'white',
                                      fontSize: '0.75rem',
                                    }}
                                  />
                                </TableCell>
                                <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{numberFmt(position.volume)}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{numberFmt(position.openPrice)}</TableCell>
                                <TableCell sx={{ fontSize: '0.75rem' }}>
                                  <Box>SL: {numberFmt(position.stopLoss)}</Box>
                                  <Box>TP: {numberFmt(position.takeProfit)}</Box>
                                </TableCell>
                                <TableCell align="right">
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: isProfit ? '#16a34a' : '#dc2626', fontWeight: 700, fontSize: '0.8rem' }}>
                                    {isProfit ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                                    ${numberFmt(position.liveProfit)}
                                  </Box>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '1rem', fontWeight: 600, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TrendingUp size={20} color="#f97316" />
                    Pending Orders
                  </Typography>
                  {pendingOrders.length === 0 ? (
                    <Typography sx={{ textAlign: 'center', color: '#64748b', fontStyle: 'italic', fontSize: '0.8rem', py: 2 }}>
                      No pending orders
                    </Typography>
                  ) : (
                    <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                      <Table size="small" aria-label="pending orders table">
                        <TableHead sx={{ background: '#f1f5f9' }}>
                          <TableRow>
                            <TableCell sx={{ fontSize: '0.8rem', fontWeight: 600 }}>Symbol</TableCell>
                            <TableCell sx={{ fontSize: '0.8rem', fontWeight: 600 }}>Type</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>Volume</TableCell>
                            <TableCell sx={{ fontSize: '0.8rem', fontWeight: 600 }}>SL/TP</TableCell>
                            <TableCell sx={{ fontSize: '0.8rem', fontWeight: 600 }}>Comment</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {pendingOrders.map((order) => (
                            <TableRow key={order.id} hover sx={{ '&:hover': { background: '#f8fafc' } }}>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 600 }}>{order.symbol}</TableCell>
                              <TableCell>
                                <Chip label={order.type} sx={{ background: '#fef3c7', color: '#c2410c', border: '1px solid #fed7aa', fontSize: '0.75rem' }} />
                              </TableCell>
                              <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{numberFmt(order.currentVolume)}</TableCell>
                              <TableCell sx={{ fontSize: '0.75rem' }}>
                                <Box>SL: {numberFmt(order.stopLoss)}</Box>
                                <Box>TP: {numberFmt(order.takeProfit)}</Box>
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.8rem', color: '#475569' }}>{stringFmt(order.brokerComment)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
              </CardContent>
            </Card>

            <Card
              sx={{
                border: 'none',
                boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                background: 'white',
              }}
            >
              <CardHeader
                sx={{
                  background: 'linear-gradient(to right, #4f46e5, #7e22ce)',
                  color: 'white',
                  borderRadius: '8px 8px 0 0',
                  py: 1.5,
                }}
                title={
                  <Typography sx={{ fontSize: '1rem', fontWeight: 600 }}>
                    Place Order
                  </Typography>
                }
              />
              <CardContent sx={{ p: 3 }}>
                {error && (
                  <Alert severity="error" sx={{ mb: 2, borderRadius: 2, fontSize: '0.8rem' }}>
                    {error}
                  </Alert>
                )}
                <Box component="form" noValidate autoComplete="off" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: '#f1f5f9', p: 1, borderRadius: 2 }}>
                    <Button
                      onClick={() => setOrderData((prev) => ({ ...prev, entryType: 'buy' }))}
                      sx={{
                        width: '100%',
                        borderRadius: 1,
                        py: 1,
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        transition: 'all 0.2s',
                        background: orderData.entryType === 'buy' ? '#16a34a' : 'transparent',
                        color: orderData.entryType === 'buy' ? 'white' : '#475569',
                        '&:hover': { background: orderData.entryType === 'buy' ? '#15803d' : '#e2e8f0' },
                      }}
                    >
                      BUY
                    </Button>
                    <Button
                      onClick={() => setOrderData((prev) => ({ ...prev, entryType: 'sell' }))}
                      sx={{
                        width: '100%',
                        borderRadius: 1,
                        py: 1,
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        transition: 'all 0.2s',
                        background: orderData.entryType === 'sell' ? '#dc2626' : 'transparent',
                        color: orderData.entryType === 'sell' ? 'white' : '#475569',
                        '&:hover': { background: orderData.entryType === 'sell' ? '#b91c1c' : '#e2e8f0' },
                      }}
                    >
                      SELL
                    </Button>
                  </Box>
                  <TextField
                    fullWidth
                    label="Symbol (e.g., EURUSD)"
                    name="symbol"
                    variant="outlined"
                    value={orderData.symbol}
                    onChange={handleOrderChange}
                    sx={{
                      '& .MuiOutlinedInput-root': { borderRadius: 2, fontFamily: 'monospace', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1 },
                      '& .MuiInputLabel-root': { fontSize: '0.8rem', color: '#475569' },
                      '& .MuiInputBase-input': { fontSize: '0.8rem' },
                    }}
                  />
                  <FormControl fullWidth>
                    <InputLabel sx={{ fontSize: '0.8rem', color: '#475569' }}>Order Type</InputLabel>
                    <Select
                      name="orderType"
                      value={orderData.orderType}
                      onChange={handleOrderChange}
                      label="Order Type"
                      sx={{
                        borderRadius: 2,
                        '& .MuiSelect-select': { fontSize: '0.8rem' },
                      }}
                    >
                      <MenuItem value="Market" sx={{ fontSize: '0.8rem' }}>Market</MenuItem>
                      <MenuItem value="Stop" sx={{ fontSize: '0.8rem' }}>Stop</MenuItem>
                      <MenuItem value="Limit" sx={{ fontSize: '0.8rem' }}>Limit</MenuItem>
                    </Select>
                  </FormControl>
                  {(orderData.orderType === 'Stop' || orderData.orderType === 'Limit') && (
                    <TextField
                      fullWidth
                      label="Entry Price"
                      name="entryPrice"
                      type="number"
                      variant="outlined"
                      value={orderData.entryPrice}
                      onChange={handleOrderChange}
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontFamily: 'monospace' },
                        '& .MuiInputLabel-root': { fontSize: '0.8rem', color: '#475569' },
                        '& .MuiInputBase-input': { fontSize: '0.8rem' },
                      }}
                      inputProps={{ step: '0.00001', inputMode: 'decimal' }}
                    />
                  )}
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                    <TextField
                      fullWidth
                      label="Lot Size"
                      name="lotSize"
                      type="number"
                      variant="outlined"
                      value={orderData.lotSize}
                      onChange={handleOrderChange}
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center' },
                        '& .MuiInputLabel-root': { fontSize: '0.8rem', color: '#475569' },
                        '& .MuiInputBase-input': { fontSize: '0.8rem' },
                      }}
                      inputProps={{ step: '0.01', inputMode: 'decimal' }}
                    />
                    <TextField
                      fullWidth
                      label="Stop Loss"
                      name="stopLoss"
                      type="number"
                      variant="outlined"
                      value={orderData.stopLoss}
                      onChange={handleOrderChange}
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontFamily: 'monospace', background: '#fef2f2', borderColor: '#fecaca' },
                        '& .MuiInputLabel-root': { fontSize: '0.8rem', color: '#dc2626' },
                        '& .MuiInputBase-input': { fontSize: '0.8rem', color: '#dc2626' },
                        '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#dc2626' },
                      }}
                      inputProps={{ step: '0.00001', inputMode: 'decimal' }}
                    />
                    <TextField
                      fullWidth
                      label="Take Profit"
                      name="takeProfit"
                      type="text"
                      variant="outlined"
                      value={orderData.takeProfit}
                      onChange={handleOrderChange}
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 2, textAlign: 'center', fontFamily: 'monospace', background: '#f0fdf4', borderColor: '#bbf7d0' },
                        '& .MuiInputLabel-root': { fontSize: '0.8rem', color: '#16a34a' },
                        '& .MuiInputBase-input': { fontSize: '0.8rem', color: '#16a34a' },
                        '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#16a34a' },
                      }}
                      inputProps={{ inputMode: 'decimal' }}
                    />
                    <TextField
                      fullWidth
                      label="Comment (optional)"
                      name="comment"
                      variant="outlined"
                      value={orderData.comment}
                      onChange={handleOrderChange}
                      sx={{
                        '& .MuiOutlinedInput-root': { borderRadius: 2 },
                        '& .MuiInputLabel-root': { fontSize: '0.8rem', color: '#475569' },
                        '& .MuiInputBase-input': { fontSize: '0.8rem' },
                      }}
                    />
                  </Box>
                    <Button
                    fullWidth
                    variant="contained"
                    onClick={handleVerifyOrder}
                    disabled={!isFormValid()}
                    sx={{
                      py: 1.5,
                      borderRadius: 2,
                      fontWeight: 600,
                      fontSize: '0.9rem',
                      textTransform: 'none',
                      background: orderData.entryType === 'buy'
                      ? 'linear-gradient(to right, #16a34a, #059669)'
                      : 'linear-gradient(to right, #dc2626, #e11d48)',
                      boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
                      '&:hover': {
                      background: orderData.entryType === 'buy'
                        ? 'linear-gradient(to right, #15803d, #047857)'
                        : 'linear-gradient(to right, #b91c1c, #be123c)',
                      boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
                      },
                    }}
                    >
                    Place {orderData.entryType.toUpperCase()} Order
                    </Button>
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Box>
      </Box>

      <Dialog open={showConfirmation} onClose={handleCancelConfirmation}>
        <DialogTitle sx={{ fontSize: '1.2rem', fontWeight: 700, textAlign: 'center', mb: 2 }}>
          Confirm Order
        </DialogTitle>
        <DialogContent sx={{ maxWidth: '400px' }}>
          {verifiedData ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ background: '#f1f5f9', p: 2, borderRadius: 2 }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, fontSize: '0.8rem' }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography sx={{ color: '#475569' }}>Symbol:</Typography>
                      <Typography sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{verifiedData.symbol}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography sx={{ color: '#475569' }}>Side:</Typography>
                      <Chip
                        label={verifiedData.side}
                        sx={{
                          background: verifiedData.side === 'BUY' ? '#16a34a' : '#dc2626',
                          color: 'white',
                          fontSize: '0.75rem',
                        }}
                      />
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography sx={{ color: '#475569' }}>Type:</Typography>
                      <Typography sx={{ fontWeight: 600 }}>{verifiedData.orderType}</Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography sx={{ color: '#475569' }}>Quantity:</Typography>
                      <Typography sx={{ fontWeight: 700 }}>{numberFmt(verifiedData.quantity)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography sx={{ color: '#475569' }}>SL:</Typography>
                      <Typography sx={{ fontFamily: 'monospace', color: '#dc2626' }}>{numberFmt(verifiedData.stopLoss)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography sx={{ color: '#475569' }}>TP:</Typography>
                      <Typography sx={{ fontFamily: 'monospace', color: '#16a34a' }}>
                        {Array.isArray(verifiedData.takeProfit) ? verifiedData.takeProfit.map(numberFmt).join(', ') : numberFmt(verifiedData.takeProfit)}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <Box sx={{ background: '#fef2f2', border: '1px solid #fecaca', p: 2, borderRadius: 2, textAlign: 'center' }}>
                  <Typography sx={{ color: '#dc2626', fontSize: '0.7rem', fontWeight: 500 }}>MAX LOSS</Typography>
                  <Typography sx={{ color: '#dc2626', fontSize: '1rem', fontWeight: 700 }}>${numberFmt(Math.abs(verifiedData.maxLoss))}</Typography>
                </Box>
                <Box sx={{ background: '#f0fdf4', border: '1px solid #bbf7d0', p: 2, borderRadius: 2, textAlign: 'center' }}>
                  <Typography sx={{ color: '#16a34a', fontSize: '0.7rem', fontWeight: 500 }}>MAX PROFIT</Typography>
                  <Typography sx={{ color: '#16a34a', fontSize: '1rem', fontWeight: 700 }}>${numberFmt(verifiedData.maxProfit)}</Typography>
                </Box>
              </Box>
            </Box>
          ) : (
            <Typography sx={{ fontSize: '0.8rem', textAlign: 'center' }}>Verifying order...</Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ pt: 2, display: 'flex', gap: 2 }}>
          <Button
            onClick={handleCancelConfirmation}
            variant="outlined"
            sx={{ flex: 1, borderRadius: 2, fontSize: '0.8rem', textTransform: 'none' }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmOrder}
            variant="contained"
            sx={{
              flex: 1,
              borderRadius: 2,
              fontSize: '0.8rem',
              textTransform: 'none',
              background: '#16a34a',
              '&:hover': { background: '#15803d' },
            }}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default Dashboard;

/*
import React, { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import { verifyToken, placeOrder, verifyOrder, initializeSocket, getUserAccounts, getAccountDetails } from '../api/api';
import { ThemeContext } from '../main';
import Header from './Header';
import _ from 'lodash'; // Added Lodash import for debouncing

interface Position {
  id: string;
  platform: string;
  type: 'BUY' | 'SELL' | 'LIMIT';
  symbol: string;
  brokerTime: string;
  openPrice: number;
  volume: number;
  brokerComment: string;
  stopLoss?: number;
  takeProfit?: number;
  liveProfit: number;
}

interface PendingOrder {
  id: string;
  type: string;
  symbol: string;
  time: string;
  currentVolume: number;
  brokerComment: string;
  stopLoss?: number;
  takeProfit?: number;
}

interface AccountInformation {
  platform: string;
  type: string;
  broker: string;
  currency: string;
  server: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  leverage: number;
  marginLevel: number;
  marginMode: string;
  name: string;
  login: number;
}

interface Account {
  _id: string;
  brokerName: string;
  accountId: string;
  maxPositionLimit?: number;
}

interface AccountDetails extends Account {
  splittingTarget?: number;
  riskPercentage?: number;
  autoLotSizeSet?: boolean;
  dailyRiskPercentage?: number;
  remainingDailyRisk?: number;
  timezone?: string;
  location?: string;
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

const numberFmt = (n: number | undefined | null) =>
  typeof n === 'number' && !isNaN(n) ? n.toFixed(2) : 'undefined';

const stringFmt = (v: any) => v != null ? String(v) : 'undefined';

const Dashboard: React.FC = () => {
  useContext(ThemeContext);
  const [error, setError] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedMetaApiAccountId, setSelectedMetaApiAccountId] = useState<string>('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountDetails, setAccountDetails] = useState<AccountDetails | null>(null);
  const [orderData, setOrderData] = useState({
    symbol: '',
    entryType: 'buy' as 'buy' | 'sell',
    lotSize: '',
    stopLoss: '',
    takeProfit: '',
    orderType: 'Market' as 'Market' | 'Stop' | 'Limit',
    comment: '',
    entryPrice: '',
  });
  const [positions, setPositions] = useState<Position[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [accountInformation, setAccountInformation] = useState<AccountInformation | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [verifiedData, setVerifiedData] = useState<VerifiedOrderData | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const checkToken = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('No token found, redirecting to login');
        navigate('/login');
        return;
      }
      try {
        await verifyToken();
        setError('');
        const accountsData = await getUserAccounts();
        setAccounts(accountsData);
        console.log('Accounts:', accountsData);
        if (accountsData.length > 0 && !selectedAccountId) {
          setSelectedAccountId(accountsData[0]._id);
          setSelectedMetaApiAccountId(accountsData[0].accountId);
        }
      } catch (err: any) {
        console.error('Token verification failed:', err, 'Response:', err.response?.data);
        localStorage.removeItem('token');
        setError('Session expired. Please log in again.');
        navigate('/login');
      }
    };
    checkToken();
  }, [navigate]);

  useEffect(() => {
    if (!selectedAccountId) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    const socket = initializeSocket(token, selectedAccountId);

    socket.on('connect', () => {
      console.log(`Socket.IO connected for account ${selectedAccountId}`);
    });

    socket.on('live-data', (data: { accountId: string; positionData: { livePositions: Position[], pendingOrders: PendingOrder[], accountInformation: AccountInformation } }) => {
      //  console.log('Live data received:', data);
      if (data.accountId !== selectedMetaApiAccountId) {
        console.log(`Ignoring live-data for account ${data.accountId}, expected ${selectedMetaApiAccountId}`);
        return;
      }
      if (data.positionData && Array.isArray(data.positionData.livePositions)) {
        setPositions(data.positionData.livePositions);
      }
      setPendingOrders(data.positionData.pendingOrders || []);
      setAccountInformation(data.positionData.accountInformation || null);
    });

    socket.on('order-response', (response: { message?: string; positionIds?: string[]; error?: string }) => {
      console.log(`[${new Date().toISOString()}] Order response in Dashboard:`, response);
      if (response.error) {
        setError(response.error);
        console.error('Order failed:', response.error);
      } else {
        setError('');
        setOrderData({ symbol: '', entryType: 'buy', lotSize: '', stopLoss: '', takeProfit: '', orderType: 'Market', comment: '', entryPrice: '' });
        console.log('Order placed successfully:', response);
      }
      setShowConfirmation(false); // Close dialog after order response
    });

    socket.on('verify-order-response', (response: { data?: VerifiedOrderData; error?: string }) => {
      console.log(`[${new Date().toISOString()}] Verify order response in Dashboard:`, response);
      if (response.error) {
        setError(response.error);
        console.error('Verify order failed:', response.error);
      } else if (response.data) {
        setVerifiedData(response.data);
        setShowConfirmation(true);
        setError('');
      }
    });

    socket.on('equity-balance', (data: { accountId: string; equity: number; balance: number }) => {
      console.log(`[${new Date().toISOString()}] Equity/Balance:`, data);
      if (data.accountId === selectedMetaApiAccountId) {
        setAccountInformation(prev => ({
          ...prev,
          equity: data.equity,
          balance: data.balance,
        } as AccountInformation));
      } else {
        console.log(`Ignoring equity-balance for account ${data.accountId}, expected ${selectedMetaApiAccountId}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket.IO disconnected for account ${selectedAccountId}`);
    });

    return () => {
      socket.off('live-data');
      socket.off('order-response');
      socket.off('verify-order-response');
      socket.off('equity-balance');
      socket.off('connect');
      socket.off('disconnect');
      socket.disconnect();
    };
  }, [selectedAccountId, selectedMetaApiAccountId]);

  const handleOrderChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent
  ) => {
    const { name, value } = e.target as HTMLInputElement;
    setOrderData((prev) => ({ ...prev, [name]: value }));
  };

  const handleVerifyOrder = _.debounce(async () => {
    try {
      const takeProfitValue = orderData.takeProfit.trim();
      const takeProfit = takeProfitValue
        ? takeProfitValue.split(',').map(Number).filter((n) => !isNaN(n))
        : undefined;
      const data = {
        _id: selectedAccountId,
        symbol: orderData.symbol.trim().toUpperCase(),
        entryType: orderData.entryType,
        lotSize: orderData.lotSize ? Number(orderData.lotSize) : undefined,
        stopLoss: orderData.stopLoss ? Number(orderData.stopLoss) : undefined,
        takeProfit: takeProfit && takeProfit.length > 0 ? (takeProfit.length === 1 ? takeProfit[0] : takeProfit) : undefined,
        orderType: orderData.orderType,
        comment: orderData.comment.trim() || undefined,
        entryPrice: orderData.orderType !== 'Market' && orderData.entryPrice ? Number(orderData.entryPrice) : undefined,
      };

      console.log('Verifying order:', data);
      await verifyOrder(data); // Emit verify-order via socket
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to verify order.';
      console.error(`[${new Date().toISOString()}] Verify order failed:`, err);
      setError(errorMessage);
    }
  }, 3500); // 500ms debounce delay

  const handleConfirmOrder = _.debounce(async () => {
    try {
      const takeProfitValue = orderData.takeProfit.trim();
      const takeProfit = takeProfitValue
        ? takeProfitValue.split(',').map(Number).filter((n) => !isNaN(n))
        : undefined;
      const data = {
        _id: selectedAccountId,
        symbol: orderData.symbol.trim().toUpperCase(),
        entryType: orderData.entryType,
        lotSize: orderData.lotSize ? Number(orderData.lotSize) : undefined,
        stopLoss: orderData.stopLoss ? Number(orderData.stopLoss) : undefined,
        takeProfit: takeProfit && takeProfit.length > 0 ? (takeProfit.length === 1 ? takeProfit[0] : takeProfit) : undefined,
        orderType: orderData.orderType,
        comment: orderData.comment.trim() || undefined,
        entryPrice: orderData.orderType !== 'Market' && orderData.entryPrice ? Number(orderData.entryPrice) : undefined,
      };

      console.log('Submitting order (validated):', data);
      const response = await placeOrder(data); // Submit order via socket
      // Fetch updated account details after successful order placement
      if (response && typeof response === 'object' && !('error' in response && response.error)) {
        try {
          const updatedDetails = await getAccountDetails(selectedAccountId);
          setAccountDetails(updatedDetails);
          console.log('Updated account details:', updatedDetails);
        } catch (err: any) {
          console.error(`[${new Date().toISOString()}] Failed to fetch updated account details:`, err);
          setError('Failed to fetch updated account details.');
        }
      }
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to place order.';
      console.error(`[${new Date().toISOString()}] Place order failed:`, err);
      setError(errorMessage);
      setShowConfirmation(false);
    }
  }, 2500); // 500ms debounce delay

  const handleCancelConfirmation = () => {
    setShowConfirmation(false);
    setVerifiedData(null);
  };

  const handleAccountChange = async (accountId: string) => {
    setSelectedAccountId(accountId);
    const account = accounts.find((acc) => acc._id === accountId);
    setSelectedMetaApiAccountId(account ? account.accountId : '');
    console.log('Selected MongoDB _id:', accountId, 'MetaApi accountId:', account ? account.accountId : '');
    setPositions([]);
    setPendingOrders([]);
    setAccountInformation(null);
    setAccountDetails(null);
    try {
      const response = await getAccountDetails(accountId);
      setAccountDetails(response); // Directly set the response as it matches AccountDetails interface
    } catch (err: any) {
      console.error(`[${new Date().toISOString()}] Failed to fetch account details:`, err);
      setError('Failed to fetch account details.');
    }
  };

  const isFormValid = () => {
    if (!selectedAccountId) return false;
    if (!orderData.symbol.trim()) return false;
    if (!orderData.lotSize || Number(orderData.lotSize) <= 0) return false;
    if ((orderData.orderType === 'Stop' || orderData.orderType === 'Limit') && (!orderData.entryPrice || Number(orderData.entryPrice) <= 0)) return false;
    return true;
  };

  return (
    <>
      <Header selectedAccountId={selectedAccountId} onAccountChange={handleAccountChange} />
      <Box
        sx={{
          p: 1.5,
          bgcolor: 'background.default',
          minHeight: '100vh',
        }}
      >
        <Box
          sx={{
            mx: 'auto',
            maxWidth: 1400,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '70% 30%' },
            gap: 2,
            alignItems: 'start',
          }}
        >
          <Card
            sx={{
              borderRadius: 2,
              boxShadow: 3,
              bgcolor: 'background.paper',
            }}
          >
            <CardContent sx={{ p: 1 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mb: 1,
                }}
              >
                <Box>
                  <Typography variant="h6" fontWeight={700} fontSize="0.85rem">
                    Live Positions and Pending Orders
                  </Typography>
                  <Typography variant="body2" color="text.secondary" fontSize="0.7rem">
                    Account: {selectedMetaApiAccountId || '—'}
                  </Typography>
                </Box>
              </Box>
              <Divider sx={{ mb: 1 }} />
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.5, fontSize: '0.75rem' }}>
                Live Positions
              </Typography>
              {positions.length === 0 ? (
                <Box
                  sx={{
                    py: 1.5,
                    textAlign: 'center',
                    color: 'text.secondary',
                    fontStyle: 'italic',
                    fontSize: '0.7rem',
                  }}
                >
                  No open positions
                </Box>
              ) : (
                <TableContainer
                  component={Paper}
                  sx={{
                    borderRadius: 1,
                    boxShadow: 0,
                  }}
                >
                  <Table size="small" aria-label="positions table">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontSize: '0.7rem' }}>Symbol</TableCell>
                        <TableCell sx={{ fontSize: '0.7rem' }}>Type</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.7rem' }}>Lot</TableCell>
                        <TableCell sx={{ fontSize: '0.7rem' }}>Entry Time</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.7rem' }}>Open Price</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.7rem' }}>SL</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.7rem' }}>TP</TableCell>
                        <TableCell sx={{ fontSize: '0.7rem' }}>Comment</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.7rem' }}>P/L</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {positions.map((position) => {
                        const isProfit = position.liveProfit >= 0;
                        return (
                          <TableRow key={position.id} hover>
                            <TableCell sx={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '0.7rem' }}>
                              {position.symbol}
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.7rem' }}>{position.type}</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.7rem' }}>{numberFmt(position.volume)}</TableCell>
                            <TableCell sx={{ fontSize: '0.7rem' }}>
                              {new Date(position.brokerTime).toLocaleString()}
                            </TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.7rem' }}>{numberFmt(position.openPrice)}</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.7rem' }}>{numberFmt(position.stopLoss)}</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.7rem' }}>{numberFmt(position.takeProfit)}</TableCell>
                            <TableCell sx={{ fontSize: '0.7rem' }}>{stringFmt(position.brokerComment)}</TableCell>
                            <TableCell align="right">
                              <Chip
                                size="small"
                                label={numberFmt(position.liveProfit)}
                                sx={{
                                  fontWeight: 700,
                                  fontSize: '0.7rem',
                                  bgcolor: (theme) =>
                                    isProfit
                                      ? theme.palette.success.main + '20'
                                      : theme.palette.error.main + '20',
                                  color: (theme) =>
                                    isProfit ? theme.palette.success.main : theme.palette.error.main,
                                  minWidth: 50,
                                }}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.5, mt: 1, fontSize: '0.75rem' }}>
                Pending Orders
              </Typography>
              {pendingOrders.length === 0 ? (
                <Box
                  sx={{
                    py: 1.5,
                    textAlign: 'center',
                    color: 'text.secondary',
                    fontStyle: 'italic',
                    fontSize: '0.7rem',
                  }}
                >
                  No pending orders
                </Box>
              ) : (
                <TableContainer
                  component={Paper}
                  sx={{
                    borderRadius: 1,
                    boxShadow: 0,
                  }}
                >
                  <Table size="small" aria-label="pending orders table">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontSize: '0.7rem' }}>Symbol</TableCell>
                        <TableCell sx={{ fontSize: '0.7rem' }}>Type</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.7rem' }}>Lot</TableCell>
                        <TableCell sx={{ fontSize: '0.7rem' }}>Time</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.7rem' }}>SL</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.7rem' }}>TP</TableCell>
                        <TableCell sx={{ fontSize: '0.7rem' }}>Comment</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {pendingOrders.map((order) => (
                        <TableRow key={order.id} hover>
                          <TableCell sx={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '0.7rem' }}>
                            {order.symbol}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.7rem' }}>{order.type}</TableCell>
                          <TableCell align="right" sx={{ fontSize: '0.7rem' }}>{numberFmt(order.currentVolume)}</TableCell>
                          <TableCell sx={{ fontSize: '0.7rem' }}>
                            {new Date(order.time).toLocaleString()}
                          </TableCell>
                          <TableCell align="right" sx={{ fontSize: '0.7rem' }}>{numberFmt(order.stopLoss)}</TableCell>
                          <TableCell align="right" sx={{ fontSize: '0.7rem' }}>{numberFmt(order.takeProfit)}</TableCell>
                          <TableCell sx={{ fontSize: '0.7rem' }}>{stringFmt(order.brokerComment)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
            }}
          >
            <Card
              sx={{
                borderRadius: 2,
                boxShadow: 3,
                bgcolor: 'background.paper',
                width: '100%',
                height: '30%',
              }}
            >
              <CardContent sx={{ p: 0.8 }}>
                <Typography variant="h6" fontWeight={700} gutterBottom fontSize="0.7rem">
                  Account Information
                </Typography>
                <Divider sx={{ mb: 0.8 }} />
                { !accountInformation && !accountDetails ? (
                  <Box
                    sx={{
                      py: 1,
                      textAlign: 'center',
                      color: 'text.secondary',
                      fontStyle: 'italic',
                      fontSize: '0.65rem',
                    }}
                  >
                    No account information
                  </Box>
                ) : (
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 0.2,
                    }}
                  >
                    {accountInformation && (
                      <>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Platform:</Typography>
                          <Typography fontSize="0.65rem">{stringFmt(accountInformation.platform)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Type:</Typography>
                          <Typography fontSize="0.65rem">{stringFmt(accountInformation.type)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Broker:</Typography>
                          <Typography fontSize="0.65rem">{stringFmt(accountInformation.broker)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Currency:</Typography>
                          <Typography fontSize="0.65rem">{stringFmt(accountInformation.currency)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Server:</Typography>
                          <Typography fontSize="0.65rem">{stringFmt(accountInformation.server)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Balance:</Typography>
                          <Typography fontSize="0.65rem">{numberFmt(accountInformation.balance)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Equity:</Typography>
                          <Typography fontSize="0.65rem">{numberFmt(accountInformation.equity)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Margin:</Typography>
                          <Typography fontSize="0.65rem">{numberFmt(accountInformation.margin)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Free Margin:</Typography>
                          <Typography fontSize="0.65rem">{numberFmt(accountInformation.freeMargin)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Leverage:</Typography>
                          <Typography fontSize="0.65rem">{stringFmt(accountInformation.leverage)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Margin Level:</Typography>
                          <Typography fontSize="0.65rem">{numberFmt(accountInformation.marginLevel)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Margin Mode:</Typography>
                          <Typography fontSize="0.65rem">{stringFmt(accountInformation.marginMode)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Name:</Typography>
                          <Typography fontSize="0.65rem">{stringFmt(accountInformation.name)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Login:</Typography>
                          <Typography fontSize="0.65rem">{stringFmt(accountInformation.login)}</Typography>
                        </Box>
                      </>
                    )}
                    {accountDetails && (
                      <>
                        <Divider sx={{ my: 0.8 }} />
                        <Typography variant="subtitle2" fontSize="0.7rem">Account Settings</Typography>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Splitting Target:</Typography>
                          <Typography fontSize="0.65rem">{numberFmt(accountDetails.splittingTarget)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Max Position Limit:</Typography>
                          <Typography fontSize="0.65rem">{numberFmt(accountDetails.maxPositionLimit)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Risk Percentage:</Typography>
                          <Typography fontSize="0.65rem">{numberFmt(accountDetails.riskPercentage)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Auto Lot Size Set:</Typography>
                          <Typography fontSize="0.65rem">{stringFmt(accountDetails.autoLotSizeSet)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Daily Risk Percentage:</Typography>
                          <Typography fontSize="0.65rem">{numberFmt(accountDetails.dailyRiskPercentage)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Remaining Daily Risk:</Typography>
                          <Typography fontSize="0.65rem">{numberFmt(accountDetails.remainingDailyRisk)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Timezone:</Typography>
                          <Typography fontSize="0.65rem">{stringFmt(accountDetails.timezone)}</Typography>
                        </Box>
                      </>
                    )}
                  </Box>
                )}
              </CardContent>
            </Card>
            <Card
              sx={{
                borderRadius: 2,
                boxShadow: 3,
                bgcolor: 'background.paper',
                width: '100%',
                height: '70%',
              }}
            >
              <CardContent sx={{ p: 0.8 }}>
                <Typography
                  variant="h6"
                  gutterBottom
                  color="text.primary"
                  fontWeight={700}
                  textAlign="center"
                  fontSize="0.7rem"
                >
                  Place Order
                </Typography>
                {error && (
                  <Alert severity="error" sx={{ mb: 0.8, borderRadius: 1, fontSize: '0.65rem' }}>
                    {error}
                  </Alert>
                )}
                <Box component="form" noValidate autoComplete="off">
                  <TextField
                    fullWidth
                    label="Symbol (e.g., EURUSD)"
                    name="symbol"
                    variant="outlined"
                    value={orderData.symbol}
                    onChange={handleOrderChange}
                    sx={{ mb: 0.8, '& .MuiOutlinedInput-root': { borderRadius: 1 }, '& .MuiInputLabel-root': { fontSize: '0.65rem' }, '& .MuiInputBase-input': { fontSize: '0.65rem' } }}
                    inputProps={{ style: { textTransform: 'uppercase', letterSpacing: 0.5 } }}
                  />
                  <FormControl fullWidth sx={{ mb: 0.8 }}>
                    <InputLabel id="entry-type-label" sx={{ fontSize: '0.65rem' }}>Entry Type</InputLabel>
                    <Select
                      labelId="entry-type-label"
                      name="entryType"
                      value={orderData.entryType}
                      onChange={handleOrderChange}
                      label="Entry Type"
                      sx={{ borderRadius: 1, '& .MuiSelect-select': { fontSize: '0.65rem' } }}
                    >
                      <MenuItem value="buy" sx={{ fontSize: '0.65rem' }}>Buy</MenuItem>
                      <MenuItem value="sell" sx={{ fontSize: '0.65rem' }}>Sell</MenuItem>
                    </Select>
                  </FormControl>
                  <FormControl fullWidth sx={{ mb: 0.8 }}>
                    <InputLabel id="order-type-label" sx={{ fontSize: '0.65rem' }}>Order Type</InputLabel>
                    <Select
                      labelId="order-type-label"
                      name="orderType"
                      value={orderData.orderType}
                      onChange={handleOrderChange}
                      label="Order Type"
                      sx={{ borderRadius: 1, '& .MuiSelect-select': { fontSize: '0.65rem' } }}
                    >
                      <MenuItem value="Market" sx={{ fontSize: '0.65rem' }}>Market</MenuItem>
                      <MenuItem value="Stop" sx={{ fontSize: '0.65rem' }}>Stop</MenuItem>
                      <MenuItem value="Limit" sx={{ fontSize: '0.65rem' }}>Limit</MenuItem>
                    </Select>
                  </FormControl>
                  {(orderData.orderType === 'Stop' || orderData.orderType === 'Limit') && (
                    <TextField
                      fullWidth
                      label="Entry Price"
                      name="entryPrice"
                      type="number"
                      variant="outlined"
                      value={orderData.entryPrice}
                      onChange={handleOrderChange}
                      sx={{ mb: 0.8, '& .MuiOutlinedInput-root': { borderRadius: 1 }, '& .MuiInputLabel-root': { fontSize: '0.65rem' }, '& .MuiInputBase-input': { fontSize: '0.65rem' } }}
                      inputProps={{ step: '0.01', inputMode: 'decimal' }}
                    />
                  )}
                  <TextField
                    fullWidth
                    label="Lot Size"
                    name="lotSize"
                    type="number"
                    variant="outlined"
                    value={orderData.lotSize}
                    onChange={handleOrderChange}
                    sx={{ mb: 0.8, '& .MuiOutlinedInput-root': { borderRadius: 1 }, '& .MuiInputLabel-root': { fontSize: '0.65rem' }, '& .MuiInputBase-input': { fontSize: '0.65rem' } }}
                    inputProps={{ min: 0, step: '0.01', inputMode: 'decimal' }}
                  />
                  <TextField
                    fullWidth
                    label="Stop Loss"
                    name="stopLoss"
                    type="number"
                    variant="outlined"
                    value={orderData.stopLoss}
                    onChange={handleOrderChange}
                    sx={{ mb: 0.8, '& .MuiOutlinedInput-root': { borderRadius: 1 }, '& .MuiInputLabel-root': { fontSize: '0.65rem' }, '& .MuiInputBase-input': { fontSize: '0.65rem' } }}
                    inputProps={{ step: '0.01', inputMode: 'decimal' }}
                  />
                  <TextField
                    fullWidth
                    label="Take Profit (optional, comma-separated)"
                    name="takeProfit"
                    type="text"
                    variant="outlined"
                    value={orderData.takeProfit}
                    onChange={handleOrderChange}
                    sx={{ mb: 0.8, '& .MuiOutlinedInput-root': { borderRadius: 1 }, '& .MuiInputLabel-root': { fontSize: '0.65rem' }, '& .MuiInputBase-input': { fontSize: '0.65rem' } }}
                    inputProps={{ inputMode: 'decimal' }}
                  />
                  <TextField
                    fullWidth
                    label="Comment (optional)"
                    name="comment"
                    variant="outlined"
                    value={orderData.comment}
                    onChange={handleOrderChange}
                    sx={{ mb: 0.8, '& .MuiOutlinedInput-root': { borderRadius: 1 }, '& .MuiInputLabel-root': { fontSize: '0.65rem' }, '& .MuiInputBase-input': { fontSize: '0.65rem' } }}
                  />
                  <Button
                    fullWidth
                    variant="contained"
                    color="primary"
                    onClick={handleVerifyOrder}
                    disabled={!isFormValid()}
                    sx={{
                      py: 0.6,
                      borderRadius: 1,
                      textTransform: 'none',
                      fontWeight: 700,
                      letterSpacing: 0.3,
                      fontSize: '0.65rem',
                    }}
                  >
                    Place Order
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Box>
      </Box>
      <Dialog open={showConfirmation} onClose={handleCancelConfirmation}>
        <DialogTitle sx={{ fontSize: '0.85rem', fontWeight: 700 }}>Confirm Order</DialogTitle>
        <DialogContent>
          {verifiedData ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Typography sx={{ fontSize: '0.65rem' }}>Symbol: {verifiedData.symbol}</Typography>
              <Typography sx={{ fontSize: '0.65rem' }}>Side: {verifiedData.side}</Typography>
              <Typography sx={{ fontSize: '0.65rem' }}>Order Type: {verifiedData.orderType}</Typography>
              <Typography sx={{ fontSize: '0.65rem' }}>Quantity: {numberFmt(verifiedData.quantity)}</Typography>
              <Typography sx={{ fontSize: '0.65rem' }}>Stop Loss: {numberFmt(verifiedData.stopLoss)}</Typography>
              <Typography sx={{ fontSize: '0.65rem' }}>
                Take Profit: {Array.isArray(verifiedData.takeProfit) ? verifiedData.takeProfit.map(numberFmt).join(', ') : numberFmt(verifiedData.takeProfit)}
              </Typography>
              {verifiedData.entryPrice && <Typography sx={{ fontSize: '0.65rem' }}>Entry Price: {numberFmt(verifiedData.entryPrice)}</Typography>}
              {verifiedData.comment && <Typography sx={{ fontSize: '0.65rem' }}>Comment: {verifiedData.comment}</Typography>}
              <Typography sx={{ fontSize: '0.65rem' }}>Max Loss: {numberFmt(verifiedData.maxLoss)}</Typography>
              <Typography sx={{ fontSize: '0.65rem' }}>Max Profit: {numberFmt(verifiedData.maxProfit)}</Typography>
            </Box>
          ) : (
            <Typography sx={{ fontSize: '0.65rem' }}>Verifying order...</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleCancelConfirmation}
            color="secondary"
            sx={{ fontSize: '0.65rem', textTransform: 'none' }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmOrder}
            color="primary"
            sx={{ fontSize: '0.65rem', textTransform: 'none' }}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default Dashboard;

/*
import React, { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import { verifyToken, placeOrder, verifyOrder, initializeSocket, getUserAccounts,getAccountDetails } from '../api/api';
import { ThemeContext } from '../main';
import Header from './Header';
import _ from 'lodash'; // Added Lodash import for debouncing


interface Position {
  id: string;
  platform: string;
  type: 'BUY' | 'SELL' | 'LIMIT';
  symbol: string;
  brokerTime: string;
  openPrice: number;
  volume: number;
  brokerComment: string;
  stopLoss?: number;
  takeProfit?: number;
  liveProfit: number;
}

interface PendingOrder {
  id: string;
  type: string;
  symbol: string;
  time: string;
  currentVolume: number;
  brokerComment: string;
  stopLoss?: number;
  takeProfit?: number;
}

interface AccountInformation {
  platform: string;
  type: string;
  broker: string;
  currency: string;
  server: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  leverage: number;
  marginLevel: number;
  marginMode: string;
  name: string;
  login: number;
}

interface Account {
  _id: string;
  brokerName: string;
  accountId: string;
  maxPositionLimit?: number;
}

interface AccountDetails extends Account {
  splittingTarget?: number;
  riskPercentage?: number;
  autoLotSizeSet?: boolean;
  dailyRiskPercentage?: number;
  remainingDailyRisk?: number;
  timezone?: string;
  location?: string;
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

const numberFmt = (n: number | undefined | null) =>
  typeof n === 'number' && !isNaN(n) ? n.toFixed(2) : 'undefined';

const stringFmt = (v: any) => v != null ? String(v) : 'undefined';

const Dashboard: React.FC = () => {
  useContext(ThemeContext);
  const [error, setError] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedMetaApiAccountId, setSelectedMetaApiAccountId] = useState<string>('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountDetails, setAccountDetails] = useState<AccountDetails | null>(null);
  const [orderData, setOrderData] = useState({
    symbol: '',
    entryType: 'buy' as 'buy' | 'sell',
    lotSize: '',
    stopLoss: '',
    takeProfit: '',
    orderType: 'Market' as 'Market' | 'Stop' | 'Limit',
    comment: '',
    entryPrice: '',
  });
  const [positions, setPositions] = useState<Position[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [accountInformation, setAccountInformation] = useState<AccountInformation | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [verifiedData, setVerifiedData] = useState<VerifiedOrderData | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const checkToken = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('No token found, redirecting to login');
        navigate('/login');
        return;
      }
      try {
        await verifyToken();
        setError('');
        const accountsData = await getUserAccounts();
        setAccounts(accountsData);
        console.log('Accounts:', accountsData);
        if (accountsData.length > 0 && !selectedAccountId) {
          setSelectedAccountId(accountsData[0]._id);
          setSelectedMetaApiAccountId(accountsData[0].accountId);
        }
      } catch (err: any) {
        console.error('Token verification failed:', err, 'Response:', err.response?.data);
        localStorage.removeItem('token');
        setError('Session expired. Please log in again.');
        navigate('/login');
      }
    };
    checkToken();
  }, [navigate]);

  useEffect(() => {
    if (!selectedAccountId) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    const socket = initializeSocket(token, selectedAccountId);

    socket.on('connect', () => {
      console.log(`Socket.IO connected for account ${selectedAccountId}`);
    });

    socket.on('live-data', (data: { accountId: string; positionData: { livePositions: Position[], pendingOrders: PendingOrder[], accountInformation: AccountInformation } }) => {
      //  console.log('Live data received:', data);
      if (data.accountId !== selectedMetaApiAccountId) {
        console.log(`Ignoring live-data for account ${data.accountId}, expected ${selectedMetaApiAccountId}`);
        return;
      }
      if (data.positionData && Array.isArray(data.positionData.livePositions)) {
        setPositions(data.positionData.livePositions);
      }
      setPendingOrders(data.positionData.pendingOrders || []);
      setAccountInformation(data.positionData.accountInformation || null);
    });

    socket.on('order-response', (response: { message?: string; positionIds?: string[]; error?: string }) => {
      console.log(`[${new Date().toISOString()}] Order response in Dashboard:`, response);
      if (response.error) {
        setError(response.error);
        console.error('Order failed:', response.error);
      } else {
        setError('');
        setOrderData({ symbol: '', entryType: 'buy', lotSize: '', stopLoss: '', takeProfit: '', orderType: 'Market', comment: '', entryPrice: '' });
        console.log('Order placed successfully:', response);
      }
      setShowConfirmation(false); // Close dialog after order response
    });

    socket.on('verify-order-response', (response: { data?: VerifiedOrderData; error?: string }) => {
      console.log(`[${new Date().toISOString()}] Verify order response in Dashboard:`, response);
      if (response.error) {
        setError(response.error);
        console.error('Verify order failed:', response.error);
      } else if (response.data) {
        setVerifiedData(response.data);
        setShowConfirmation(true);
        setError('');
      }
    });

    socket.on('equity-balance', (data: { accountId: string; equity: number; balance: number }) => {
      console.log(`[${new Date().toISOString()}] Equity/Balance:`, data);
      if (data.accountId === selectedMetaApiAccountId) {
        setAccountInformation(prev => ({
          ...prev,
          equity: data.equity,
          balance: data.balance,
        } as AccountInformation));
      } else {
        console.log(`Ignoring equity-balance for account ${data.accountId}, expected ${selectedMetaApiAccountId}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket.IO disconnected for account ${selectedAccountId}`);
    });

    return () => {
      socket.off('live-data');
      socket.off('order-response');
      socket.off('verify-order-response');
      socket.off('equity-balance');
      socket.off('connect');
      socket.off('disconnect');
      socket.disconnect();
    };
  }, [selectedAccountId, selectedMetaApiAccountId]);

  const handleOrderChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent
  ) => {
    const { name, value } = e.target as HTMLInputElement;
    setOrderData((prev) => ({ ...prev, [name]: value }));
  };

  const handleVerifyOrder = _.debounce(async () => {
    try {
      const takeProfitValue = orderData.takeProfit.trim();
      const takeProfit = takeProfitValue
        ? takeProfitValue.split(',').map(Number).filter((n) => !isNaN(n))
        : undefined;
      const data = {
        _id: selectedAccountId,
        symbol: orderData.symbol.trim().toUpperCase(),
        entryType: orderData.entryType,
        lotSize: orderData.lotSize ? Number(orderData.lotSize) : undefined,
        stopLoss: orderData.stopLoss ? Number(orderData.stopLoss) : undefined,
        takeProfit: takeProfit && takeProfit.length > 0 ? (takeProfit.length === 1 ? takeProfit[0] : takeProfit) : undefined,
        orderType: orderData.orderType,
        comment: orderData.comment.trim() || undefined,
        entryPrice: orderData.orderType !== 'Market' && orderData.entryPrice ? Number(orderData.entryPrice) : undefined,
      };

      console.log('Verifying order:', data);
      await verifyOrder(data); // Emit verify-order via socket
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to verify order.';
      console.error(`[${new Date().toISOString()}] Verify order failed:`, err);
      setError(errorMessage);
    }
  }, 3500); // 500ms debounce delay

  const handleConfirmOrder = _.debounce(async () => {
    try {
      const takeProfitValue = orderData.takeProfit.trim();
      const takeProfit = takeProfitValue
        ? takeProfitValue.split(',').map(Number).filter((n) => !isNaN(n))
        : undefined;
      const data = {
        _id: selectedAccountId,
        symbol: orderData.symbol.trim().toUpperCase(),
        entryType: orderData.entryType,
        lotSize: orderData.lotSize ? Number(orderData.lotSize) : undefined,
        stopLoss: orderData.stopLoss ? Number(orderData.stopLoss) : undefined,
        takeProfit: takeProfit && takeProfit.length > 0 ? (takeProfit.length === 1 ? takeProfit[0] : takeProfit) : undefined,
        orderType: orderData.orderType,
        comment: orderData.comment.trim() || undefined,
        entryPrice: orderData.orderType !== 'Market' && orderData.entryPrice ? Number(orderData.entryPrice) : undefined,
      };

      console.log('Submitting order (validated):', data);
      await placeOrder(data); // Submit order via socket
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to place order.';
      console.error(`[${new Date().toISOString()}] Place order failed:`, err);
      setError(errorMessage);
      setShowConfirmation(false);
    }
  }, 2500); // 500ms debounce delay

  const handleCancelConfirmation = () => {
    setShowConfirmation(false);
    setVerifiedData(null);
  };

  const handleAccountChange = async (accountId: string) => {
    setSelectedAccountId(accountId);
    const account = accounts.find((acc) => acc._id === accountId);
    setSelectedMetaApiAccountId(account ? account.accountId : '');
    console.log('Selected MongoDB _id:', accountId, 'MetaApi accountId:', account ? account.accountId : '');
    setPositions([]);
    setPendingOrders([]);
    setAccountInformation(null);
    setAccountDetails(null);
    try {
      const response = await getAccountDetails(accountId)
      setAccountDetails(response.data);
    } catch (err: any) {
      console.error(`[${new Date().toISOString()}] Failed to fetch account details:`, err);
    }
  };

  const isFormValid = () => {
    if (!selectedAccountId) return false;
    if (!orderData.symbol.trim()) return false;
    if (!orderData.lotSize || Number(orderData.lotSize) <= 0) return false;
    if ((orderData.orderType === 'Stop' || orderData.orderType === 'Limit') && (!orderData.entryPrice || Number(orderData.entryPrice) <= 0)) return false;
    return true;
  };

  return (
    <>
      <Header selectedAccountId={selectedAccountId} onAccountChange={handleAccountChange} />
      <Box
        sx={{
          p: 1.5,
          bgcolor: 'background.default',
          minHeight: '100vh',
        }}
      >
        <Box
          sx={{
            mx: 'auto',
            maxWidth: 1400,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '70% 30%' },
            gap: 2,
            alignItems: 'start',
          }}
        >
          <Card
            sx={{
              borderRadius: 2,
              boxShadow: 3,
              bgcolor: 'background.paper',
            }}
          >
            <CardContent sx={{ p: 1 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mb: 1,
                }}
              >
                <Box>
                  <Typography variant="h6" fontWeight={700} fontSize="0.85rem">
                    Live Positions and Pending Orders
                  </Typography>
                  <Typography variant="body2" color="text.secondary" fontSize="0.7rem">
                    Account: {selectedMetaApiAccountId || '—'}
                  </Typography>
                </Box>
              </Box>
              <Divider sx={{ mb: 1 }} />
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.5, fontSize: '0.75rem' }}>
                Live Positions
              </Typography>
              {positions.length === 0 ? (
                <Box
                  sx={{
                    py: 1.5,
                    textAlign: 'center',
                    color: 'text.secondary',
                    fontStyle: 'italic',
                    fontSize: '0.7rem',
                  }}
                >
                  No open positions
                </Box>
              ) : (
                <TableContainer
                  component={Paper}
                  sx={{
                    borderRadius: 1,
                    boxShadow: 0,
                  }}
                >
                  <Table size="small" aria-label="positions table">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontSize: '0.7rem' }}>Symbol</TableCell>
                        <TableCell sx={{ fontSize: '0.7rem' }}>Type</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.7rem' }}>Lot</TableCell>
                        <TableCell sx={{ fontSize: '0.7rem' }}>Entry Time</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.7rem' }}>Open Price</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.7rem' }}>SL</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.7rem' }}>TP</TableCell>
                        <TableCell sx={{ fontSize: '0.7rem' }}>Comment</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.7rem' }}>P/L</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {positions.map((position) => {
                        const isProfit = position.liveProfit >= 0;
                        return (
                          <TableRow key={position.id} hover>
                            <TableCell sx={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '0.7rem' }}>
                              {position.symbol}
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.7rem' }}>{position.type}</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.7rem' }}>{numberFmt(position.volume)}</TableCell>
                            <TableCell sx={{ fontSize: '0.7rem' }}>
                              {new Date(position.brokerTime).toLocaleString()}
                            </TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.7rem' }}>{numberFmt(position.openPrice)}</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.7rem' }}>{numberFmt(position.stopLoss)}</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.7rem' }}>{numberFmt(position.takeProfit)}</TableCell>
                            <TableCell sx={{ fontSize: '0.7rem' }}>{stringFmt(position.brokerComment)}</TableCell>
                            <TableCell align="right">
                              <Chip
                                size="small"
                                label={numberFmt(position.liveProfit)}
                                sx={{
                                  fontWeight: 700,
                                  fontSize: '0.7rem',
                                  bgcolor: (theme) =>
                                    isProfit
                                      ? theme.palette.success.main + '20'
                                      : theme.palette.error.main + '20',
                                  color: (theme) =>
                                    isProfit ? theme.palette.success.main : theme.palette.error.main,
                                  minWidth: 50,
                                }}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.5, mt: 1, fontSize: '0.75rem' }}>
                Pending Orders
              </Typography>
              {pendingOrders.length === 0 ? (
                <Box
                  sx={{
                    py: 1.5,
                    textAlign: 'center',
                    color: 'text.secondary',
                    fontStyle: 'italic',
                    fontSize: '0.7rem',
                  }}
                >
                  No pending orders
                </Box>
              ) : (
                <TableContainer
                  component={Paper}
                  sx={{
                    borderRadius: 1,
                    boxShadow: 0,
                  }}
                >
                  <Table size="small" aria-label="pending orders table">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontSize: '0.7rem' }}>Symbol</TableCell>
                        <TableCell sx={{ fontSize: '0.7rem' }}>Type</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.7rem' }}>Lot</TableCell>
                        <TableCell sx={{ fontSize: '0.7rem' }}>Time</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.7rem' }}>SL</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.7rem' }}>TP</TableCell>
                        <TableCell sx={{ fontSize: '0.7rem' }}>Comment</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {pendingOrders.map((order) => (
                        <TableRow key={order.id} hover>
                          <TableCell sx={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '0.7rem' }}>
                            {order.symbol}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.7rem' }}>{order.type}</TableCell>
                          <TableCell align="right" sx={{ fontSize: '0.7rem' }}>{numberFmt(order.currentVolume)}</TableCell>
                          <TableCell sx={{ fontSize: '0.7rem' }}>
                            {new Date(order.time).toLocaleString()}
                          </TableCell>
                          <TableCell align="right" sx={{ fontSize: '0.7rem' }}>{numberFmt(order.stopLoss)}</TableCell>
                          <TableCell align="right" sx={{ fontSize: '0.7rem' }}>{numberFmt(order.takeProfit)}</TableCell>
                          <TableCell sx={{ fontSize: '0.7rem' }}>{stringFmt(order.brokerComment)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
            }}
          >
            <Card
              sx={{
                borderRadius: 2,
                boxShadow: 3,
                bgcolor: 'background.paper',
                width: '100%',
                height: '30%',
              }}
            >
              <CardContent sx={{ p: 0.8 }}>
                <Typography variant="h6" fontWeight={700} gutterBottom fontSize="0.7rem">
                  Account Information
                </Typography>
                <Divider sx={{ mb: 0.8 }} />
                { !accountInformation && !accountDetails ? (
                  <Box
                    sx={{
                      py: 1,
                      textAlign: 'center',
                      color: 'text.secondary',
                      fontStyle: 'italic',
                      fontSize: '0.65rem',
                    }}
                  >
                    No account information
                  </Box>
                ) : (
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 0.2,
                    }}
                  >
                    {accountInformation && (
                      <>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Platform:</Typography>
                          <Typography fontSize="0.65rem">{stringFmt(accountInformation.platform)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Type:</Typography>
                          <Typography fontSize="0.65rem">{stringFmt(accountInformation.type)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Broker:</Typography>
                          <Typography fontSize="0.65rem">{stringFmt(accountInformation.broker)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Currency:</Typography>
                          <Typography fontSize="0.65rem">{stringFmt(accountInformation.currency)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Server:</Typography>
                          <Typography fontSize="0.65rem">{stringFmt(accountInformation.server)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Balance:</Typography>
                          <Typography fontSize="0.65rem">{numberFmt(accountInformation.balance)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Equity:</Typography>
                          <Typography fontSize="0.65rem">{numberFmt(accountInformation.equity)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Margin:</Typography>
                          <Typography fontSize="0.65rem">{numberFmt(accountInformation.margin)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Free Margin:</Typography>
                          <Typography fontSize="0.65rem">{numberFmt(accountInformation.freeMargin)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Leverage:</Typography>
                          <Typography fontSize="0.65rem">{stringFmt(accountInformation.leverage)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Margin Level:</Typography>
                          <Typography fontSize="0.65rem">{numberFmt(accountInformation.marginLevel)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Margin Mode:</Typography>
                          <Typography fontSize="0.65rem">{stringFmt(accountInformation.marginMode)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Name:</Typography>
                          <Typography fontSize="0.65rem">{stringFmt(accountInformation.name)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Login:</Typography>
                          <Typography fontSize="0.65rem">{stringFmt(accountInformation.login)}</Typography>
                        </Box>
                      </>
                    )}
                    {accountDetails && (
                      <>
                        <Divider sx={{ my: 0.8 }} />
                        <Typography variant="subtitle2" fontSize="0.7rem">Account Settings</Typography>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Splitting Target:</Typography>
                          <Typography fontSize="0.65rem">{numberFmt(accountDetails.splittingTarget)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Max Position Limit:</Typography>
                          <Typography fontSize="0.65rem">{numberFmt(accountDetails.maxPositionLimit)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Risk Percentage:</Typography>
                          <Typography fontSize="0.65rem">{numberFmt(accountDetails.riskPercentage)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Auto Lot Size Set:</Typography>
                          <Typography fontSize="0.65rem">{stringFmt(accountDetails.autoLotSizeSet)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Daily Risk Percentage:</Typography>
                          <Typography fontSize="0.65rem">{numberFmt(accountDetails.dailyRiskPercentage)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Remaining Daily Risk:</Typography>
                          <Typography fontSize="0.65rem">{numberFmt(accountDetails.remainingDailyRisk)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography fontSize="0.65rem">Timezone:</Typography>
                          <Typography fontSize="0.65rem">{stringFmt(accountDetails.timezone)}</Typography>
                        </Box>
                      </>
                    )}
                  </Box>
                )}
              </CardContent>
            </Card>
            <Card
              sx={{
                borderRadius: 2,
                boxShadow: 3,
                bgcolor: 'background.paper',
                width: '100%',
                height: '70%',
              }}
            >
              <CardContent sx={{ p: 0.8 }}>
                <Typography
                  variant="h6"
                  gutterBottom
                  color="text.primary"
                  fontWeight={700}
                  textAlign="center"
                  fontSize="0.7rem"
                >
                  Place Order
                </Typography>
                {error && (
                  <Alert severity="error" sx={{ mb: 0.8, borderRadius: 1, fontSize: '0.65rem' }}>
                    {error}
                  </Alert>
                )}
                <Box component="form" noValidate autoComplete="off">
                  <TextField
                    fullWidth
                    label="Symbol (e.g., EURUSD)"
                    name="symbol"
                    variant="outlined"
                    value={orderData.symbol}
                    onChange={handleOrderChange}
                    sx={{ mb: 0.8, '& .MuiOutlinedInput-root': { borderRadius: 1 }, '& .MuiInputLabel-root': { fontSize: '0.65rem' }, '& .MuiInputBase-input': { fontSize: '0.65rem' } }}
                    inputProps={{ style: { textTransform: 'uppercase', letterSpacing: 0.5 } }}
                  />
                  <FormControl fullWidth sx={{ mb: 0.8 }}>
                    <InputLabel id="entry-type-label" sx={{ fontSize: '0.65rem' }}>Entry Type</InputLabel>
                    <Select
                      labelId="entry-type-label"
                      name="entryType"
                      value={orderData.entryType}
                      onChange={handleOrderChange}
                      label="Entry Type"
                      sx={{ borderRadius: 1, '& .MuiSelect-select': { fontSize: '0.65rem' } }}
                    >
                      <MenuItem value="buy" sx={{ fontSize: '0.65rem' }}>Buy</MenuItem>
                      <MenuItem value="sell" sx={{ fontSize: '0.65rem' }}>Sell</MenuItem>
                    </Select>
                  </FormControl>
                  <FormControl fullWidth sx={{ mb: 0.8 }}>
                    <InputLabel id="order-type-label" sx={{ fontSize: '0.65rem' }}>Order Type</InputLabel>
                    <Select
                      labelId="order-type-label"
                      name="orderType"
                      value={orderData.orderType}
                      onChange={handleOrderChange}
                      label="Order Type"
                      sx={{ borderRadius: 1, '& .MuiSelect-select': { fontSize: '0.65rem' } }}
                    >
                      <MenuItem value="Market" sx={{ fontSize: '0.65rem' }}>Market</MenuItem>
                      <MenuItem value="Stop" sx={{ fontSize: '0.65rem' }}>Stop</MenuItem>
                      <MenuItem value="Limit" sx={{ fontSize: '0.65rem' }}>Limit</MenuItem>
                    </Select>
                  </FormControl>
                  {(orderData.orderType === 'Stop' || orderData.orderType === 'Limit') && (
                    <TextField
                      fullWidth
                      label="Entry Price"
                      name="entryPrice"
                      type="number"
                      variant="outlined"
                      value={orderData.entryPrice}
                      onChange={handleOrderChange}
                      sx={{ mb: 0.8, '& .MuiOutlinedInput-root': { borderRadius: 1 }, '& .MuiInputLabel-root': { fontSize: '0.65rem' }, '& .MuiInputBase-input': { fontSize: '0.65rem' } }}
                      inputProps={{ step: '0.01', inputMode: 'decimal' }}
                    />
                  )}
                  <TextField
                    fullWidth
                    label="Lot Size"
                    name="lotSize"
                    type="number"
                    variant="outlined"
                    value={orderData.lotSize}
                    onChange={handleOrderChange}
                    sx={{ mb: 0.8, '& .MuiOutlinedInput-root': { borderRadius: 1 }, '& .MuiInputLabel-root': { fontSize: '0.65rem' }, '& .MuiInputBase-input': { fontSize: '0.65rem' } }}
                    inputProps={{ min: 0, step: '0.01', inputMode: 'decimal' }}
                  />
                  <TextField
                    fullWidth
                    label="Stop Loss"
                    name="stopLoss"
                    type="number"
                    variant="outlined"
                    value={orderData.stopLoss}
                    onChange={handleOrderChange}
                    sx={{ mb: 0.8, '& .MuiOutlinedInput-root': { borderRadius: 1 }, '& .MuiInputLabel-root': { fontSize: '0.65rem' }, '& .MuiInputBase-input': { fontSize: '0.65rem' } }}
                    inputProps={{ step: '0.01', inputMode: 'decimal' }}
                  />
                  <TextField
                    fullWidth
                    label="Take Profit (optional, comma-separated)"
                    name="takeProfit"
                    type="text"
                    variant="outlined"
                    value={orderData.takeProfit}
                    onChange={handleOrderChange}
                    sx={{ mb: 0.8, '& .MuiOutlinedInput-root': { borderRadius: 1 }, '& .MuiInputLabel-root': { fontSize: '0.65rem' }, '& .MuiInputBase-input': { fontSize: '0.65rem' } }}
                    inputProps={{ inputMode: 'decimal' }}
                  />
                  <TextField
                    fullWidth
                    label="Comment (optional)"
                    name="comment"
                    variant="outlined"
                    value={orderData.comment}
                    onChange={handleOrderChange}
                    sx={{ mb: 0.8, '& .MuiOutlinedInput-root': { borderRadius: 1 }, '& .MuiInputLabel-root': { fontSize: '0.65rem' }, '& .MuiInputBase-input': { fontSize: '0.65rem' } }}
                  />
                  <Button
                    fullWidth
                    variant="contained"
                    color="primary"
                    onClick={handleVerifyOrder}
                    disabled={!isFormValid()}
                    sx={{
                      py: 0.6,
                      borderRadius: 1,
                      textTransform: 'none',
                      fontWeight: 700,
                      letterSpacing: 0.3,
                      fontSize: '0.65rem',
                    }}
                  >
                    Place Order
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Box>
      </Box>
      <Dialog open={showConfirmation} onClose={handleCancelConfirmation}>
        <DialogTitle sx={{ fontSize: '0.85rem', fontWeight: 700 }}>Confirm Order</DialogTitle>
        <DialogContent>
          {verifiedData ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Typography sx={{ fontSize: '0.65rem' }}>Symbol: {verifiedData.symbol}</Typography>
              <Typography sx={{ fontSize: '0.65rem' }}>Side: {verifiedData.side}</Typography>
              <Typography sx={{ fontSize: '0.65rem' }}>Order Type: {verifiedData.orderType}</Typography>
              <Typography sx={{ fontSize: '0.65rem' }}>Quantity: {numberFmt(verifiedData.quantity)}</Typography>
              <Typography sx={{ fontSize: '0.65rem' }}>Stop Loss: {numberFmt(verifiedData.stopLoss)}</Typography>
              <Typography sx={{ fontSize: '0.65rem' }}>
                Take Profit: {Array.isArray(verifiedData.takeProfit) ? verifiedData.takeProfit.map(numberFmt).join(', ') : numberFmt(verifiedData.takeProfit)}
              </Typography>
              {verifiedData.entryPrice && <Typography sx={{ fontSize: '0.65rem' }}>Entry Price: {numberFmt(verifiedData.entryPrice)}</Typography>}
              {verifiedData.comment && <Typography sx={{ fontSize: '0.65rem' }}>Comment: {verifiedData.comment}</Typography>}
              <Typography sx={{ fontSize: '0.65rem' }}>Max Loss: {numberFmt(verifiedData.maxLoss)}</Typography>
              <Typography sx={{ fontSize: '0.65rem' }}>Max Profit: {numberFmt(verifiedData.maxProfit)}</Typography>
            </Box>
          ) : (
            <Typography sx={{ fontSize: '0.65rem' }}>Verifying order...</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleCancelConfirmation}
            color="secondary"
            sx={{ fontSize: '0.65rem', textTransform: 'none' }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmOrder}
            color="primary"
            sx={{ fontSize: '0.65rem', textTransform: 'none' }}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default Dashboard;








/*
import React, { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import { verifyToken, placeOrder, verifyOrder, initializeSocket, getUserAccounts } from '../api/api';
import { ThemeContext } from '../main';
import Header from './Header';
import _ from 'lodash'; // Added Lodash import for debouncing

interface Position {
  id: string;
  platform: string;
  type: 'BUY' | 'SELL' | 'LIMIT';
  symbol: string;
  brokerTime: string;
  openPrice: number;
  volume: number;
  brokerComment: string;
  stopLoss?: number;
  takeProfit?: number;
  liveProfit: number;
}

interface PendingOrder {
  id: string;
  type: string;
  symbol: string;
  time: string;
  currentVolume: number;
  brokerComment: string;
  stopLoss?: number;
  takeProfit?: number;
}

interface AccountInformation {
  platform: string;
  type: string;
  broker: string;
  currency: string;
  server: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  leverage: number;
  marginLevel: number;
  marginMode: string;
  name: string;
  login: number;
}

interface Account {
  _id: string;
  brokerName: string;
  accountId: string;
  maxPositionLimit?: number;
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

const numberFmt = (n: number | undefined | null) =>
  typeof n === 'number' && !isNaN(n) ? n.toFixed(2) : 'undefined';

const stringFmt = (v: any) => v != null ? String(v) : 'undefined';

const Dashboard: React.FC = () => {
  useContext(ThemeContext);
  const [error, setError] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedMetaApiAccountId, setSelectedMetaApiAccountId] = useState<string>('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [orderData, setOrderData] = useState({
    symbol: '',
    entryType: 'buy' as 'buy' | 'sell',
    lotSize: '',
    stopLoss: '',
    takeProfit: '',
    orderType: 'Market' as 'Market' | 'Stop' | 'Limit',
    comment: '',
    entryPrice: '',
  });
  const [positions, setPositions] = useState<Position[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [accountInformation, setAccountInformation] = useState<AccountInformation | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [verifiedData, setVerifiedData] = useState<VerifiedOrderData | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const checkToken = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('No token found, redirecting to login');
        navigate('/login');
        return;
      }
      try {
        await verifyToken();
        setError('');
        const accountsData = await getUserAccounts();
        setAccounts(accountsData);
        console.log('Accounts:', accountsData);
        if (accountsData.length > 0 && !selectedAccountId) {
          setSelectedAccountId(accountsData[0]._id);
          setSelectedMetaApiAccountId(accountsData[0].accountId);
        }
      } catch (err: any) {
        console.error('Token verification failed:', err, 'Response:', err.response?.data);
        localStorage.removeItem('token');
        setError('Session expired. Please log in again.');
        navigate('/login');
      }
    };
    checkToken();
  }, [navigate]);

  useEffect(() => {
    if (!selectedAccountId) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    const socket = initializeSocket(token, selectedAccountId);

    socket.on('connect', () => {
      console.log(`Socket.IO connected for account ${selectedAccountId}`);
    });

    socket.on('live-data', (data: { accountId: string; positionData: { livePositions: Position[], pendingOrders: PendingOrder[], accountInformation: AccountInformation } }) => {
      //  console.log('Live data received:', data);
      if (data.accountId !== selectedMetaApiAccountId) {
        console.log(`Ignoring live-data for account ${data.accountId}, expected ${selectedMetaApiAccountId}`);
        return;
      }
      if (data.positionData && Array.isArray(data.positionData.livePositions)) {
        setPositions(data.positionData.livePositions);
      }
      setPendingOrders(data.positionData.pendingOrders || []);
      setAccountInformation(data.positionData.accountInformation || null);
    });

    socket.on('order-response', (response: { message?: string; positionIds?: string[]; error?: string }) => {
      console.log(`[${new Date().toISOString()}] Order response in Dashboard:`, response);
      if (response.error) {
        setError(response.error);
        console.error('Order failed:', response.error);
      } else {
        setError('');
        setOrderData({ symbol: '', entryType: 'buy', lotSize: '', stopLoss: '', takeProfit: '', orderType: 'Market', comment: '', entryPrice: '' });
        console.log('Order placed successfully:', response);
      }
      setShowConfirmation(false); // Close dialog after order response
    });

    socket.on('verify-order-response', (response: { data?: VerifiedOrderData; error?: string }) => {
      console.log(`[${new Date().toISOString()}] Verify order response in Dashboard:`, response);
      if (response.error) {
        setError(response.error);
        console.error('Verify order failed:', response.error);
      } else if (response.data) {
        setVerifiedData(response.data);
        setShowConfirmation(true);
        setError('');
      }
    });

    socket.on('equity-balance', (data: { accountId: string; equity: number; balance: number }) => {
      console.log(`[${new Date().toISOString()}] Equity/Balance:`, data);
      if (data.accountId === selectedMetaApiAccountId) {
        setAccountInformation(prev => ({
          ...prev,
          equity: data.equity,
          balance: data.balance,
        } as AccountInformation));
      } else {
        console.log(`Ignoring equity-balance for account ${data.accountId}, expected ${selectedMetaApiAccountId}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket.IO disconnected for account ${selectedAccountId}`);
    });

    return () => {
      socket.off('live-data');
      socket.off('order-response');
      socket.off('verify-order-response');
      socket.off('equity-balance');
      socket.off('connect');
      socket.off('disconnect');
      socket.disconnect();
    };
  }, [selectedAccountId, selectedMetaApiAccountId]);

  const handleOrderChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent
  ) => {
    const { name, value } = e.target as HTMLInputElement;
    setOrderData((prev) => ({ ...prev, [name]: value }));
  };

  const handleVerifyOrder = _.debounce(async () => {
    try {
      const takeProfitValue = orderData.takeProfit.trim();
      const takeProfit = takeProfitValue
        ? takeProfitValue.split(',').map(Number).filter((n) => !isNaN(n))
        : undefined;
      const data = {
        _id: selectedAccountId,
        symbol: orderData.symbol.trim().toUpperCase(),
        entryType: orderData.entryType,
        lotSize: orderData.lotSize ? Number(orderData.lotSize) : undefined,
        stopLoss: orderData.stopLoss ? Number(orderData.stopLoss) : undefined,
        takeProfit: takeProfit && takeProfit.length > 0 ? (takeProfit.length === 1 ? takeProfit[0] : takeProfit) : undefined,
        orderType: orderData.orderType,
        comment: orderData.comment.trim() || undefined,
        entryPrice: orderData.orderType !== 'Market' && orderData.entryPrice ? Number(orderData.entryPrice) : undefined,
      };

      console.log('Verifying order:', data);
      await verifyOrder(data); // Emit verify-order via socket
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to verify order.';
      console.error(`[${new Date().toISOString()}] Verify order failed:`, err);
      setError(errorMessage);
    }
  }, 3500); // 500ms debounce delay

  const handleConfirmOrder = _.debounce(async () => {
    try {
      const takeProfitValue = orderData.takeProfit.trim();
      const takeProfit = takeProfitValue
        ? takeProfitValue.split(',').map(Number).filter((n) => !isNaN(n))
        : undefined;
      const data = {
        _id: selectedAccountId,
        symbol: orderData.symbol.trim().toUpperCase(),
        entryType: orderData.entryType,
        lotSize: orderData.lotSize ? Number(orderData.lotSize) : undefined,
        stopLoss: orderData.stopLoss ? Number(orderData.stopLoss) : undefined,
        takeProfit: takeProfit && takeProfit.length > 0 ? (takeProfit.length === 1 ? takeProfit[0] : takeProfit) : undefined,
        orderType: orderData.orderType,
        comment: orderData.comment.trim() || undefined,
        entryPrice: orderData.orderType !== 'Market' && orderData.entryPrice ? Number(orderData.entryPrice) : undefined,
      };

      console.log('Submitting order (validated):', data);
      await placeOrder(data); // Submit order via socket
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to place order.';
      console.error(`[${new Date().toISOString()}] Place order failed:`, err);
      setError(errorMessage);
      setShowConfirmation(false);
    }
  }, 2500); // 500ms debounce delay

  const handleCancelConfirmation = () => {
    setShowConfirmation(false);
    setVerifiedData(null);
  };

  const handleAccountChange = (accountId: string) => {
    setSelectedAccountId(accountId);
    const account = accounts.find((acc) => acc._id === accountId);
    setSelectedMetaApiAccountId(account ? account.accountId : '');
    console.log('Selected MongoDB _id:', accountId, 'MetaApi accountId:', account ? account.accountId : '');
    setPositions([]);
    setPendingOrders([]);
    setAccountInformation(null);
  };

  const isFormValid = () => {
    if (!selectedAccountId) return false;
    if (!orderData.symbol.trim()) return false;
    if (!orderData.lotSize || Number(orderData.lotSize) <= 0) return false;
    if ((orderData.orderType === 'Stop' || orderData.orderType === 'Limit') && (!orderData.entryPrice || Number(orderData.entryPrice) <= 0)) return false;
    return true;
  };

  return (
    <>
      <Header selectedAccountId={selectedAccountId} onAccountChange={handleAccountChange} />
      <Box
        sx={{
          p: 1.5,
          bgcolor: 'background.default',
          minHeight: '100vh',
        }}
      >
        <Box
          sx={{
            mx: 'auto',
            maxWidth: 1400,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '70% 30%' },
            gap: 2,
            alignItems: 'start',
          }}
        >
          <Card
            sx={{
              borderRadius: 2,
              boxShadow: 3,
              bgcolor: 'background.paper',
            }}
          >
            <CardContent sx={{ p: 1 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mb: 1,
                }}
              >
                <Box>
                  <Typography variant="h6" fontWeight={700} fontSize="0.85rem">
                    Live Positions and Pending Orders
                  </Typography>
                  <Typography variant="body2" color="text.secondary" fontSize="0.7rem">
                    Account: {selectedMetaApiAccountId || '—'}
                  </Typography>
                </Box>
              </Box>
              <Divider sx={{ mb: 1 }} />
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.5, fontSize: '0.75rem' }}>
                Live Positions
              </Typography>
              {positions.length === 0 ? (
                <Box
                  sx={{
                    py: 1.5,
                    textAlign: 'center',
                    color: 'text.secondary',
                    fontStyle: 'italic',
                    fontSize: '0.7rem',
                  }}
                >
                  No open positions
                </Box>
              ) : (
                <TableContainer
                  component={Paper}
                  sx={{
                    borderRadius: 1,
                    boxShadow: 0,
                  }}
                >
                  <Table size="small" aria-label="positions table">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontSize: '0.7rem' }}>Symbol</TableCell>
                        <TableCell sx={{ fontSize: '0.7rem' }}>Type</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.7rem' }}>Lot</TableCell>
                        <TableCell sx={{ fontSize: '0.7rem' }}>Entry Time</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.7rem' }}>Open Price</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.7rem' }}>SL</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.7rem' }}>TP</TableCell>
                        <TableCell sx={{ fontSize: '0.7rem' }}>Comment</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.7rem' }}>P/L</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {positions.map((position) => {
                        const isProfit = position.liveProfit >= 0;
                        return (
                          <TableRow key={position.id} hover>
                            <TableCell sx={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '0.7rem' }}>
                              {position.symbol}
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.7rem' }}>{position.type}</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.7rem' }}>{numberFmt(position.volume)}</TableCell>
                            <TableCell sx={{ fontSize: '0.7rem' }}>
                              {new Date(position.brokerTime).toLocaleString()}
                            </TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.7rem' }}>{numberFmt(position.openPrice)}</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.7rem' }}>{numberFmt(position.stopLoss)}</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.7rem' }}>{numberFmt(position.takeProfit)}</TableCell>
                            <TableCell sx={{ fontSize: '0.7rem' }}>{stringFmt(position.brokerComment)}</TableCell>
                            <TableCell align="right">
                              <Chip
                                size="small"
                                label={numberFmt(position.liveProfit)}
                                sx={{
                                  fontWeight: 700,
                                  fontSize: '0.7rem',
                                  bgcolor: (theme) =>
                                    isProfit
                                      ? theme.palette.success.main + '20'
                                      : theme.palette.error.main + '20',
                                  color: (theme) =>
                                    isProfit ? theme.palette.success.main : theme.palette.error.main,
                                  minWidth: 50,
                                }}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.5, mt: 1, fontSize: '0.75rem' }}>
                Pending Orders
              </Typography>
              {pendingOrders.length === 0 ? (
                <Box
                  sx={{
                    py: 1.5,
                    textAlign: 'center',
                    color: 'text.secondary',
                    fontStyle: 'italic',
                    fontSize: '0.7rem',
                  }}
                >
                  No pending orders
                </Box>
              ) : (
                <TableContainer
                  component={Paper}
                  sx={{
                    borderRadius: 1,
                    boxShadow: 0,
                  }}
                >
                  <Table size="small" aria-label="pending orders table">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontSize: '0.7rem' }}>Symbol</TableCell>
                        <TableCell sx={{ fontSize: '0.7rem' }}>Type</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.7rem' }}>Lot</TableCell>
                        <TableCell sx={{ fontSize: '0.7rem' }}>Time</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.7rem' }}>SL</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.7rem' }}>TP</TableCell>
                        <TableCell sx={{ fontSize: '0.7rem' }}>Comment</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {pendingOrders.map((order) => (
                        <TableRow key={order.id} hover>
                          <TableCell sx={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '0.7rem' }}>
                            {order.symbol}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.7rem' }}>{order.type}</TableCell>
                          <TableCell align="right" sx={{ fontSize: '0.7rem' }}>{numberFmt(order.currentVolume)}</TableCell>
                          <TableCell sx={{ fontSize: '0.7rem' }}>
                            {new Date(order.time).toLocaleString()}
                          </TableCell>
                          <TableCell align="right" sx={{ fontSize: '0.7rem' }}>{numberFmt(order.stopLoss)}</TableCell>
                          <TableCell align="right" sx={{ fontSize: '0.7rem' }}>{numberFmt(order.takeProfit)}</TableCell>
                          <TableCell sx={{ fontSize: '0.7rem' }}>{stringFmt(order.brokerComment)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
            }}
          >
            <Card
              sx={{
                borderRadius: 2,
                boxShadow: 3,
                bgcolor: 'background.paper',
                width: '100%',
                height: '30%',
              }}
            >
              <CardContent sx={{ p: 0.8 }}>
                <Typography variant="h6" fontWeight={700} gutterBottom fontSize="0.7rem">
                  Account Information
                </Typography>
                <Divider sx={{ mb: 0.8 }} />
                { !accountInformation ? (
                  <Box
                    sx={{
                      py: 1,
                      textAlign: 'center',
                      color: 'text.secondary',
                      fontStyle: 'italic',
                      fontSize: '0.65rem',
                    }}
                  >
                    No account information
                  </Box>
                ) : (
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 0.2,
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography fontSize="0.65rem">Platform:</Typography>
                      <Typography fontSize="0.65rem">{stringFmt(accountInformation.platform)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography fontSize="0.65rem">Type:</Typography>
                      <Typography fontSize="0.65rem">{stringFmt(accountInformation.type)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography fontSize="0.65rem">Broker:</Typography>
                      <Typography fontSize="0.65rem">{stringFmt(accountInformation.broker)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography fontSize="0.65rem">Currency:</Typography>
                      <Typography fontSize="0.65rem">{stringFmt(accountInformation.currency)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography fontSize="0.65rem">Server:</Typography>
                      <Typography fontSize="0.65rem">{stringFmt(accountInformation.server)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography fontSize="0.65rem">Balance:</Typography>
                      <Typography fontSize="0.65rem">{numberFmt(accountInformation.balance)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography fontSize="0.65rem">Equity:</Typography>
                      <Typography fontSize="0.65rem">{numberFmt(accountInformation.equity)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography fontSize="0.65rem">Margin:</Typography>
                      <Typography fontSize="0.65rem">{numberFmt(accountInformation.margin)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography fontSize="0.65rem">Free Margin:</Typography>
                      <Typography fontSize="0.65rem">{numberFmt(accountInformation.freeMargin)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography fontSize="0.65rem">Leverage:</Typography>
                      <Typography fontSize="0.65rem">{stringFmt(accountInformation.leverage)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography fontSize="0.65rem">Margin Level:</Typography>
                      <Typography fontSize="0.65rem">{numberFmt(accountInformation.marginLevel)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography fontSize="0.65rem">Margin Mode:</Typography>
                      <Typography fontSize="0.65rem">{stringFmt(accountInformation.marginMode)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography fontSize="0.65rem">Name:</Typography>
                      <Typography fontSize="0.65rem">{stringFmt(accountInformation.name)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography fontSize="0.65rem">Login:</Typography>
                      <Typography fontSize="0.65rem">{stringFmt(accountInformation.login)}</Typography>
                    </Box>
                  </Box>
                )}
              </CardContent>
            </Card>
            <Card
              sx={{
                borderRadius: 2,
                boxShadow: 3,
                bgcolor: 'background.paper',
                width: '100%',
                height: '70%',
              }}
            >
              <CardContent sx={{ p: 0.8 }}>
                <Typography
                  variant="h6"
                  gutterBottom
                  color="text.primary"
                  fontWeight={700}
                  textAlign="center"
                  fontSize="0.7rem"
                >
                  Place Order
                </Typography>
                {error && (
                  <Alert severity="error" sx={{ mb: 0.8, borderRadius: 1, fontSize: '0.65rem' }}>
                    {error}
                  </Alert>
                )}
                <Box component="form" noValidate autoComplete="off">
                  <TextField
                    fullWidth
                    label="Symbol (e.g., EURUSD)"
                    name="symbol"
                    variant="outlined"
                    value={orderData.symbol}
                    onChange={handleOrderChange}
                    sx={{ mb: 0.8, '& .MuiOutlinedInput-root': { borderRadius: 1 }, '& .MuiInputLabel-root': { fontSize: '0.65rem' }, '& .MuiInputBase-input': { fontSize: '0.65rem' } }}
                    inputProps={{ style: { textTransform: 'uppercase', letterSpacing: 0.5 } }}
                  />
                  <FormControl fullWidth sx={{ mb: 0.8 }}>
                    <InputLabel id="entry-type-label" sx={{ fontSize: '0.65rem' }}>Entry Type</InputLabel>
                    <Select
                      labelId="entry-type-label"
                      name="entryType"
                      value={orderData.entryType}
                      onChange={handleOrderChange}
                      label="Entry Type"
                      sx={{ borderRadius: 1, '& .MuiSelect-select': { fontSize: '0.65rem' } }}
                    >
                      <MenuItem value="buy" sx={{ fontSize: '0.65rem' }}>Buy</MenuItem>
                      <MenuItem value="sell" sx={{ fontSize: '0.65rem' }}>Sell</MenuItem>
                    </Select>
                  </FormControl>
                  <FormControl fullWidth sx={{ mb: 0.8 }}>
                    <InputLabel id="order-type-label" sx={{ fontSize: '0.65rem' }}>Order Type</InputLabel>
                    <Select
                      labelId="order-type-label"
                      name="orderType"
                      value={orderData.orderType}
                      onChange={handleOrderChange}
                      label="Order Type"
                      sx={{ borderRadius: 1, '& .MuiSelect-select': { fontSize: '0.65rem' } }}
                    >
                      <MenuItem value="Market" sx={{ fontSize: '0.65rem' }}>Market</MenuItem>
                      <MenuItem value="Stop" sx={{ fontSize: '0.65rem' }}>Stop</MenuItem>
                      <MenuItem value="Limit" sx={{ fontSize: '0.65rem' }}>Limit</MenuItem>
                    </Select>
                  </FormControl>
                  {(orderData.orderType === 'Stop' || orderData.orderType === 'Limit') && (
                    <TextField
                      fullWidth
                      label="Entry Price"
                      name="entryPrice"
                      type="number"
                      variant="outlined"
                      value={orderData.entryPrice}
                      onChange={handleOrderChange}
                      sx={{ mb: 0.8, '& .MuiOutlinedInput-root': { borderRadius: 1 }, '& .MuiInputLabel-root': { fontSize: '0.65rem' }, '& .MuiInputBase-input': { fontSize: '0.65rem' } }}
                      inputProps={{ step: '0.01', inputMode: 'decimal' }}
                    />
                  )}
                  <TextField
                    fullWidth
                    label="Lot Size"
                    name="lotSize"
                    type="number"
                    variant="outlined"
                    value={orderData.lotSize}
                    onChange={handleOrderChange}
                    sx={{ mb: 0.8, '& .MuiOutlinedInput-root': { borderRadius: 1 }, '& .MuiInputLabel-root': { fontSize: '0.65rem' }, '& .MuiInputBase-input': { fontSize: '0.65rem' } }}
                    inputProps={{ min: 0, step: '0.01', inputMode: 'decimal' }}
                  />
                  <TextField
                    fullWidth
                    label="Stop Loss"
                    name="stopLoss"
                    type="number"
                    variant="outlined"
                    value={orderData.stopLoss}
                    onChange={handleOrderChange}
                    sx={{ mb: 0.8, '& .MuiOutlinedInput-root': { borderRadius: 1 }, '& .MuiInputLabel-root': { fontSize: '0.65rem' }, '& .MuiInputBase-input': { fontSize: '0.65rem' } }}
                    inputProps={{ step: '0.01', inputMode: 'decimal' }}
                  />
                  <TextField
                    fullWidth
                    label="Take Profit (optional, comma-separated)"
                    name="takeProfit"
                    type="text"
                    variant="outlined"
                    value={orderData.takeProfit}
                    onChange={handleOrderChange}
                    sx={{ mb: 0.8, '& .MuiOutlinedInput-root': { borderRadius: 1 }, '& .MuiInputLabel-root': { fontSize: '0.65rem' }, '& .MuiInputBase-input': { fontSize: '0.65rem' } }}
                    inputProps={{ inputMode: 'decimal' }}
                  />
                  <TextField
                    fullWidth
                    label="Comment (optional)"
                    name="comment"
                    variant="outlined"
                    value={orderData.comment}
                    onChange={handleOrderChange}
                    sx={{ mb: 0.8, '& .MuiOutlinedInput-root': { borderRadius: 1 }, '& .MuiInputLabel-root': { fontSize: '0.65rem' }, '& .MuiInputBase-input': { fontSize: '0.65rem' } }}
                  />
                  <Button
                    fullWidth
                    variant="contained"
                    color="primary"
                    onClick={handleVerifyOrder}
                    disabled={!isFormValid()}
                    sx={{
                      py: 0.6,
                      borderRadius: 1,
                      textTransform: 'none',
                      fontWeight: 700,
                      letterSpacing: 0.3,
                      fontSize: '0.65rem',
                    }}
                  >
                    Place Order
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Box>
      </Box>
      <Dialog open={showConfirmation} onClose={handleCancelConfirmation}>
        <DialogTitle sx={{ fontSize: '0.85rem', fontWeight: 700 }}>Confirm Order</DialogTitle>
        <DialogContent>
          {verifiedData ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Typography sx={{ fontSize: '0.65rem' }}>Symbol: {verifiedData.symbol}</Typography>
              <Typography sx={{ fontSize: '0.65rem' }}>Side: {verifiedData.side}</Typography>
              <Typography sx={{ fontSize: '0.65rem' }}>Order Type: {verifiedData.orderType}</Typography>
              <Typography sx={{ fontSize: '0.65rem' }}>Quantity: {numberFmt(verifiedData.quantity)}</Typography>
              <Typography sx={{ fontSize: '0.65rem' }}>Stop Loss: {numberFmt(verifiedData.stopLoss)}</Typography>
              <Typography sx={{ fontSize: '0.65rem' }}>
                Take Profit: {Array.isArray(verifiedData.takeProfit) ? verifiedData.takeProfit.map(numberFmt).join(', ') : numberFmt(verifiedData.takeProfit)}
              </Typography>
              {verifiedData.entryPrice && <Typography sx={{ fontSize: '0.65rem' }}>Entry Price: {numberFmt(verifiedData.entryPrice)}</Typography>}
              {verifiedData.comment && <Typography sx={{ fontSize: '0.65rem' }}>Comment: {verifiedData.comment}</Typography>}
              <Typography sx={{ fontSize: '0.65rem' }}>Max Loss: {numberFmt(verifiedData.maxLoss)}</Typography>
              <Typography sx={{ fontSize: '0.65rem' }}>Max Profit: {numberFmt(verifiedData.maxProfit)}</Typography>
            </Box>
          ) : (
            <Typography sx={{ fontSize: '0.65rem' }}>Verifying order...</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleCancelConfirmation}
            color="secondary"
            sx={{ fontSize: '0.65rem', textTransform: 'none' }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmOrder}
            color="primary"
            sx={{ fontSize: '0.65rem', textTransform: 'none' }}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default Dashboard;

*/


/*
import React, { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import { verifyToken, placeOrder, verifyOrder, initializeSocket, getUserAccounts } from '../api/api';
import { ThemeContext } from '../main';
import Header from './Header';

interface Position {
  id: string;
  platform: string;
  type: 'BUY' | 'SELL' | 'LIMIT';
  symbol: string;
  brokerTime: string;
  openPrice: number;
  volume: number;
  brokerComment: string;
  stopLoss?: number;
  takeProfit?: number;
  liveProfit: number;
}

interface PendingOrder {
  id: string;
  type: string;
  symbol: string;
  time: string;
  currentVolume: number;
  brokerComment: string;
  stopLoss?: number;
  takeProfit?: number;
}

interface AccountInformation {
  platform: string;
  type: string;
  broker: string;
  currency: string;
  server: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  leverage: number;
  marginLevel: number;
  marginMode: string;
  name: string;
  login: number;
}

interface Account {
  _id: string;
  brokerName: string;
  accountId: string;
  maxPositionLimit?: number;
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

const numberFmt = (n: number | undefined | null) =>
  typeof n === 'number' && !isNaN(n) ? n.toFixed(2) : 'undefined';

const stringFmt = (v: any) => v != null ? String(v) : 'undefined';

const Dashboard: React.FC = () => {
  useContext(ThemeContext);
  const [error, setError] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedMetaApiAccountId, setSelectedMetaApiAccountId] = useState<string>('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [orderData, setOrderData] = useState({
    symbol: '',
    entryType: 'buy' as 'buy' | 'sell',
    lotSize: '',
    stopLoss: '',
    takeProfit: '',
    orderType: 'Market' as 'Market' | 'Stop' | 'Limit',
    comment: '',
    entryPrice: '',
  });
  const [positions, setPositions] = useState<Position[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [accountInformation, setAccountInformation] = useState<AccountInformation | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [verifiedData, setVerifiedData] = useState<VerifiedOrderData | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const checkToken = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('No token found, redirecting to login');
        navigate('/login');
        return;
      }
      try {
        await verifyToken();
        setError('');
        const accountsData = await getUserAccounts();
        setAccounts(accountsData);
        console.log('Accounts:', accountsData);
        if (accountsData.length > 0 && !selectedAccountId) {
          setSelectedAccountId(accountsData[0]._id);
          setSelectedMetaApiAccountId(accountsData[0].accountId);
        }
      } catch (err: any) {
        console.error('Token verification failed:', err, 'Response:', err.response?.data);
        localStorage.removeItem('token');
        setError('Session expired. Please log in again.');
        navigate('/login');
      }
    };
    checkToken();
  }, [navigate]);

  useEffect(() => {
    if (!selectedAccountId) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    const socket = initializeSocket(token, selectedAccountId);

    socket.on('connect', () => {
      console.log(`Socket.IO connected for account ${selectedAccountId}`);
    });

    socket.on('live-data', (data: { accountId: string; positionData: { livePositions: Position[], pendingOrders: PendingOrder[], accountInformation: AccountInformation } }) => {
      //  console.log('Live data received:', data);
      if (data.accountId !== selectedMetaApiAccountId) {
        console.log(`Ignoring live-data for account ${data.accountId}, expected ${selectedMetaApiAccountId}`);
        return;
      }
      if (data.positionData && Array.isArray(data.positionData.livePositions)) {
        setPositions(data.positionData.livePositions);
      }
      setPendingOrders(data.positionData.pendingOrders || []);
      setAccountInformation(data.positionData.accountInformation || null);
    });

    socket.on('order-response', (response: { message?: string; positionIds?: string[]; error?: string }) => {
      console.log(`[${new Date().toISOString()}] Order response in Dashboard:`, response);
      if (response.error) {
        setError(response.error);
        console.error('Order failed:', response.error);
      } else {
        setError('');
        setOrderData({ symbol: '', entryType: 'buy', lotSize: '', stopLoss: '', takeProfit: '', orderType: 'Market', comment: '', entryPrice: '' });
        console.log('Order placed successfully:', response);
      }
      setShowConfirmation(false); // Close dialog after order response
    });

    socket.on('verify-order-response', (response: { data?: VerifiedOrderData; error?: string }) => {
      console.log(`[${new Date().toISOString()}] Verify order response in Dashboard:`, response);
      if (response.error) {
        setError(response.error);
        console.error('Verify order failed:', response.error);
      } else if (response.data) {
        setVerifiedData(response.data);
        setShowConfirmation(true);
        setError('');
      }
    });

    socket.on('equity-balance', (data: { accountId: string; equity: number; balance: number }) => {
      console.log(`[${new Date().toISOString()}] Equity/Balance:`, data);
      if (data.accountId === selectedMetaApiAccountId) {
        setAccountInformation(prev => ({
          ...prev,
          equity: data.equity,
          balance: data.balance,
        } as AccountInformation));
      } else {
        console.log(`Ignoring equity-balance for account ${data.accountId}, expected ${selectedMetaApiAccountId}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket.IO disconnected for account ${selectedAccountId}`);
    });

    return () => {
      socket.off('live-data');
      socket.off('order-response');
      socket.off('verify-order-response');
      socket.off('equity-balance');
      socket.off('connect');
      socket.off('disconnect');
      socket.disconnect();
    };
  }, [selectedAccountId, selectedMetaApiAccountId]);

  const handleOrderChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent
  ) => {
    const { name, value } = e.target as HTMLInputElement;
    setOrderData((prev) => ({ ...prev, [name]: value }));
  };

  const handleVerifyOrder = async () => {
    try {
      const takeProfitValue = orderData.takeProfit.trim();
      const takeProfit = takeProfitValue
        ? takeProfitValue.split(',').map(Number).filter((n) => !isNaN(n))
        : undefined;
      const data = {
        _id: selectedAccountId,
        symbol: orderData.symbol.trim().toUpperCase(),
        entryType: orderData.entryType,
        lotSize: orderData.lotSize ? Number(orderData.lotSize) : undefined,
        stopLoss: orderData.stopLoss ? Number(orderData.stopLoss) : undefined,
        takeProfit: takeProfit && takeProfit.length > 0 ? (takeProfit.length === 1 ? takeProfit[0] : takeProfit) : undefined,
        orderType: orderData.orderType,
        comment: orderData.comment.trim() || undefined,
        entryPrice: orderData.orderType !== 'Market' && orderData.entryPrice ? Number(orderData.entryPrice) : undefined,
      };

      console.log('Verifying order:', data);
      await verifyOrder(data); // Emit verify-order via socket
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to verify order.';
      console.error(`[${new Date().toISOString()}] Verify order failed:`, err);
      setError(errorMessage);
    }
  };

  const handleConfirmOrder = async () => {
    try {
      const takeProfitValue = orderData.takeProfit.trim();
      const takeProfit = takeProfitValue
        ? takeProfitValue.split(',').map(Number).filter((n) => !isNaN(n))
        : undefined;
      const data = {
        _id: selectedAccountId,
        symbol: orderData.symbol.trim().toUpperCase(),
        entryType: orderData.entryType,
        lotSize: orderData.lotSize ? Number(orderData.lotSize) : undefined,
        stopLoss: orderData.stopLoss ? Number(orderData.stopLoss) : undefined,
        takeProfit: takeProfit && takeProfit.length > 0 ? (takeProfit.length === 1 ? takeProfit[0] : takeProfit) : undefined,
        orderType: orderData.orderType,
        comment: orderData.comment.trim() || undefined,
        entryPrice: orderData.orderType !== 'Market' && orderData.entryPrice ? Number(orderData.entryPrice) : undefined,
      };

      console.log('Submitting order (validated):', data);
      await placeOrder(data); // Submit order via socket
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to place order.';
      console.error(`[${new Date().toISOString()}] Place order failed:`, err);
      setError(errorMessage);
      setShowConfirmation(false);
    }
  };

  const handleCancelConfirmation = () => {
    setShowConfirmation(false);
    setVerifiedData(null);
  };

  const handleAccountChange = (accountId: string) => {
    setSelectedAccountId(accountId);
    const account = accounts.find((acc) => acc._id === accountId);
    setSelectedMetaApiAccountId(account ? account.accountId : '');
    console.log('Selected MongoDB _id:', accountId, 'MetaApi accountId:', account ? account.accountId : '');
    setPositions([]);
    setPendingOrders([]);
    setAccountInformation(null);
  };

  const isFormValid = () => {
    if (!selectedAccountId) return false;
    if (!orderData.symbol.trim()) return false;
    if (!orderData.lotSize || Number(orderData.lotSize) <= 0) return false;
    if ((orderData.orderType === 'Stop' || orderData.orderType === 'Limit') && (!orderData.entryPrice || Number(orderData.entryPrice) <= 0)) return false;
    return true;
  };

  return (
    <>
      <Header selectedAccountId={selectedAccountId} onAccountChange={handleAccountChange} />
      <Box
        sx={{
          p: 1.5,
          bgcolor: 'background.default',
          minHeight: '100vh',
        }}
      >
        <Box
          sx={{
            mx: 'auto',
            maxWidth: 1400,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '70% 30%' },
            gap: 2,
            alignItems: 'start',
          }}
        >
          <Card
            sx={{
              borderRadius: 2,
              boxShadow: 3,
              bgcolor: 'background.paper',
            }}
          >
            <CardContent sx={{ p: 1 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mb: 1,
                }}
              >
                <Box>
                  <Typography variant="h6" fontWeight={700} fontSize="0.85rem">
                    Live Positions and Pending Orders
                  </Typography>
                  <Typography variant="body2" color="text.secondary" fontSize="0.7rem">
                    Account: {selectedMetaApiAccountId || '—'}
                  </Typography>
                </Box>
              </Box>
              <Divider sx={{ mb: 1 }} />
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.5, fontSize: '0.75rem' }}>
                Live Positions
              </Typography>
              {positions.length === 0 ? (
                <Box
                  sx={{
                    py: 1.5,
                    textAlign: 'center',
                    color: 'text.secondary',
                    fontStyle: 'italic',
                    fontSize: '0.7rem',
                  }}
                >
                  No open positions
                </Box>
              ) : (
                <TableContainer
                  component={Paper}
                  sx={{
                    borderRadius: 1,
                    boxShadow: 0,
                  }}
                >
                  <Table size="small" aria-label="positions table">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontSize: '0.7rem' }}>Symbol</TableCell>
                        <TableCell sx={{ fontSize: '0.7rem' }}>Type</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.7rem' }}>Lot</TableCell>
                        <TableCell sx={{ fontSize: '0.7rem' }}>Entry Time</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.7rem' }}>Open Price</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.7rem' }}>SL</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.7rem' }}>TP</TableCell>
                        <TableCell sx={{ fontSize: '0.7rem' }}>Comment</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.7rem' }}>P/L</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {positions.map((position) => {
                        const isProfit = position.liveProfit >= 0;
                        return (
                          <TableRow key={position.id} hover>
                            <TableCell sx={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '0.7rem' }}>
                              {position.symbol}
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.7rem' }}>{position.type}</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.7rem' }}>{numberFmt(position.volume)}</TableCell>
                            <TableCell sx={{ fontSize: '0.7rem' }}>
                              {new Date(position.brokerTime).toLocaleString()}
                            </TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.7rem' }}>{numberFmt(position.openPrice)}</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.7rem' }}>{numberFmt(position.stopLoss)}</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.7rem' }}>{numberFmt(position.takeProfit)}</TableCell>
                            <TableCell sx={{ fontSize: '0.7rem' }}>{stringFmt(position.brokerComment)}</TableCell>
                            <TableCell align="right">
                              <Chip
                                size="small"
                                label={numberFmt(position.liveProfit)}
                                sx={{
                                  fontWeight: 700,
                                  fontSize: '0.7rem',
                                  bgcolor: (theme) =>
                                    isProfit
                                      ? theme.palette.success.main + '20'
                                      : theme.palette.error.main + '20',
                                  color: (theme) =>
                                    isProfit ? theme.palette.success.main : theme.palette.error.main,
                                  minWidth: 50,
                                }}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.5, mt: 1, fontSize: '0.75rem' }}>
                Pending Orders
              </Typography>
              {pendingOrders.length === 0 ? (
                <Box
                  sx={{
                    py: 1.5,
                    textAlign: 'center',
                    color: 'text.secondary',
                    fontStyle: 'italic',
                    fontSize: '0.7rem',
                  }}
                >
                  No pending orders
                </Box>
              ) : (
                <TableContainer
                  component={Paper}
                  sx={{
                    borderRadius: 1,
                    boxShadow: 0,
                  }}
                >
                  <Table size="small" aria-label="pending orders table">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontSize: '0.7rem' }}>Symbol</TableCell>
                        <TableCell sx={{ fontSize: '0.7rem' }}>Type</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.7rem' }}>Lot</TableCell>
                        <TableCell sx={{ fontSize: '0.7rem' }}>Time</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.7rem' }}>SL</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.7rem' }}>TP</TableCell>
                        <TableCell sx={{ fontSize: '0.7rem' }}>Comment</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {pendingOrders.map((order) => (
                        <TableRow key={order.id} hover>
                          <TableCell sx={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '0.7rem' }}>
                            {order.symbol}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.7rem' }}>{order.type}</TableCell>
                          <TableCell align="right" sx={{ fontSize: '0.7rem' }}>{numberFmt(order.currentVolume)}</TableCell>
                          <TableCell sx={{ fontSize: '0.7rem' }}>
                            {new Date(order.time).toLocaleString()}
                          </TableCell>
                          <TableCell align="right" sx={{ fontSize: '0.7rem' }}>{numberFmt(order.stopLoss)}</TableCell>
                          <TableCell align="right" sx={{ fontSize: '0.7rem' }}>{numberFmt(order.takeProfit)}</TableCell>
                          <TableCell sx={{ fontSize: '0.7rem' }}>{stringFmt(order.brokerComment)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
            }}
          >
            <Card
              sx={{
                borderRadius: 2,
                boxShadow: 3,
                bgcolor: 'background.paper',
                width: '100%',
                height: '30%',
              }}
            >
              <CardContent sx={{ p: 0.8 }}>
                <Typography variant="h6" fontWeight={700} gutterBottom fontSize="0.7rem">
                  Account Information
                </Typography>
                <Divider sx={{ mb: 0.8 }} />
                { !accountInformation ? (
                  <Box
                    sx={{
                      py: 1,
                      textAlign: 'center',
                      color: 'text.secondary',
                      fontStyle: 'italic',
                      fontSize: '0.65rem',
                    }}
                  >
                    No account information
                  </Box>
                ) : (
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 0.2,
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography fontSize="0.65rem">Platform:</Typography>
                      <Typography fontSize="0.65rem">{stringFmt(accountInformation.platform)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography fontSize="0.65rem">Type:</Typography>
                      <Typography fontSize="0.65rem">{stringFmt(accountInformation.type)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography fontSize="0.65rem">Broker:</Typography>
                      <Typography fontSize="0.65rem">{stringFmt(accountInformation.broker)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography fontSize="0.65rem">Currency:</Typography>
                      <Typography fontSize="0.65rem">{stringFmt(accountInformation.currency)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography fontSize="0.65rem">Server:</Typography>
                      <Typography fontSize="0.65rem">{stringFmt(accountInformation.server)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography fontSize="0.65rem">Balance:</Typography>
                      <Typography fontSize="0.65rem">{numberFmt(accountInformation.balance)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography fontSize="0.65rem">Equity:</Typography>
                      <Typography fontSize="0.65rem">{numberFmt(accountInformation.equity)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography fontSize="0.65rem">Margin:</Typography>
                      <Typography fontSize="0.65rem">{numberFmt(accountInformation.margin)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography fontSize="0.65rem">Free Margin:</Typography>
                      <Typography fontSize="0.65rem">{numberFmt(accountInformation.freeMargin)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography fontSize="0.65rem">Leverage:</Typography>
                      <Typography fontSize="0.65rem">{stringFmt(accountInformation.leverage)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography fontSize="0.65rem">Margin Level:</Typography>
                      <Typography fontSize="0.65rem">{numberFmt(accountInformation.marginLevel)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography fontSize="0.65rem">Margin Mode:</Typography>
                      <Typography fontSize="0.65rem">{stringFmt(accountInformation.marginMode)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography fontSize="0.65rem">Name:</Typography>
                      <Typography fontSize="0.65rem">{stringFmt(accountInformation.name)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography fontSize="0.65rem">Login:</Typography>
                      <Typography fontSize="0.65rem">{stringFmt(accountInformation.login)}</Typography>
                    </Box>
                  </Box>
                )}
              </CardContent>
            </Card>
            <Card
              sx={{
                borderRadius: 2,
                boxShadow: 3,
                bgcolor: 'background.paper',
                width: '100%',
                height: '70%',
              }}
            >
              <CardContent sx={{ p: 0.8 }}>
                <Typography
                  variant="h6"
                  gutterBottom
                  color="text.primary"
                  fontWeight={700}
                  textAlign="center"
                  fontSize="0.7rem"
                >
                  Place Order
                </Typography>
                {error && (
                  <Alert severity="error" sx={{ mb: 0.8, borderRadius: 1, fontSize: '0.65rem' }}>
                    {error}
                  </Alert>
                )}
                <Box component="form" noValidate autoComplete="off">
                  <TextField
                    fullWidth
                    label="Symbol (e.g., EURUSD)"
                    name="symbol"
                    variant="outlined"
                    value={orderData.symbol}
                    onChange={handleOrderChange}
                    sx={{ mb: 0.8, '& .MuiOutlinedInput-root': { borderRadius: 1 }, '& .MuiInputLabel-root': { fontSize: '0.65rem' }, '& .MuiInputBase-input': { fontSize: '0.65rem' } }}
                    inputProps={{ style: { textTransform: 'uppercase', letterSpacing: 0.5 } }}
                  />
                  <FormControl fullWidth sx={{ mb: 0.8 }}>
                    <InputLabel id="entry-type-label" sx={{ fontSize: '0.65rem' }}>Entry Type</InputLabel>
                    <Select
                      labelId="entry-type-label"
                      name="entryType"
                      value={orderData.entryType}
                      onChange={handleOrderChange}
                      label="Entry Type"
                      sx={{ borderRadius: 1, '& .MuiSelect-select': { fontSize: '0.65rem' } }}
                    >
                      <MenuItem value="buy" sx={{ fontSize: '0.65rem' }}>Buy</MenuItem>
                      <MenuItem value="sell" sx={{ fontSize: '0.65rem' }}>Sell</MenuItem>
                    </Select>
                  </FormControl>
                  <FormControl fullWidth sx={{ mb: 0.8 }}>
                    <InputLabel id="order-type-label" sx={{ fontSize: '0.65rem' }}>Order Type</InputLabel>
                    <Select
                      labelId="order-type-label"
                      name="orderType"
                      value={orderData.orderType}
                      onChange={handleOrderChange}
                      label="Order Type"
                      sx={{ borderRadius: 1, '& .MuiSelect-select': { fontSize: '0.65rem' } }}
                    >
                      <MenuItem value="Market" sx={{ fontSize: '0.65rem' }}>Market</MenuItem>
                      <MenuItem value="Stop" sx={{ fontSize: '0.65rem' }}>Stop</MenuItem>
                      <MenuItem value="Limit" sx={{ fontSize: '0.65rem' }}>Limit</MenuItem>
                    </Select>
                  </FormControl>
                  {(orderData.orderType === 'Stop' || orderData.orderType === 'Limit') && (
                    <TextField
                      fullWidth
                      label="Entry Price"
                      name="entryPrice"
                      type="number"
                      variant="outlined"
                      value={orderData.entryPrice}
                      onChange={handleOrderChange}
                      sx={{ mb: 0.8, '& .MuiOutlinedInput-root': { borderRadius: 1 }, '& .MuiInputLabel-root': { fontSize: '0.65rem' }, '& .MuiInputBase-input': { fontSize: '0.65rem' } }}
                      inputProps={{ step: '0.01', inputMode: 'decimal' }}
                    />
                  )}
                  <TextField
                    fullWidth
                    label="Lot Size"
                    name="lotSize"
                    type="number"
                    variant="outlined"
                    value={orderData.lotSize}
                    onChange={handleOrderChange}
                    sx={{ mb: 0.8, '& .MuiOutlinedInput-root': { borderRadius: 1 }, '& .MuiInputLabel-root': { fontSize: '0.65rem' }, '& .MuiInputBase-input': { fontSize: '0.65rem' } }}
                    inputProps={{ min: 0, step: '0.01', inputMode: 'decimal' }}
                  />
                  <TextField
                    fullWidth
                    label="Stop Loss"
                    name="stopLoss"
                    type="number"
                    variant="outlined"
                    value={orderData.stopLoss}
                    onChange={handleOrderChange}
                    sx={{ mb: 0.8, '& .MuiOutlinedInput-root': { borderRadius: 1 }, '& .MuiInputLabel-root': { fontSize: '0.65rem' }, '& .MuiInputBase-input': { fontSize: '0.65rem' } }}
                    inputProps={{ step: '0.01', inputMode: 'decimal' }}
                  />
                  <TextField
                    fullWidth
                    label="Take Profit (optional, comma-separated)"
                    name="takeProfit"
                    type="text"
                    variant="outlined"
                    value={orderData.takeProfit}
                    onChange={handleOrderChange}
                    sx={{ mb: 0.8, '& .MuiOutlinedInput-root': { borderRadius: 1 }, '& .MuiInputLabel-root': { fontSize: '0.65rem' }, '& .MuiInputBase-input': { fontSize: '0.65rem' } }}
                    inputProps={{ inputMode: 'decimal' }}
                  />
                  <TextField
                    fullWidth
                    label="Comment (optional)"
                    name="comment"
                    variant="outlined"
                    value={orderData.comment}
                    onChange={handleOrderChange}
                    sx={{ mb: 0.8, '& .MuiOutlinedInput-root': { borderRadius: 1 }, '& .MuiInputLabel-root': { fontSize: '0.65rem' }, '& .MuiInputBase-input': { fontSize: '0.65rem' } }}
                  />
                  <Button
                    fullWidth
                    variant="contained"
                    color="primary"
                    onClick={handleVerifyOrder}
                    disabled={!isFormValid()}
                    sx={{
                      py: 0.6,
                      borderRadius: 1,
                      textTransform: 'none',
                      fontWeight: 700,
                      letterSpacing: 0.3,
                      fontSize: '0.65rem',
                    }}
                  >
                    Place Order
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Box>
      </Box>
      <Dialog open={showConfirmation} onClose={handleCancelConfirmation}>
        <DialogTitle sx={{ fontSize: '0.85rem', fontWeight: 700 }}>Confirm Order</DialogTitle>
        <DialogContent>
          {verifiedData ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Typography sx={{ fontSize: '0.65rem' }}>Symbol: {verifiedData.symbol}</Typography>
              <Typography sx={{ fontSize: '0.65rem' }}>Side: {verifiedData.side}</Typography>
              <Typography sx={{ fontSize: '0.65rem' }}>Order Type: {verifiedData.orderType}</Typography>
              <Typography sx={{ fontSize: '0.65rem' }}>Quantity: {numberFmt(verifiedData.quantity)}</Typography>
              <Typography sx={{ fontSize: '0.65rem' }}>Stop Loss: {numberFmt(verifiedData.stopLoss)}</Typography>
              <Typography sx={{ fontSize: '0.65rem' }}>
                Take Profit: {Array.isArray(verifiedData.takeProfit) ? verifiedData.takeProfit.map(numberFmt).join(', ') : numberFmt(verifiedData.takeProfit)}
              </Typography>
              {verifiedData.entryPrice && <Typography sx={{ fontSize: '0.65rem' }}>Entry Price: {numberFmt(verifiedData.entryPrice)}</Typography>}
              {verifiedData.comment && <Typography sx={{ fontSize: '0.65rem' }}>Comment: {verifiedData.comment}</Typography>}
              <Typography sx={{ fontSize: '0.65rem' }}>Max Loss: {numberFmt(verifiedData.maxLoss)}</Typography>
              <Typography sx={{ fontSize: '0.65rem' }}>Max Profit: {numberFmt(verifiedData.maxProfit)}</Typography>
            </Box>
          ) : (
            <Typography sx={{ fontSize: '0.65rem' }}>Verifying order...</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleCancelConfirmation}
            color="secondary"
            sx={{ fontSize: '0.65rem', textTransform: 'none' }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmOrder}
            color="primary"
            sx={{ fontSize: '0.65rem', textTransform: 'none' }}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default Dashboard;
*/