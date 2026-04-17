import React, { createContext, useContext, useState, useCallback } from 'react';

/**
 * ExportContext — lets individual pages register their exportable data so
 * the global Export button in the Header can offer CSV/PDF of the
 * currently visible page.
 *
 * Usage on a page:
 *   const { registerExport } = useExport();
 *   useEffect(() => registerExport({
 *     title: 'Contractor Breakdown',
 *     rows: contractors,
 *     columns: [{ key: 'name', label: 'Contractor' }, { key: 'visits', label: 'Visits' }, ...],
 *   }), [contractors]);
 *
 * The Header then reads the current payload and produces a CSV on demand.
 */

const ExportContext = createContext({
  payload: null,
  registerExport: () => {},
  clearExport: () => {},
});

export const ExportProvider = ({ children }) => {
  const [payload, setPayload] = useState(null);

  const registerExport = useCallback((data) => {
    setPayload(data);
  }, []);

  const clearExport = useCallback(() => {
    setPayload(null);
  }, []);

  return (
    <ExportContext.Provider value={{ payload, registerExport, clearExport }}>
      {children}
    </ExportContext.Provider>
  );
};

export const useExport = () => useContext(ExportContext);

/**
 * CSV helper — escape any cell that contains commas, quotes, or newlines.
 */
export const toCSV = (rows, columns) => {
  if (!rows || !rows.length) return '';
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = columns.map((c) => escape(c.label)).join(',');
  const body = rows
    .map((row) => columns.map((c) => escape(row[c.key])).join(','))
    .join('\n');
  return `${header}\n${body}`;
};

export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 100);
};
