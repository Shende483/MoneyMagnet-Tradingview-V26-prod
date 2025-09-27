import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Card, CardContent, Typography, TextField, Button, MenuItem, FormControlLabel, Checkbox, InputAdornment, Modal, Autocomplete } from '@mui/material';
import Grid from '@mui/material/Grid';
import Header from './Header';
import moment from 'moment-timezone';
import { addAccount, verifyToken, confirmAccount } from '../api/api';
import { ThemeContext } from '../main';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import _ from 'lodash';

const AddAccount: React.FC = () => {
  const { mode } = useContext(ThemeContext);
  const [formData, setFormData] = useState({
    brokerName: '',
    accountId: '',
    apiKey: '',
    location: 'London',
    maxPositionLimit: 0,
    splittingTarget: 0,
    riskPercentage: 0,
    autoLotSizeSet: true,
    dailyRiskPercentage: 0,
    timezone: '',
  });
  const [, setError] = useState('');
  const [accountInfo, setAccountInfo] = useState<any>(null);
  const [openModal, setOpenModal] = useState(false);
  const [, setTimezoneSearch] = useState('');
  const [isVerifyButtonVisible, setIsVerifyButtonVisible] = useState(true);
  const [isConfirmButtonVisible, setIsConfirmButtonVisible] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const timezones = moment.tz.names();

  const checkToken = _.debounce(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      toast.error('No token found. Redirecting to login.', { theme: mode });
      navigate('/login');
      return;
    }
    try {
      await verifyToken();
      setError('');
    } catch (err) {
      localStorage.removeItem('token');
      toast.error('Session expired. Please log in again.', { theme: mode });
      navigate('/login');
    }
  }, 2500);

  useEffect(() => {
    checkToken();
  }, [navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? !checked : type === 'number' ? parseFloat(value) || 0 : value,
      ...(name === 'autoLotSizeSet' && !checked ? { riskPercentage: 0 } : {}),
    });
  };

  const handleSubmit = _.debounce(async () => {
    if (isSubmitting) return; // Prevent multiple submissions
    setIsSubmitting(true);

    if (!formData.brokerName.trim()) {
      toast.error('Broker Name is required.', { theme: mode });
      setIsSubmitting(false);
      return;
    }
    if (!formData.accountId.trim()) {
      toast.error('Account ID is required.', { theme: mode });
      setIsSubmitting(false);
      return;
    }
    if (!formData.apiKey.trim()) {
      toast.error('API Key is required.', { theme: mode });
      setIsSubmitting(false);
      return;
    }
    if (!formData.location.trim()) {
      toast.error('Location is required.', { theme: mode });
      setIsSubmitting(false);
      return;
    }
    if (isNaN(formData.maxPositionLimit) || formData.maxPositionLimit <= 0) {
      toast.error('Max Position Limit must be a positive number.', { theme: mode });
      setIsSubmitting(false);
      return;
    }
    if (isNaN(formData.splittingTarget) || formData.splittingTarget <= 0) {
      toast.error('Splitting Target must be a positive number.', { theme: mode });
      setIsSubmitting(false);
      return;
    }
    if (formData.autoLotSizeSet && (isNaN(formData.riskPercentage) || formData.riskPercentage <= 0)) {
      toast.error('Risk Percentage must be a positive number when using automatic lot size calculation.', { theme: mode });
      setIsSubmitting(false);
      return;
    }
    if (formData.dailyRiskPercentage > 0 && (isNaN(formData.dailyRiskPercentage) || formData.dailyRiskPercentage <= 0)) {
      toast.error('Daily Risk Percentage must be a positive number if provided.', { theme: mode });
      setIsSubmitting(false);
      return;
    }
    if (formData.dailyRiskPercentage > 100) {
      toast.error('Daily Risk Percentage cannot exceed 100%.', { theme: mode });
      setIsSubmitting(false);
      return;
    }
    if (formData.dailyRiskPercentage > 0 && !formData.timezone.trim()) {
      toast.error('Timezone is required when Daily Risk Percentage is set.', { theme: mode });
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await addAccount(formData);
      if ('error' in response) {
        toast.error(
          response.error === 'Invalid API key or account ID'
            ? 'Invalid API key, account ID, or wrong region selected.'
            : response.error,
          { theme: mode }
        );
        setAccountInfo(null);
        setIsSubmitting(false);
        return;
      }
      toast.success('Account verified successfully!', { theme: mode });
      setError('');
      setAccountInfo(response.accountInfo);
      setOpenModal(true);
      setIsVerifyButtonVisible(false); // Hide button on success
      setTimeout(() => {
        setIsVerifyButtonVisible(true); // Show button after 2 seconds
      }, 2000);
    } catch (err: any) {
      toast.error(
        err.response?.data?.error === 'Invalid API key or account ID'
          ? 'Invalid API key, account ID, or wrong region selected.'
          : err.response?.data?.error || 'Failed to verify account.',
        { theme: mode }
      );
    //  console.error('Verify account failed:', err);
      setAccountInfo(null);
    } finally {
      setIsSubmitting(false);
    }
  }, 500);

  const handleConfirm = _.debounce(async () => {
    if (isSubmitting) return; // Prevent multiple submissions
    setIsSubmitting(true);

    if (!formData.brokerName.trim()) {
      toast.error('Broker Name is required.', { theme: mode });
      setIsSubmitting(false);
      return;
    }
    if (!formData.accountId.trim()) {
      toast.error('Account ID is required.', { theme: mode });
      setIsSubmitting(false);
      return;
    }
    if (!formData.apiKey.trim()) {
      toast.error('API Key is required.', { theme: mode });
      setIsSubmitting(false);
      return;
    }
    if (!formData.location.trim()) {
      toast.error('Location is required.', { theme: mode });
      setIsSubmitting(false);
      return;
    }
    if (isNaN(formData.maxPositionLimit) || formData.maxPositionLimit <= 0) {
      toast.error('Max Position Limit must be a positive number.', { theme: mode });
      setIsSubmitting(false);
      return;
    }
    if (isNaN(formData.splittingTarget) || formData.splittingTarget <= 0) {
      toast.error('Splitting Target must be a positive number.', { theme: mode });
      setIsSubmitting(false);
      return;
    }
    if (formData.autoLotSizeSet && (isNaN(formData.riskPercentage) || formData.riskPercentage <= 0)) {
      toast.error('Risk Percentage must be a positive number when using automatic lot size calculation.', { theme: mode });
      setIsSubmitting(false);
      return;
    }
    if (formData.dailyRiskPercentage > 0 && (isNaN(formData.dailyRiskPercentage) || formData.dailyRiskPercentage <= 0)) {
      toast.error('Daily Risk Percentage must be a positive number if provided.', { theme: mode });
      setIsSubmitting(false);
      return;
    }
    if (formData.dailyRiskPercentage > 100) {
      toast.error('Daily Risk Percentage cannot exceed 100%.', { theme: mode });
      setIsSubmitting(false);
      return;
    }
    if (formData.dailyRiskPercentage > 0 && !formData.timezone.trim()) {
      toast.error('Timezone is required when Daily Risk Percentage is set.', { theme: mode });
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await confirmAccount(formData);
      if ('error' in response) {
        toast.error(
          response.error === 'Invalid API key or account ID'
            ? 'Invalid API key, account ID, or wrong region selected.'
            : response.error,
          { theme: mode }
        );
        setIsSubmitting(false);
        return;
      }
      toast.success('Account confirmed successfully!', { theme: mode });
      setError('');
      setAccountInfo(null);
      setOpenModal(false);
      setIsConfirmButtonVisible(false); // Hide button on success
      setTimeout(() => {
        setIsConfirmButtonVisible(true); // Show button after 2 seconds
      }, 2000);
      navigate('/dashboard');
    } catch (err: any) {
      toast.error(
        err.response?.data?.error === 'Invalid API key or account ID'
          ? 'Invalid API key, account ID, or wrong region selected.'
          : err.response?.data?.error || 'Failed to confirm account.',
        { theme: mode }
      );
     // console.error('Confirm account failed:', err);
    } finally {
      setIsSubmitting(false);
    }
  }, 500);

  const handleCloseModal = () => {
    setOpenModal(false);
    setAccountInfo(null);
  };

  return (
    <>
      <Header />
      <Box
        sx={{
          p: 2,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          bgcolor: mode === 'light' ? '#0f172a' : '#050a1f',
          minHeight: '100vh',
        }}
      >
        <Grid container spacing={2} sx={{ maxWidth: 800 }}>
          <Grid item xs={12} {...({} as any)}>
            <Card
              sx={{
                width: '100%',
                borderRadius: 2,
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
                bgcolor: mode === 'light' ? '#1e2a4d' : '#0f172a',
                color: '#d4d9e6',
                maxWidth: 600,
              }}
            >
              <CardContent sx={{ p: 2.5 }}>
                <Typography
                  variant="h5"
                  gutterBottom
                  fontWeight="600"
                  textAlign="center"
                  sx={{ color: '#a855f7', fontSize: '1.2rem', mb: 3 }}
                >
                  Add Trading Account
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} {...({} as any)}>
                    <Box
                      sx={{
                        bgcolor: mode === 'light' ? '#2a3a5e' : '#1a2536',
                        borderLeft: '4px solid #3b82f6',
                        p: 2,
                        borderRadius: 1,
                        mb: 2,
                      }}
                    >
                      <Typography
                        variant="h6"
                        sx={{ mb: 1.5, color: '#3b82f6', fontSize: '1rem', fontWeight: '500' }}
                      >
                        Basic Information
                      </Typography>
                      <Grid container spacing={2}>
                        <Grid item xs={12} sm={6} {...({} as any)}>
                          <TextField
                            fullWidth
                            label="Account Name"
                            name="brokerName"
                            variant="outlined"
                            value={formData.brokerName}
                            onChange={handleChange}
                            sx={{
                              mb: 1.5,
                              '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#2d3748', color: '#d4d9e6', height: '40px' },
                              '& .MuiInputLabel-root': { color: '#d4d9e6', fontSize: '0.8rem' },
                              '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
                              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
                            }}
                          />
                        </Grid>
                        <Grid item xs={12} sm={6} {...({} as any)}>
                          <TextField
                            fullWidth
                            label="Account ID"
                            name="accountId"
                            variant="outlined"
                            value={formData.accountId}
                            onChange={handleChange}
                            sx={{
                              mb: 1.5,
                              '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#2d3748', color: '#d4d9e6', height: '40px' },
                              '& .MuiInputLabel-root': { color: '#d4d9e6', fontSize: '0.8rem' },
                              '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
                              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
                            }}
                          />
                        </Grid>
                        <Grid item xs={12} sm={6} {...({} as any)}>
                          <TextField
                            fullWidth
                            label="API Key"
                            name="apiKey"
                            variant="outlined"
                            value={formData.apiKey}
                            onChange={handleChange}
                            sx={{
                              mb: 1.5,
                              '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#2d3748', color: '#d4d9e6', height: '40px' },
                              '& .MuiInputLabel-root': { color: '#d4d9e6', fontSize: '0.8rem' },
                              '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
                              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
                            }}
                          />
                        </Grid>
                        <Grid item xs={12} sm={6} {...({} as any)}>
                          <TextField
                            fullWidth
                            select
                            label="Server Location"
                            name="location"
                            variant="outlined"
                            value={formData.location}
                            onChange={handleChange}
                            sx={{
                              mb: 1.5,
                              '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#2d3748', color: '#d4d9e6', height: '40px' },
                              '& .MuiInputLabel-root': { color: '#d4d9e6', fontSize: '0.8rem' },
                              '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
                              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
                            }}
                          >
                            <MenuItem value="London">London</MenuItem>
                            <MenuItem value="NewYork">New York</MenuItem>
                          </TextField>
                        </Grid>
                      </Grid>
                    </Box>
                  </Grid>
                  <Grid item xs={12} {...({} as any)}>
                    <Box
                      sx={{
                        bgcolor: mode === 'light' ? '#2a3a5e' : '#1a2536',
                        borderLeft: '4px solid #10b981',
                        p: 2,
                        borderRadius: 1,
                        mb: 2,
                      }}
                    >
                      <Typography
                        variant="h6"
                        sx={{ mb: 1.5, color: '#10b981', fontSize: '1rem', fontWeight: '500' }}
                      >
                        Risk Management
                      </Typography>
                      <Grid container spacing={2}>
                        <Grid item xs={12} sm={6} {...({} as any)}>
                          <TextField
                            fullWidth
                            label="Max Position Limit"
                            name="maxPositionLimit"
                            type="number"
                            variant="outlined"
                            value={formData.maxPositionLimit}
                            onChange={handleChange}
                            inputProps={{ min: 1, step: 1 }}
                            sx={{
                              mb: 1.5,
                              '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#2d3748', color: '#d4d9e6', height: '40px' },
                              '& .MuiInputLabel-root': { color: '#d4d9e6', fontSize: '0.8rem' },
                              '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
                              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
                            }}
                          />
                        </Grid>
                        <Grid item xs={12} sm={6} {...({} as any)}>
                          <TextField
                            fullWidth
                            label="Splitting Target"
                            name="splittingTarget"
                            type="number"
                            variant="outlined"
                            value={formData.splittingTarget}
                            onChange={handleChange}
                            inputProps={{ min: 1, step: 1 }}
                            sx={{
                              mb: 1.5,
                              '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#2d3748', color: '#d4d9e6', height: '40px' },
                              '& .MuiInputLabel-root': { color: '#d4d9e6', fontSize: '0.8rem' },
                              '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
                              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
                            }}
                          />
                        </Grid>
                      </Grid>
                    </Box>
                  </Grid>
                  <Grid item xs={12} {...({} as any)}>
                    <Box
                      sx={{
                        bgcolor: mode === 'light' ? '#2a3a5e' : '#1a2536',
                        borderLeft: '4px solid #f59e0b',
                        p: 2,
                        borderRadius: 1,
                        mb: 2,
                      }}
                    >
                      <Typography
                        variant="h6"
                        sx={{ mb: 1.5, color: '#f59e0b', fontSize: '1rem', fontWeight: '500' }}
                      >
                        Lot Size Configuration
                      </Typography>
                      <Grid container spacing={2}>
                        <Grid item xs={12} {...({} as any)}>
                          <Box sx={{ borderTop: '1px solid #3b4a7a', mb: 1.5 }} />
                          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5, gap: 2 }}>
                            <TextField
                              fullWidth
                              label="Risk Percentage"
                              name="riskPercentage"
                              type="number"
                              variant="outlined"
                              value={formData.riskPercentage}
                              onChange={handleChange}
                              disabled={!formData.autoLotSizeSet}
                              inputProps={{ min: 0, step: 0.1 }}
                              InputProps={{
                                endAdornment: <InputAdornment position="end">%</InputAdornment>,
                              }}
                              sx={{
                                maxWidth: '200px',
                                '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#2d3748', color: '#d4d9e6', height: '40px' },
                                '& .MuiInputLabel-root': { color: '#d4d9e6', fontSize: '0.8rem' },
                                '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
                                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
                              }}
                              helperText={formData.autoLotSizeSet ? 'Enter a positive percentage' : 'Disabled: Manual quantity'}
                            />
                            <Typography
                              sx={{
                                color: '#d4d9e6',
                                fontSize: '0.8rem',
                                bgcolor: '#2d3748',
                                px: 1,
                                borderRadius: 1,
                              }}
                            >
                              or
                            </Typography>
                            <FormControlLabel
                              control={
                                <Checkbox
                                  name="autoLotSizeSet"
                                  checked={!formData.autoLotSizeSet}
                                  onChange={handleChange}
                                  sx={{ color: '#d4d9e6', '&.Mui-checked': { color: '#16a34a' } }}
                                />
                              }
                              label="Use my own Quantity"
                              sx={{ color: '#d4d9e6', fontSize: '0.8rem' }}
                            />
                          </Box>
                        </Grid>
                      </Grid>
                    </Box>
                  </Grid>
                  <Grid item xs={12}  {...({} as any)}>
                    <Box
                      sx={{
                        bgcolor: mode === 'light' ? '#2a3a5e' : '#1a2536',
                        borderLeft: '4px solid #ef4444',
                        p: 2,
                        borderRadius: 1,
                        mb: 2,
                      }}
                    >
                      <Typography
                        variant="h6"
                        sx={{ mb: 1.5, color: '#ef4444', fontSize: '1rem', fontWeight: '500' }}
                      >
                        Daily Risk Limit
                      </Typography>
                      <Grid container spacing={2}>
                        <Grid item xs={12} sm={6}  {...({} as any)}>
                          <TextField
                            fullWidth
                            label="Daily Risk Percentage (Optional)"
                            name="dailyRiskPercentage"
                            type="number"
                            variant="outlined"
                            value={formData.dailyRiskPercentage}
                            onChange={handleChange}
                            inputProps={{ min: 0, max: 100, step: 0.1 }}
                            InputProps={{
                              endAdornment: <InputAdornment position="end">%</InputAdornment>,
                            }}
                            sx={{
                              mb: 1.5,
                              minWidth: '300px',
                              '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#2d3748', color: '#d4d9e6', height: '40px' },
                              '& .MuiInputLabel-root': { color: '#d4d9e6', fontSize: '0.8rem' },
                              '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
                              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
                            }}
                          />
                        </Grid>
                        <Grid item xs={12} sm={6}  {...({} as any)}>
                          <Autocomplete
                            fullWidth
                            options={timezones}
                            getOptionLabel={(option) => option}
                            filterOptions={(options, { inputValue }) =>
                              options.filter((option) =>
                                option.toLowerCase().includes(inputValue.toLowerCase())
                              )
                            }
                            value={formData.timezone || null}
                            onChange={(_event, newValue) => {
                              setFormData({ ...formData, timezone: newValue || '' });
                            }}
                            onInputChange={(_event, newInputValue) => {
                              setTimezoneSearch(newInputValue);
                            }}
                            renderInput={(params) => (
                              <TextField
                                {...params}
                                label="Timezone"
                                variant="outlined"
                                sx={{
                                  mb: 1.5,
                                  minWidth: '300px',
                                  '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#2d3748', color: '#d4d9e6', height: '40px' },
                                  '& .MuiInputLabel-root': { color: '#d4d9e6', fontSize: '0.8rem' },
                                  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b4a7a' },
                                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7aa8' },
                                }}
                              />
                            )}
                            ListboxProps={{
                              style: {
                                maxHeight: 200,
                                backgroundColor: mode === 'light' ? '#2d3748' : '#1e2a4d',
                                color: '#d4d9e6',
                                fontSize: '0.8rem',
                              },
                            }}
                            noOptionsText="No matching timezones"
                          />
                        </Grid>
                      </Grid>
                    </Box>
                  </Grid>
                </Grid>
                {isVerifyButtonVisible && (
                  <Button
                    fullWidth
                    variant="contained"
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    sx={{
                      mt: 2,
                      py: 0.8,
                      borderRadius: 2,
                      textTransform: 'none',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      bgcolor: '#1e40af',
                      color: '#ffffff',
                      '&:hover': { bgcolor: '#15308f' },
                      '&.Mui-disabled': { bgcolor: '#6b7aa8', cursor: 'not-allowed' },
                    }}
                  >
                    Verify Account
                  </Button>
                )}
                <Box sx={{ mt: 2, textAlign: 'center' }}>
                  <Button
                    variant="text"
                    onClick={() => navigate('/dashboard')}
                    sx={{
                      textTransform: 'none',
                      color: '#1e40af',
                      fontSize: '0.85rem',
                      '&:hover': { color: '#15308f' },
                    }}
                  >
                    Back to Dashboard
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Modal
            open={openModal}
            onClose={handleCloseModal}
            aria-labelledby="account-details-modal"
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Card
              sx={{
                width: '90%',
                maxWidth: 400,
                borderRadius: 2,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                bgcolor: mode === 'light' ? '#1e2a4d' : '#0f172a',
                color: '#d4d9e6',
                p: 2.5,
              }}
            >
              <CardContent>
                <Typography
                  id="account-details-modal"
                  variant="h6"
                  gutterBottom
                  fontWeight="500"
                  sx={{ color: '#e6e9f0', fontSize: '1.1rem' }}
                >
                  Verify Account Details
                </Typography>
                <Card
                  sx={{
                    mb: 2,
                    bgcolor: mode === 'light' ? '#2d3748' : '#1e2a4d',
                    borderRadius: 2,
                    boxShadow: '0 1px 4px rgba(0, 0, 0, 0.3)',
                  }}
                >
                  <CardContent>
                    <Typography variant="body1" sx={{ mb: 0.5, color: '#d4d9e6', fontSize: '0.8rem' }}>
                      <strong>Name:</strong> {accountInfo?.name}
                    </Typography>
                    <Typography variant="body1" sx={{ mb: 0.5, color: '#d4d9e6', fontSize: '0.8rem' }}>
                      <strong>Broker:</strong> {accountInfo?.broker}
                    </Typography>
                    <Typography variant="body1" sx={{ mb: 0.5, color: '#d4d9e6', fontSize: '0.8rem' }}>
                      <strong>Balance:</strong> {accountInfo?.balance} {accountInfo?.currency}
                    </Typography>
                    <Typography variant="body1" sx={{ mb: 0.5, color: '#d4d9e6', fontSize: '0.8rem' }}>
                      <strong>Equity:</strong> {accountInfo?.equity} {accountInfo?.currency}
                    </Typography>
                    <Typography variant="body1" sx={{ mb: 0.5, color: '#d4d9e6', fontSize: '0.8rem' }}>
                      <strong>Leverage:</strong> {accountInfo?.leverage}
                    </Typography>
                    <Typography variant="body1" sx={{ mb: 0.5, color: '#d4d9e6', fontSize: '0.8rem' }}>
                      <strong>Platform:</strong> {accountInfo?.platform}
                    </Typography>
                    <Typography variant="body1" sx={{ mb: 0.5, color: '#d4d9e6', fontSize: '0.8rem' }}>
                      <strong>Server:</strong> {accountInfo?.server}
                    </Typography>
                    <Typography variant="body1" sx={{ color: '#d4d9e6', fontSize: '0.8rem' }}>
                      <strong>Login:</strong> {accountInfo?.login}
                    </Typography>
                  </CardContent>
                </Card>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  {isConfirmButtonVisible && (
                    <Button
                      fullWidth
                      variant="contained"
                      onClick={handleConfirm}
                      disabled={isSubmitting}
                      sx={{
                        py: 0.8,
                        borderRadius: 2,
                        textTransform: 'none',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        bgcolor: '#16a34a',
                        color: '#ffffff',
                        '&:hover': { bgcolor: '#15803d' },
                        '&.Mui-disabled': { bgcolor: '#6b7aa8', cursor: 'not-allowed' },
                      }}
                    >
                      Confirm Account
                    </Button>
                  )}
                  <Button
                    fullWidth
                    variant="outlined"
                    onClick={handleCloseModal}
                    sx={{
                      py: 0.8,
                      borderRadius: 2,
                      textTransform: 'none',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      color: '#d4d9e6',
                      borderColor: '#3b4a7a',
                      '&:hover': { bgcolor: '#3b4a7a', borderColor: '#6b7aa8' },
                    }}
                  >
                    Cancel
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Modal>
        </Grid>
      </Box>
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme={mode}
        toastStyle={{
          backgroundColor: mode === 'light' ? '#1e2a4d' : '#0f172a',
          color: '#d4d9e6',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
          fontSize: '0.85rem',
        }}
      />
    </>
  );
};

export default AddAccount;

