import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'idash_excluded_rep_ids';

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function saveToStorage(ids) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch { /* no-op */ }
}

export default function useRepExclusions() {
  const [excluded, setExcluded] = useState(loadFromStorage);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) setExcluded(loadFromStorage());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggle = useCallback((id) => {
    if (id == null) return;
    const sid = String(id);
    setExcluded((prev) => {
      const next = prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid];
      saveToStorage(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setExcluded([]);
    saveToStorage([]);
  }, []);

  const isExcluded = useCallback((id) => excluded.includes(String(id)), [excluded]);

  const filterReps = useCallback(
    (reps) => (reps || []).filter((r) => !excluded.includes(String(r?.id ?? ''))),
    [excluded]
  );

  return { excluded, toggle, clear, isExcluded, filterReps };
}
