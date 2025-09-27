import React, { useContext, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Box, Typography, IconButton, Button, Select, MenuItem, FormControl, InputLabel } from '@mui/material';
import { Brightness4, Brightness7, Logout } from '@mui/icons-material';
import { ThemeContext } from '../main';
import { logout, getUserAccounts } from '../api/api';
import HedgeTerminalLogo from '../logoo.svg'

interface Account {
  _id: string;
  brokerName: string;
  accountId: string;
}

const Header: React.FC<{ selectedAccountId?: string; onAccountChange?: (accountId: string) => void }> = ({ selectedAccountId, onAccountChange }) => {
  const { toggleTheme, mode } = useContext(ThemeContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const fetchedAccounts = await getUserAccounts();
        setAccounts(fetchedAccounts);
        if (fetchedAccounts.length > 0 && !selectedAccountId) {
          onAccountChange?.(fetchedAccounts[0]._id);
        }
      } catch (err) {
        console.error('Failed to fetch accounts:', err);
      }
    };
    fetchAccounts();
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isAuthPage = location.pathname === '/login' || location.pathname === '/signup';
  const isDashboard = location.pathname === '/dashboard';
  const isAddAccount = location.pathname === '/add-account';

  const formatAccountId = (accountId: string) => {
    return accountId.slice(-4);
  };

  return (
    <Box sx={{ 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center', 
      p: 1.5,
      bgcolor: mode === 'light' ? '#0a1433' : '#050a1f',
      color: '#d4d9e6',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
      borderBottom: '1px solid #1e2a4d',
      height: '56px'
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <img 
          src={HedgeTerminalLogo} 
          alt="HedgeTerminal Logo" 
          style={{ height: '30px', width: 'auto' }} 
        />
        <Typography variant="h6" component="div" sx={{ fontWeight: 700, color: '#e6e9f0', letterSpacing: '0.06em', fontSize: '1.1rem' }}>
          HedgeTerminal
        </Typography>
      
        {!isAuthPage && (
          <FormControl sx={{ minWidth: 220 }} disabled={accounts.length === 0}>
            <InputLabel shrink={!!selectedAccountId} sx={{ color: '#d4d9e6', fontWeight: 500, fontSize: '0.8rem' }}>Select Account</InputLabel>
            <Select
              value={selectedAccountId || ''}
              onChange={(e) => onAccountChange?.(e.target.value)}
              label="Select Account"
              displayEmpty
              notched={!!selectedAccountId}
              sx={{ 
                color: '#d4d9e6', 
                borderRadius: 2,
                bgcolor: mode === 'light' ? '#1e2a4d' : '#0f172a',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
                '& .MuiSvgIcon-root': { color: '#d4d9e6' },
                fontSize: '0.8rem',
                fontWeight: 500,
                height: '36px'
              }}
            >
              {accounts.length > 0 ? (
                accounts.map((account) => (
                  <MenuItem key={account._id} value={account._id} sx={{ fontSize: '0.8rem' }}>
                    {account.brokerName} - {formatAccountId(account.accountId)}
                  </MenuItem>
                ))
              ) : (
                <MenuItem value="" disabled sx={{ fontSize: '0.8rem' }}>
                  No accounts available
                </MenuItem>
              )}
            </Select>
          </FormControl>
        )}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {isDashboard && (
          <Button
            variant="contained"
            onClick={() => navigate('/add-account')}
            sx={{ 
              py: 0.5, 
              px: 1.5,
              borderRadius: 2, 
              textTransform: 'none', 
              fontWeight: 600, 
              fontSize: '0.8rem',
              bgcolor: '#1e40af',
              color: '#ffffff',
              '&:hover': { bgcolor: '#15308f' }
            }}
          >
            Add Account
          </Button>
        )}
        {isAddAccount && (
          <Button
            variant="contained"
            onClick={() => navigate('/dashboard')}
            sx={{ 
              py: 0.5, 
              px: 1.5,
              borderRadius: 2, 
              textTransform: 'none', 
              fontWeight: 600, 
              fontSize: '0.8rem',
              bgcolor: '#1e40af',
              color: '#ffffff',
              '&:hover': { bgcolor: '#15308f' }
            }}
          >
            Dashboard
          </Button>
        )}
        <IconButton 
          onClick={toggleTheme} 
          sx={{ 
            color: '#d4d9e6',
            p: 0.5,
            '&:hover': { bgcolor: mode === 'light' ? '#3b4a7a' : '#1e2a4d' }
          }}
        >
          {mode === 'dark' ? <Brightness7 fontSize="small" /> : <Brightness4 fontSize="small" />}
        </IconButton>
        {!isAuthPage && (
          <Button
            variant="outlined"
            sx={{ 
              color: '#d4d9e6', 
              borderColor: '#3b4a7a',
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.8rem',
              py: 0.5,
              px: 1.5,
              '&:hover': { 
                bgcolor: mode === 'light' ? '#3b4a7a' : '#1e2a4d',
                borderColor: '#6b7aa8',
              }
            }}
            startIcon={<Logout fontSize="small" />}
            onClick={handleLogout}
          >
            Logout
          </Button>
        )}
      </Box>
    </Box>
  );
};

export default Header;



/*
import React, { useContext, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Box, Typography, IconButton, Button, Select, MenuItem, FormControl, InputLabel } from '@mui/material';
import { Brightness4, Brightness7, Logout } from '@mui/icons-material';
import { ThemeContext } from '../main';
import { logout, getUserAccounts } from '../api/api';
import logoImage from '../assets/hedge_terminal_logo.png'; // Assuming a logo image is added to assets

interface Account {
  _id: string;
  brokerName: string;
  accountId: string;
}

const Header: React.FC<{ selectedAccountId?: string; onAccountChange?: (accountId: string) => void }> = ({ selectedAccountId, onAccountChange }) => {
  const { toggleTheme, mode } = useContext(ThemeContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const fetchedAccounts = await getUserAccounts();
        setAccounts(fetchedAccounts);
        if (fetchedAccounts.length > 0 && !selectedAccountId) {
          onAccountChange?.(fetchedAccounts[0]._id);
        }
      } catch (err) {
        console.error('Failed to fetch accounts:', err);
      }
    };
    fetchAccounts();
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isAuthPage = location.pathname === '/login' || location.pathname === '/signup';
  const isDashboard = location.pathname === '/dashboard';
  const isAddAccount = location.pathname === '/add-account';

  const formatAccountId = (accountId: string) => {
    return accountId.slice(-4); // Display last 4 digits of accountId
  };

  return (
    <Box sx={{ 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center', 
      p: 1.5,
      bgcolor: mode === 'light' ? '#1a2233' : '#0d1321',
      color: '#e2e8f0',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
      borderBottom: '1px solid #334155',
      height: '56px'
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <img 
          src={logoImage} 
          alt="HedgeTerminal Logo" 
          style={{ height: '32px', width: 'auto' }} 
        />
        <Typography variant="h6" component="div" sx={{ fontWeight: 700, color: '#ffffff', letterSpacing: '0.05em', fontSize: '1.1rem' }}>
          HedgeTerminal
        </Typography>
      
        {!isAuthPage && (
          <FormControl sx={{ minWidth: 220 }} disabled={accounts.length === 0}>
            <InputLabel shrink={!!selectedAccountId} sx={{ color: '#e2e8f0', fontWeight: 500, fontSize: '0.8rem' }}>Select Account</InputLabel>
            <Select
              value={selectedAccountId || ''}
              onChange={(e) => onAccountChange?.(e.target.value)}
              label="Select Account"
              displayEmpty
              notched={!!selectedAccountId}
              sx={{ 
                color: '#e2e8f0', 
                borderRadius: 2,
                bgcolor: mode === 'light' ? '#2d3748' : '#1e293b',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: '#475569' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#94a3b8' },
                '& .MuiSvgIcon-root': { color: '#e2e8f0' },
                fontSize: '0.8rem',
                fontWeight: 500,
                height: '36px'
              }}
            >
              {accounts.length > 0 ? (
                accounts.map((account) => (
                  <MenuItem key={account._id} value={account._id} sx={{ fontSize: '0.8rem' }}>
                    {account.brokerName} - {formatAccountId(account.accountId)}
                  </MenuItem>
                ))
              ) : (
                <MenuItem value="" disabled sx={{ fontSize: '0.8rem' }}>
                  No accounts available
                </MenuItem>
              )}
            </Select>
          </FormControl>
        )}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {isDashboard && (
          <Button
            variant="contained"
            onClick={() => navigate('/add-account')}
            sx={{ 
              py: 0.5, 
              px: 1.5,
              borderRadius: 2, 
              textTransform: 'none', 
              fontWeight: 600, 
              fontSize: '0.8rem',
              bgcolor: '#2563eb',
              color: '#ffffff',
              '&:hover': { bgcolor: '#1e40af' }
            }}
          >
            Add Account
          </Button>
        )}
        {isAddAccount && (
          <Button
            variant="contained"
            onClick={() => navigate('/dashboard')}
            sx={{ 
              py: 0.5, 
              px: 1.5,
              borderRadius: 2, 
              textTransform: 'none', 
              fontWeight: 600, 
              fontSize: '0.8rem',
              bgcolor: '#2563eb',
              color: '#ffffff',
              '&:hover': { bgcolor: '#1e40af' }
            }}
          >
            Dashboard
          </Button>
        )}
        <IconButton 
          onClick={toggleTheme} 
          sx={{ 
            color: '#e2e8f0',
            p: 0.5,
            '&:hover': { bgcolor: mode === 'light' ? '#475569' : '#334155' }
          }}
        >
          {mode === 'dark' ? <Brightness7 fontSize="small" /> : <Brightness4 fontSize="small" />}
        </IconButton>
        {!isAuthPage && (
          <Button
            variant="outlined"
            sx={{ 
              color: '#e2e8f0', 
              borderColor: '#64748b',
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.8rem',
              py: 0.5,
              px: 1.5,
              '&:hover': { 
                bgcolor: mode === 'light' ? '#475569' : '#334155',
                borderColor: '#94a3b8',
              }
            }}
            startIcon={<Logout fontSize="small" />}
            onClick={handleLogout}
          >
            Logout
          </Button>
        )}
      </Box>
    </Box>
  );
};

export default Header;
*/

/*
import React, { useContext, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Box, Typography, IconButton, Button, Select, MenuItem, FormControl, InputLabel } from '@mui/material';
import { Brightness4, Brightness7, Logout } from '@mui/icons-material';
import { ThemeContext } from '../main';
import { logout, getUserAccounts } from '../api/api';

interface Account {
  _id: string;
  brokerName: string;
  accountId: string;
}

const Header: React.FC<{ selectedAccountId?: string; onAccountChange?: (accountId: string) => void }> = ({ selectedAccountId, onAccountChange }) => {
  const { toggleTheme, mode } = useContext(ThemeContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const fetchedAccounts = await getUserAccounts();
        setAccounts(fetchedAccounts);
        if (fetchedAccounts.length > 0 && !selectedAccountId) {
          onAccountChange?.(fetchedAccounts[0]._id);
        }
      } catch (err) {
        console.error('Failed to fetch accounts:', err);
      }
    };
    fetchAccounts();
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isAuthPage = location.pathname === '/login' || location.pathname === '/signup';
  const isDashboard = location.pathname === '/dashboard';
  const isAddAccount = location.pathname === '/add-account';

  const formatAccountId = (accountId: string) => {
    return accountId.slice(-4); // Display last 4 digits of accountId
  };

  return (
    <Box sx={{ 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center', 
      p: 1.5, // Reduced padding for smaller height
      bgcolor: mode === 'light' ? '#1a2233' : '#0d1321',
      color: '#e2e8f0',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
      borderBottom: '1px solid #334155',
      height: '56px' // Fixed height for compact, professional look
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Typography variant="h6" component="div" sx={{ fontWeight: 700, color: '#ffffff', letterSpacing: '0.05em', fontSize: '1.1rem' }}>
          HedgeTerminal
        </Typography>
      
        {!isAuthPage && (
          <FormControl sx={{ minWidth: 220 }} disabled={accounts.length === 0}>
            <InputLabel shrink={!!selectedAccountId} sx={{ color: '#e2e8f0', fontWeight: 500, fontSize: '0.8rem' }}>Select Account</InputLabel>
            <Select
              value={selectedAccountId || ''}
              onChange={(e) => onAccountChange?.(e.target.value)}
              label="Select Account"
              displayEmpty
              notched={!!selectedAccountId}
              sx={{ 
                color: '#e2e8f0', 
                borderRadius: 2,
                bgcolor: mode === 'light' ? '#2d3748' : '#1e293b',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: '#475569' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#94a3b8' },
                '& .MuiSvgIcon-root': { color: '#e2e8f0' },
                fontSize: '0.8rem',
                fontWeight: 500,
                height: '36px' // Reduced height for select
              }}
            >
              {accounts.length > 0 ? (
                accounts.map((account) => (
                  <MenuItem key={account._id} value={account._id} sx={{ fontSize: '0.8rem' }}>
                    {account.brokerName} - {formatAccountId(account.accountId)}
                  </MenuItem>
                ))
              ) : (
                <MenuItem value="" disabled sx={{ fontSize: '0.8rem' }}>
                  No accounts available
                </MenuItem>
              )}
            </Select>
          </FormControl>
        )}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {isDashboard && (
          <Button
            variant="contained"
            onClick={() => navigate('/add-account')}
            sx={{ 
              py: 0.5, 
              px: 1.5,
              borderRadius: 2, 
              textTransform: 'none', 
              fontWeight: 600, 
              fontSize: '0.8rem',
              bgcolor: '#2563eb',
              color: '#ffffff',
              '&:hover': { bgcolor: '#1e40af' }
            }}
          >
            Add Account
          </Button>
        )}
        {isAddAccount && (
          <Button
            variant="contained"
            onClick={() => navigate('/dashboard')}
            sx={{ 
              py: 0.5, 
              px: 1.5,
              borderRadius: 2, 
              textTransform: 'none', 
              fontWeight: 600, 
              fontSize: '0.8rem',
              bgcolor: '#2563eb',
              color: '#ffffff',
              '&:hover': { bgcolor: '#1e40af' }
            }}
          >
            Dashboard
          </Button>
        )}
        <IconButton 
          onClick={toggleTheme} 
          sx={{ 
            color: '#e2e8f0',
            p: 0.5,
            '&:hover': { bgcolor: mode === 'light' ? '#475569' : '#334155' }
          }}
        >
          {mode === 'dark' ? <Brightness7 fontSize="small" /> : <Brightness4 fontSize="small" />}
        </IconButton>
        {!isAuthPage && (
          <Button
            variant="outlined"
            sx={{ 
              color: '#e2e8f0', 
              borderColor: '#64748b',
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.8rem',
              py: 0.5,
              px: 1.5,
              '&:hover': { 
                bgcolor: mode === 'light' ? '#475569' : '#334155',
                borderColor: '#94a3b8',
              }
            }}
            startIcon={<Logout fontSize="small" />}
            onClick={handleLogout}
          >
            Logout
          </Button>
        )}
      </Box>
    </Box>
  );
};

export default Header;
*/