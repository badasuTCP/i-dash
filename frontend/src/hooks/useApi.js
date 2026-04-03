import { useState, useEffect, useCallback } from 'react';

export const useApi = (apiFunction, dependencies = [], options = {}) => {
  const {
    autoFetch = true,
    polling = false,
    pollInterval = 5000,
    onSuccess = null,
    onError = null,
  } = options;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(autoFetch);
  const [error, setError] = useState(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFunction();
      setData(result.data);
      if (onSuccess) onSuccess(result.data);
      return result.data;
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || 'An error occurred';
      setError(errorMessage);
      if (onError) onError(err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [apiFunction, onSuccess, onError]);

  const refetch = useCallback(() => {
    return fetch();
  }, [fetch]);

  useEffect(() => {
    if (autoFetch) {
      fetch();
    }
  }, [autoFetch, ...dependencies]);

  // Polling
  useEffect(() => {
    if (!polling) return;

    const interval = setInterval(() => {
      fetch();
    }, pollInterval);

    return () => clearInterval(interval);
  }, [polling, pollInterval, fetch]);

  return {
    data,
    loading,
    error,
    refetch,
    fetch,
  };
};

export default useApi;
