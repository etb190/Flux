/* ── Home page data (Cinemeta addon catalogs + TMDB via main process) ──── */

import { useCallback, useRef, useState } from 'react';

function fluxApi() {
  return typeof window !== 'undefined' ? window.fluxAPI : null;
}

export function useHome() {
  const [status, setStatus] = useState('idle'); // idle|loading|error|ready
  const [data, setData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const seqRef = useRef(0);
  const loadedRef = useRef(false);
  const loadingRef = useRef(false);

  const load = useCallback(async (force) => {
    const seq = ++seqRef.current;
    loadingRef.current = true;
    if (force || !loadedRef.current) setStatus('loading');
    try {
      const api = fluxApi();
      if (!api || typeof api.getHome !== 'function') {
        if (seq === seqRef.current) {
          setErrorMsg('Home data is unavailable in this build.');
          setStatus('error');
        }
        loadingRef.current = false;
        return;
      }
      const payload = await api.getHome();
      if (seq !== seqRef.current) return;    // a newer load superseded this one
      loadingRef.current = false;
      if (payload && payload.error) {
        setErrorMsg(String(payload.error));
        setStatus('error');
      } else {
        setData(payload);
        loadedRef.current = true;
        setStatus('ready');
      }
    } catch (_err) {
      if (seq !== seqRef.current) return;
      loadingRef.current = false;
      setErrorMsg(
        'Couldn\u2019t reach the addon catalogs. Check your connection and try again.'
      );
      setStatus('error');
    }
  }, []);

  // Settings saved (backend/country changed) → next open of home refetches.
  const invalidate = useCallback(() => {
    loadedRef.current = false;
  }, []);

  return { status, data, errorMsg, load, invalidate, loadedRef, loadingRef };
}
