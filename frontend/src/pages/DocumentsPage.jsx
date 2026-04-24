/**
 * Documents Page — admin-only read-only viewer over every Google Sheet
 * row ingested into I-Dash (the `google_sheet_metrics` table).
 *
 * Left rail: list of distinct sheet_name values with row counts and
 * last fetched_at. Click a sheet → right pane loads its raw rows.
 *
 * Purpose: audit trail. When Molly keys numbers into TCP MAIN monthly,
 * or a qb_revenue:: sheet updates, this is where the analyst verifies
 * the raw source matches what the dashboards render.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  FolderOpen, FileText, RefreshCw, Loader2, AlertTriangle,
  Calendar, Hash, Database,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { documentsAPI } from '../services/api';

const formatDate = (iso) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return iso; }
};

const formatDateTime = (iso) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch { return iso; }
};

const formatNumber = (v) => {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const DocumentsPage = () => {
  const { isDark } = useTheme();

  const [sheets, setSheets] = useState([]);
  const [loadingSheets, setLoadingSheets] = useState(true);
  const [sheetsError, setSheetsError] = useState(null);

  const [selected, setSelected] = useState(null);
  const [rows, setRows] = useState([]);
  const [rowsTotal, setRowsTotal] = useState(0);
  const [loadingRows, setLoadingRows] = useState(false);
  const [rowsError, setRowsError] = useState(null);

  const cardBg      = isDark ? 'bg-[#1e2235] border border-slate-700/30' : 'bg-white border border-slate-200 shadow-sm';
  const textPri     = isDark ? 'text-white' : 'text-slate-900';
  const textSec     = isDark ? 'text-slate-400' : 'text-slate-500';
  const rowHover    = isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50';
  const rowSelected = isDark ? 'bg-indigo-500/10 border-indigo-500/40' : 'bg-indigo-50 border-indigo-200';
  const border      = isDark ? 'border-slate-700/40' : 'border-slate-200';

  const loadSheets = useCallback(async () => {
    setLoadingSheets(true);
    setSheetsError(null);
    try {
      const { data } = await documentsAPI.listSheets();
      setSheets(data?.sheets || []);
    } catch (err) {
      setSheetsError(err?.response?.data?.detail || err?.message || 'Failed to load sheets');
    } finally {
      setLoadingSheets(false);
    }
  }, []);

  useEffect(() => { loadSheets(); }, [loadSheets]);

  const loadRows = useCallback(async (name) => {
    if (!name) return;
    setLoadingRows(true);
    setRowsError(null);
    try {
      const { data } = await documentsAPI.getSheetRows(name, { limit: 500, offset: 0 });
      setRows(data?.rows || []);
      setRowsTotal(data?.total || 0);
    } catch (err) {
      setRowsError(err?.response?.data?.detail || err?.message || 'Failed to load rows');
      setRows([]);
      setRowsTotal(0);
    } finally {
      setLoadingRows(false);
    }
  }, []);

  useEffect(() => { if (selected) loadRows(selected); }, [selected, loadRows]);

  const totalIngestedRows = useMemo(
    () => sheets.reduce((s, it) => s + (it.row_count || 0), 0),
    [sheets],
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center">
                  <FolderOpen className="text-white" size={20} />
                </div>
                <h1 className={`text-3xl font-bold ${textPri}`}>Documents</h1>
              </div>
              <p className={textSec}>
                Raw Google Sheet data as ingested. Use this to audit any number rendered on the dashboards against its source.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className={`text-xs ${textSec}`}>Total rows across all sheets</p>
                <p className={`text-xl font-semibold ${textPri}`}>{totalIngestedRows.toLocaleString()}</p>
              </div>
              <button
                onClick={loadSheets}
                disabled={loadingSheets}
                className="p-2 rounded-lg border border-slate-600/40 hover:border-indigo-500/60 transition-colors"
                title="Refresh sheet list"
              >
                <RefreshCw size={14} className={loadingSheets ? 'animate-spin text-indigo-400' : textSec} />
              </button>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">

          {/* LEFT: sheet list */}
          <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
            className={`rounded-xl overflow-hidden ${cardBg}`}>
            <div className={`px-4 py-3 border-b ${border} flex items-center gap-2`}>
              <Database size={14} className="text-emerald-400" />
              <p className={`text-xs font-semibold uppercase tracking-wide ${textSec}`}>
                Sheets ({sheets.length})
              </p>
            </div>

            {loadingSheets && (
              <div className="p-6 flex items-center gap-2 justify-center">
                <Loader2 className="animate-spin text-emerald-400" size={16} />
                <span className={`text-xs ${textSec}`}>Loading sheets…</span>
              </div>
            )}

            {!loadingSheets && sheetsError && (
              <div className="m-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs flex items-start gap-2">
                <AlertTriangle size={13} className="mt-0.5" />
                <div>{sheetsError}</div>
              </div>
            )}

            {!loadingSheets && !sheetsError && sheets.length === 0 && (
              <div className="p-6 text-center">
                <p className={`text-xs ${textSec}`}>No Google Sheet data ingested yet. Run the google_sheets pipeline from Data Pipelines to populate.</p>
              </div>
            )}

            {!loadingSheets && !sheetsError && sheets.length > 0 && (
              <div className="max-h-[600px] overflow-y-auto">
                {sheets.map((sh) => {
                  const isSel = selected === sh.sheet_name;
                  return (
                    <button
                      key={sh.sheet_name}
                      onClick={() => setSelected(sh.sheet_name)}
                      className={`w-full text-left px-4 py-3 border-b ${border} ${rowHover} transition-colors ${isSel ? rowSelected : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <FileText size={13} className={isSel ? 'text-indigo-400' : textSec} />
                        <span className={`text-sm font-medium truncate ${textPri}`}>{sh.sheet_name}</span>
                      </div>
                      <div className={`mt-1 flex items-center gap-3 text-[11px] ${textSec}`}>
                        <span className="flex items-center gap-1">
                          <Hash size={10} /> {sh.row_count.toLocaleString()}
                        </span>
                        <span>· {sh.distinct_metric_count} metric{sh.distinct_metric_count === 1 ? '' : 's'}</span>
                      </div>
                      <p className={`mt-0.5 text-[10px] ${textSec}`}>
                        Last sync {formatDateTime(sh.last_fetched)}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>

          {/* RIGHT: rows for selected sheet */}
          <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
            className={`rounded-xl overflow-hidden ${cardBg}`}>
            {!selected && (
              <div className="p-16 text-center">
                <FileText size={40} className={`mx-auto mb-3 ${textSec} opacity-50`} />
                <p className={`text-sm ${textSec}`}>Select a sheet on the left to view its rows.</p>
              </div>
            )}

            {selected && (
              <>
                <div className={`px-5 py-4 border-b ${border} flex items-center justify-between flex-wrap gap-2`}>
                  <div>
                    <h3 className={`text-lg font-semibold ${textPri}`}>{selected}</h3>
                    <p className={`text-xs ${textSec}`}>
                      {rowsTotal.toLocaleString()} total row{rowsTotal === 1 ? '' : 's'}
                      {rowsTotal > rows.length && ` · showing first ${rows.length}`}
                    </p>
                  </div>
                  <button
                    onClick={() => loadRows(selected)}
                    disabled={loadingRows}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-600/40 hover:border-indigo-500/60 transition-colors"
                  >
                    <RefreshCw size={12} className={loadingRows ? 'animate-spin text-indigo-400' : textSec} />
                    <span className={textSec}>Refresh</span>
                  </button>
                </div>

                {loadingRows && (
                  <div className="p-10 flex items-center gap-2 justify-center">
                    <Loader2 className="animate-spin text-indigo-400" size={18} />
                    <span className={textSec}>Loading rows…</span>
                  </div>
                )}

                {!loadingRows && rowsError && (
                  <div className="m-5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm flex items-start gap-2">
                    <AlertTriangle size={13} className="mt-0.5" />
                    <div>{rowsError}</div>
                  </div>
                )}

                {!loadingRows && !rowsError && rows.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className={`border-b ${border}`}>
                        <tr className={`text-left text-xs uppercase tracking-wider ${textSec}`}>
                          <th className="py-2.5 px-4">
                            <div className="flex items-center gap-1"><Calendar size={11} /> Date</div>
                          </th>
                          <th className="py-2.5 px-4">Metric</th>
                          <th className="py-2.5 px-4">Category</th>
                          <th className="py-2.5 px-4 text-right">Value</th>
                          <th className="py-2.5 px-4">Fetched</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, idx) => (
                          <tr key={r.id} className={`border-b ${border} ${idx % 2 === 0 ? '' : (isDark ? 'bg-slate-800/20' : 'bg-slate-50/50')}`}>
                            <td className={`py-2 px-4 font-mono text-xs ${textPri}`}>{formatDate(r.date)}</td>
                            <td className={`py-2 px-4 ${textPri}`}>{r.metric_name}</td>
                            <td className={`py-2 px-4 ${textSec}`}>{r.category}</td>
                            <td className={`py-2 px-4 text-right font-mono ${textPri}`}>{formatNumber(r.metric_value)}</td>
                            <td className={`py-2 px-4 text-[11px] ${textSec}`}>{formatDateTime(r.fetched_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {!loadingRows && !rowsError && rows.length === 0 && (
                  <div className="p-10 text-center">
                    <p className={`text-sm ${textSec}`}>This sheet has no rows ingested yet.</p>
                  </div>
                )}
              </>
            )}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

export default DocumentsPage;
