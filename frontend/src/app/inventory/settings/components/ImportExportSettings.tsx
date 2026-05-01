'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { FormSelect } from '@/components/ui/form-select';
import { DatePicker } from '@/components/ui/date-picker';
import { Checkbox } from '@/components/ui/checkbox';
import { format as formatDateFns } from 'date-fns';
import {
  Download,
  Upload,
  History,
  FileText,
  CheckCircle2,
  XCircle,
  RefreshCcw,
  ArrowRight,
  FileSpreadsheet,
  FilePieChart,
  ShieldCheck,
  Barcode,
  Layers,
  AlertCircle,
  Sparkles,
  Table as TableIcon
} from 'lucide-react';
import { api } from '@/lib/api';
import {
  REPORT_TIMELINE_MODE_OPTIONS,
  composeBorrowHistoryExportParams,
  composeMovementExportParams,
  isRolling7DayTimelineMode,
  useImportHistory,
  useImportInventory,
  useExportData,
  useDownloadTemplate,
  ImportHistoryItem,
  ImportHistoryErrorLogEntry,
} from '../lib/useImportExport';
import { useInventoryItems, useInventoryUnits } from '@/app/inventory/items/lib/useItemQueries';
import { User as SystemUser } from '@/app/admin/users/api';
import { logger } from '@/lib/logger';

export function ImportExportSettings() {
  const [page, setPage] = useState(1);
  const perPage = 5;
  const [duplicateMode, setDuplicateMode] = useState('skip');
  const [isIntegrityModalOpen, setIsIntegrityModalOpen] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState<ImportHistoryItem | null>(null);
  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Hooks
  const { data: historyResponse, isLoading: historyLoading } = useImportHistory(page, perPage);
  const mutation = useImportInventory();
  const { exportData } = useExportData();
  const { downloadTemplate } = useDownloadTemplate();
  const { data: itemsResponse } = useInventoryItems({ per_page: 500, is_trackable: true });
  const items = itemsResponse?.data || [];
  const equipmentItems = items.filter((item) => item.is_trackable !== false);

  const [users, setUsers] = useState<SystemUser[]>([]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await api.get<SystemUser[]>('/inventory/data/borrowers');
        setUsers(res.data);
      } catch (err) {
        logger.error('Failed to fetch borrowers for export filter', { error: err });
      }
    };
    fetchUsers();
  }, []);

  // Audit Log Export State
  const [auditParams, setAuditParams] = useState({
    from_date: undefined as Date | undefined,
    to_date: undefined as Date | undefined,
    format: 'csv'
  });

  // Catalog Export State
  const [catalogParams, setCatalogParams] = useState({
    format: 'xlsx'
  });

  // Ledger Export State
  const [borrowParams, setBorrowParams] = useState({
    timeline_mode: '' as '' | 'daily' | 'rolling_7_day' | 'monthly' | 'yearly',
    anchor_date: undefined as Date | undefined,
    status: 'all',
    format: 'xlsx',
    borrower_id: '',
    include_deleted: false,
    include_archived: false,
  });

  const [movementParams, setMovementParams] = useState({
    timeline_mode: '' as '' | 'daily' | 'rolling_7_day' | 'monthly' | 'yearly',
    anchor_date: undefined as Date | undefined,
    item_id: '',
    serial_number: '',
    format: 'xlsx',
    include_deleted: false,
    include_archived: false,
  });

  const selectedMovementItemId = movementParams.item_id || undefined;
  const { data: itemUnitsResponse } = useInventoryUnits(selectedMovementItemId, { per_page: 500 }, Boolean(selectedMovementItemId));
  const itemUnits = itemUnitsResponse?.data || [];

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      mutation.mutate({ file, mode: duplicateMode });
      // Reset input value to allow selecting the same file again
      e.target.value = '';
    }
  };

  const importHistory = historyResponse?.data || [];
  const meta = historyResponse?.meta;
  const borrowHistoryNeedsAnchorDate = isRolling7DayTimelineMode(borrowParams.timeline_mode);
  const equipmentHistoryNeedsAnchorDate = isRolling7DayTimelineMode(movementParams.timeline_mode);
  const serialOptions = selectedMovementItemId
    ? [
      { label: 'All Serials', key: '' },
      ...itemUnits.map((unit) => ({
        label: `${unit.serial_number} (${unit.unit_id})`,
        key: unit.serial_number,
      })),
    ]
    : [];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">

      {/* Import Section */}
      <div className="grid gap-8 lg:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <CardTitle>Import Inventory Catalog</CardTitle>
              <CardDescription>Upload CSV files to bulk update or add inventory items.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex-1 space-y-6">
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed border-border rounded-2xl p-8 flex flex-col items-center justify-center gap-4 bg-muted/10 hover:bg-muted/20 transition-all cursor-pointer group ${mutation.isPending ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".csv"
                onChange={handleFileSelect}
              />
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-muted-foreground group-hover:scale-110 transition-transform">
                {mutation.isPending ? <RefreshCcw className="w-8 h-8 animate-spin" /> : <FileSpreadsheet className="w-8 h-8" />}
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold">{mutation.isPending ? 'Importing...' : 'Click to upload or drag and drop'}</p>
                <p className="text-xs text-muted-foreground mt-1">Accepted format: CSV only (max 10MB)</p>
              </div>
              <button
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:bg-primary/90 transition-colors"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? 'Processing...' : 'Select File'}
              </button>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-primary/10">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <Download className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Download CSV Template</p>
                  <p className="text-xs text-muted-foreground">Standardized template for bulk imports.</p>
                </div>
              </div>
              <button
                onClick={downloadTemplate}
                className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:bg-primary/90"
              >
                Download
              </button>
            </div>

            <div className="grid gap-4">
              <label className="text-sm font-semibold px-1">Duplicate Handling</label>
              <div className="grid grid-cols-2 gap-2">
                {['Skip', 'Overwrite'].map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setDuplicateMode(mode.toLowerCase())}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border ${duplicateMode === mode.toLowerCase()
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-muted-foreground border-border hover:bg-muted'
                      }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
          <CardFooter className="p-6 border-t border-border/50">
            <button
              onClick={() => setIsIntegrityModalOpen(true)}
              className="w-full h-12 flex items-center justify-center gap-2 bg-muted hover:bg-muted/80 text-muted-foreground rounded-xl text-sm font-bold transition-all border border-border/50 hover:border-primary/30 group"
            >
              View Import Rules & Validation <FileText className="w-4 h-4 group-hover:text-primary transition-colors" />
            </button>
          </CardFooter>
        </Card>

        <Card className="flex flex-col">
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              <History className="w-6 h-6" />
            </div>
            <div>
              <CardTitle>Import History</CardTitle>
              <CardDescription>Review and track the status of recent data imports.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border/50 text-muted-foreground bg-muted/5 font-semibold">
                  <tr>
                    <th className="p-4 pl-6">Date</th>
                    <th className="p-4">File Name</th>
                    <th className="p-4 text-center">Status</th>
                    <th className="p-4 pr-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {historyLoading ? (
                    <tr>
                      <td colSpan={4} className="p-12 text-center text-muted-foreground">
                        <RefreshCcw className="w-6 h-6 animate-spin mx-auto mb-2" />
                        Loading history...
                      </td>
                    </tr>
                  ) : importHistory.map((item) => (
                    <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-4 pl-6 text-muted-foreground font-mono">
                        {item.created_at}
                      </td>
                      <td className="p-4 font-semibold">{item.filename}</td>
                      <td className="p-4 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold border capitalize ${item.status === 'completed'
                          ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                          : item.status === 'failed'
                            ? 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                            : 'bg-orange-500/10 text-orange-600 border-orange-500/20'
                          }`}>
                          {item.status === 'completed' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {item.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="p-4 pr-6 text-right">
                        {(item.status === 'failed' || item.status === 'partial_success' || item.error_count > 0) && (
                          <button
                            onClick={() => {
                              setSelectedHistory(item);
                              setIsErrorModalOpen(true);
                            }}
                            className="text-xs text-rose-500 hover:underline font-bold"
                          >
                            View Errors
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!historyLoading && importHistory.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-12 text-center text-muted-foreground italic">
                        No import history found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
          <CardFooter className="p-6 border-t border-border/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="p-2 rounded-lg hover:bg-muted disabled:opacity-30"
              >
                <ArrowRight className="w-4 h-4 rotate-180" />
              </button>
              <span className="text-xs font-bold">Page {page}</span>
              <button
                disabled={!meta || page * perPage >= meta.total}
                onClick={() => setPage(page + 1)}
                className="p-2 rounded-lg hover:bg-muted disabled:opacity-30"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <button className="text-xs text-primary font-bold hover:underline">View Full History</button>
          </CardFooter>
        </Card>
      </div>

      {/* Export Section */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
            <Download className="w-6 h-6" />
          </div>
          <div>
            <CardTitle>Export Data</CardTitle>
            <CardDescription>Export audit logs and ledger data to various formats.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="flex flex-col p-4 rounded-2xl border border-border bg-muted/5">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1 mb-4">Borrow Request History</p>
              <div className="space-y-4 flex-1 mb-4">
                <FormSelect
                  label="Timeline Mode"
                  value={borrowParams.timeline_mode}
                  onChange={(v) => setBorrowParams({ ...borrowParams, timeline_mode: v as typeof borrowParams.timeline_mode, anchor_date: v === 'rolling_7_day' ? borrowParams.anchor_date : undefined })}
                  options={REPORT_TIMELINE_MODE_OPTIONS}
                  placeholder="Select timeline"
                />
                {borrowHistoryNeedsAnchorDate && (
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground px-1">Anchor Date</label>
                    <DatePicker
                      date={borrowParams.anchor_date}
                      onChange={(date) => setBorrowParams({ ...borrowParams, anchor_date: date })}
                      placeholder="Required for rolling 7 day"
                    />
                  </div>
                )}
                <FormSelect
                  label="Specific Borrower (Optional)"
                  value={borrowParams.borrower_id}
                  onChange={(v) => setBorrowParams({ ...borrowParams, borrower_id: v })}
                  options={[
                    { label: 'All Borrowers', key: '' },
                    ...users.map((u) => ({
                    label: `${u.first_name} ${u.last_name} (${u.user_id})`,
                      key: u.user_id,
                    })),
                  ]}
                  placeholder="Search borrowers..."
                />
                <div className="flex flex-wrap gap-6 items-center pt-2 pb-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="b-include-deleted"
                      checked={borrowParams.include_deleted}
                      onCheckedChange={(checked) => setBorrowParams({ ...borrowParams, include_deleted: checked === true })}
                    />
                    <label htmlFor="b-include-deleted" className="text-sm font-bold text-muted-foreground cursor-pointer select-none">
                      Include Deleted
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="b-include-archived"
                      checked={borrowParams.include_archived}
                      onCheckedChange={(checked) => setBorrowParams({ ...borrowParams, include_archived: checked === true })}
                    />
                    <label htmlFor="b-include-archived" className="text-sm font-bold text-muted-foreground cursor-pointer select-none">
                      Include Archived
                    </label>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormSelect
                    label="Status Filter"
                    value={borrowParams.status}
                    onChange={(v) => setBorrowParams({ ...borrowParams, status: v })}
                    options={[
                      { label: 'All Statuses', key: 'all' },
                      { label: 'Pending', key: 'pending' },
                      { label: 'Approved', key: 'approved' },
                      { label: 'Returned', key: 'returned' },
                    ]}
                    placeholder="Select status"
                  />
                  <FormSelect
                    label="Format"
                    value={borrowParams.format}
                    onChange={(v) => setBorrowParams({ ...borrowParams, format: v })}
                    options={[
                      { label: 'Excel (XLSX)', key: 'xlsx' },
                      { label: 'CSV', key: 'csv' },
                    ]}
                    placeholder="Select format"
                  />
                </div>
              </div>
              <button
                onClick={() => exportData('requests', composeBorrowHistoryExportParams(borrowParams))}
                disabled={borrowHistoryNeedsAnchorDate && !borrowParams.anchor_date}
                className="w-full h-10 rounded-lg transition-colors border mt-auto bg-yellow-400 text-yellow-950 border-yellow-300 font-bold text-xs hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Export Borrow Request History
              </button>
            </div>

            <div className="flex flex-col p-4 rounded-2xl border border-border bg-muted/5">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1 mb-4">Equipment History</p>
              <div className="space-y-4 flex-1 mb-4">
                <FormSelect
                  label="Timeline Mode"
                  value={movementParams.timeline_mode}
                  onChange={(v) => setMovementParams({ ...movementParams, timeline_mode: v as typeof movementParams.timeline_mode, anchor_date: v === 'rolling_7_day' ? movementParams.anchor_date : undefined })}
                  options={REPORT_TIMELINE_MODE_OPTIONS}
                  placeholder="Select timeline"
                />
                {equipmentHistoryNeedsAnchorDate && (
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground px-1">Anchor Date</label>
                    <DatePicker
                      date={movementParams.anchor_date}
                      onChange={(date) => setMovementParams({ ...movementParams, anchor_date: date })}
                      placeholder="Required for rolling 7 day"
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <FormSelect
                    label="Specific Equipment"
                    required
                    value={movementParams.item_id}
                    onChange={(v) => setMovementParams({ ...movementParams, item_id: v, serial_number: '' })}
                    options={equipmentItems.map((item) => ({
                      label: `${item.name} (${item.item_id})`,
                      key: item.item_id,
                    }))}
                    placeholder="Select equipment..."
                  />
                  <FormSelect
                    label="Serial Number"
                    value={movementParams.serial_number}
                    onChange={(v) => setMovementParams({ ...movementParams, serial_number: v })}
                    options={serialOptions}
                    placeholder={selectedMovementItemId ? 'Select serial number' : 'Select an item first'}
                    disabled={!selectedMovementItemId}
                  />
                </div>
                <div className="flex flex-wrap gap-6 items-center pt-2 pb-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="e-include-deleted"
                      checked={movementParams.include_deleted}
                      onCheckedChange={(checked) => setMovementParams({ ...movementParams, include_deleted: checked === true })}
                    />
                    <label htmlFor="e-include-deleted" className="text-sm font-bold text-muted-foreground cursor-pointer select-none">
                      Include Deleted
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="e-include-archived"
                      checked={movementParams.include_archived}
                      onCheckedChange={(checked) => setMovementParams({ ...movementParams, include_archived: checked === true })}
                    />
                    <label htmlFor="e-include-archived" className="text-sm font-bold text-muted-foreground cursor-pointer select-none">
                      Include Archived
                    </label>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  <FormSelect
                    label="Format"
                    value={movementParams.format}
                    onChange={(v) => setMovementParams({ ...movementParams, format: v })}
                    options={[
                      { label: 'Excel (XLSX)', key: 'xlsx' },
                      { label: 'CSV', key: 'csv' },
                    ]}
                    placeholder="Select format"
                  />
                </div>
              </div>
              <button
                onClick={() => exportData('movements', composeMovementExportParams(movementParams))}
                disabled={(equipmentHistoryNeedsAnchorDate && !movementParams.anchor_date) || !movementParams.item_id}
                className="w-full h-10 rounded-lg transition-colors border mt-auto bg-yellow-400 text-yellow-950 border-yellow-300 font-bold text-xs hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Export Equipment History
              </button>
            </div>
          </div>

          <div className="grid gap-10 md:grid-cols-2">
            {/* Inventory Catalog */}
            <div className="flex flex-col h-full">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary px-1 mb-6">
                <Barcode className="w-4 h-4" />
                Inventory Catalog (Full State)
              </div>
              <div className="flex flex-col flex-1 gap-4">
                <p className="text-xs text-muted-foreground leading-relaxed px-1">
                  Export all catalog items, individual tracked units (with serials), and consumable batches in a single report.
                </p>
                <FormSelect
                  label="Format"
                  value={catalogParams.format}
                  onChange={(v) => setCatalogParams({ ...catalogParams, format: v })}
                  options={[
                    { label: 'Excel (XLSX)', key: 'xlsx' },
                    { label: 'CSV (Comma Separated)', key: 'csv' },
                  ]}
                  placeholder="Select format"
                />
                <button
                  onClick={() => exportData('catalog', catalogParams)}
                  className="w-full h-11 bg-primary text-primary-foreground rounded-xl text-sm font-bold shadow-lg shadow-primary/20 flex items-center justify-center gap-2 mt-auto"
                >
                  <Download className="w-4 h-4" /> Export Complete State
                </button>
              </div>
            </div>

            {/* Audit Logs */}
            <div className="flex flex-col h-full">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-500 px-1 mb-6">
                <FilePieChart className="w-4 h-4" />
                Audit Logs
              </div>
              <div className="flex flex-col flex-1 gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground px-1">From Date</label>
                    <DatePicker
                      date={auditParams.from_date}
                      onChange={(date) => setAuditParams({ ...auditParams, from_date: date })}
                      placeholder="Select start date"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground px-1">To Date</label>
                    <DatePicker
                      date={auditParams.to_date}
                      onChange={(date) => setAuditParams({ ...auditParams, to_date: date })}
                      placeholder="Select end date"
                    />
                  </div>
                </div>
                <FormSelect
                  label="Format"
                  value={auditParams.format}
                  onChange={(v) => setAuditParams({ ...auditParams, format: v })}
                  options={[
                    { label: 'CSV (Comma Separated Values)', key: 'csv' },
                    { label: 'XLSX (Excel Spreadsheet)', key: 'xlsx' },
                  ]}
                  placeholder="Select format"
                />
                <button
                  onClick={() => exportData('audit', {
                    ...auditParams,
                    from_date: auditParams.from_date ? formatDateFns(auditParams.from_date, 'yyyy-MM-dd') : undefined,
                    to_date: auditParams.to_date ? formatDateFns(auditParams.to_date, 'yyyy-MM-dd') : undefined,
                  })}
                  className="w-full h-11 bg-primary text-primary-foreground rounded-xl text-sm font-bold shadow-lg shadow-primary/20 flex items-center justify-center gap-2 mt-auto"
                >
                  <Download className="w-4 h-4" /> Export Audit Logs
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Integrity Modal */}
      {isIntegrityModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-4xl bg-card border border-border rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-border flex items-center justify-between bg-muted/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Import Rules & Data Integrity</h3>
                  <p className="text-xs text-muted-foreground">Detailed guide on how to structure your CSV for successful bulk ingestion.</p>
                </div>
              </div>
              <button
                onClick={() => setIsIntegrityModalOpen(false)}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
                title="Close Guide"
              >
                <XCircle className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-thin scrollbar-thumb-border">
              {/* High-Level Overview Cards */}
              <div className="grid gap-6 md:grid-cols-2">
                {/* Trackable Items Logic Card */}
                <div className="relative group p-6 rounded-3xl bg-primary/5 border border-primary/10 flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                      <Barcode className="w-6 h-6" />
                    </div>
                    <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 uppercase tracking-widest">Trackable (Equipment)</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold mb-2">Trackable Item Strategy</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Used for unique assets like Laptops, Drones, or Tools. Each row is treated as a <span className="text-primary font-bold">unique physical unit</span>.
                    </p>
                  </div>
                  <ul className="text-xs space-y-2 mt-2">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-primary mt-0.5" />
                      <div><span className="font-bold text-foreground">serial_number:</span> Mandatory and must be unique.</div>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-primary mt-0.5" />
                      <div><span className="font-bold text-foreground">quantity:</span> Ignored (defaults to 1 unit per serial).</div>
                    </li>
                  </ul>
                </div>

                {/* Untrackable/Consumable Logic Card */}
                <div className="relative group p-6 rounded-3xl bg-orange-500/5 border border-orange-500/10 flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                      <Layers className="w-6 h-6" />
                    </div>
                    <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-orange-500/10 text-orange-500 border border-orange-500/20 uppercase tracking-widest">Untrackable (Consumables)</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold mb-2">Bulk Consumable Strategy</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Used for items tracked in <span className="text-primary font-bold">batches</span> such as Masks, Batteries, or Perishables.
                    </p>
                  </div>
                  <ul className="text-xs space-y-2 mt-2">
                    <li className="flex items-start gap-2">
                      <AlertCircle className="w-3.5 h-3.5 text-orange-500 mt-0.5" />
                      <div><span className="font-bold text-foreground">quantity:</span> Mandatory (must be greater than 0).</div>
                    </li>
                    <li className="flex items-start gap-2">
                      <AlertCircle className="w-3.5 h-3.5 text-orange-500 mt-0.5" />
                      <div><span className="font-bold text-foreground">expiration_date:</span> Mandatory for consumables (YYYY-MM-DD).</div>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Advanced Field Reference */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold px-1 flex items-center gap-2">
                  <TableIcon className="w-4 h-4 text-primary" />
                  Validation Matrix
                </h4>
                <div className="rounded-2xl border border-border overflow-hidden bg-muted/5">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 border-b border-border text-muted-foreground">
                      <tr>
                        <th className="p-3 pl-6 text-left font-bold w-1/4">Field (Header)</th>
                        <th className="p-3 text-left font-bold w-1/2">Behavior & Logic</th>
                        <th className="p-3 pr-6 text-left font-bold w-1/4">Constraints</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      <tr>
                        <td className="p-3 pl-6 font-mono font-bold text-primary">category</td>
                        <td className="p-3 text-muted-foreground leading-relaxed text-[11px]">High-level organizational grouping for different departments or functional areas.</td>
                        <td className="p-3 pr-6 italic font-semibold text-primary/80">items_tools, declogging, cmp_pm_acu_pm, pm_set_electrical...</td>
                      </tr>
                      <tr>
                        <td className="p-3 pl-6 font-mono font-bold text-primary">item_type</td>
                        <td className="p-3 text-muted-foreground leading-relaxed text-[11px]">Sub-category for grouping similar equipment or supplies under a classification.</td>
                        <td className="p-3 pr-6 italic font-semibold text-primary/80">electronics, tools, pharmaceuticals...</td>
                      </tr>
                      <tr>
                        <td className="p-3 pl-6 font-mono font-bold text-primary">classification</td>
                        <td className="p-3 text-muted-foreground leading-relaxed">System-wide categorization. Controls whether tracking rules are enforced.</td>
                        <td className="p-3 pr-6 italic font-semibold">equipment, consumable, perishable</td>
                      </tr>
                      <tr>
                        <td className="p-3 pl-6 font-mono font-bold text-primary">is_trackable</td>
                        <td className="p-3 text-muted-foreground leading-relaxed">True = Asset tracking (Requires Serial). False = Batch tracking.</td>
                        <td className="p-3 pr-6 italic font-semibold text-rose-500">true, false</td>
                      </tr>
                      <tr>
                        <td className="p-3 pl-6 font-mono font-bold text-primary">condition</td>
                        <td className="p-3 text-muted-foreground leading-relaxed">The physical state of the item at the time of import.</td>
                        <td className="p-3 pr-6 italic">excellent, good, fair, poor, unusable</td>
                      </tr>
                      <tr>
                        <td className="p-3 pl-6 font-mono font-bold text-primary">serial_number</td>
                        <td className="p-3 text-muted-foreground leading-relaxed font-semibold">Only required if is_trackable is "true".</td>
                        <td className="p-3 pr-6 italic text-primary">Unique Identifier</td>
                      </tr>
                      <tr>
                        <td className="p-3 pl-6 font-mono font-bold text-primary">expiration_date</td>
                        <td className="p-3 text-muted-foreground leading-relaxed font-semibold">Required for any consumable item.</td>
                        <td className="p-3 pr-6 italic text-orange-500 uppercase">YYYY-MM-DD</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Dual Sample Rows */}
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary" />
                    <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Equipment Sample</h4>
                  </div>
                  <div className="bg-muted/30 p-4 rounded-2xl border border-border font-mono text-[9px] overflow-x-auto whitespace-nowrap leading-relaxed opacity-80 hover:opacity-100 transition-opacity">
                    <div className="text-muted-foreground"># Trackable Asset Row</div>
                    name,category,classification,item_type,is_trackable,serial_number
                    <br />
                    "Thermal Scanner (Fluke)","items_tools","equipment","electronics","true","TS-102938"
                    <br />
                    "Emergency Light","declogging","equipment","tools","true","EL-998877"
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-orange-500" />
                    <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Consumable Sample</h4>
                  </div>
                  <div className="bg-muted/30 p-4 rounded-2xl border border-border font-mono text-[9px] overflow-x-auto whitespace-nowrap leading-relaxed opacity-80 hover:opacity-100 transition-opacity">
                    <div className="text-muted-foreground"># Non-Trackable Batch Row</div>
                    name,category,classification,item_type,is_trackable,quantity,expiration_date
                    <br />
                    "Powder Soap","cmp_pm_acu_pm","consumable","cleaning_supplies","false","500","2026-12-01"
                  </div>
                </div>
              </div>

              {/* Pro Tip Box */}
              <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-primary mb-1 tracking-tight">System Refinement: Logic Heuristics</h4>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Our import engine includes "Rescue Mapping". If you accidentally put "Equipment" in the <span className="font-mono">item_type</span> column instead of <span className="font-mono">classification</span>, the system will attempt to intelligently re-map it for you!
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-border bg-muted/5 flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground italic">Need help? Reference the official documentation for full API specs.</p>
              <button
                onClick={() => setIsIntegrityModalOpen(false)}
                className="px-8 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
              >
                Close & Return
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Error Report Modal */}
      {isErrorModalOpen && selectedHistory && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-4xl bg-card border border-border rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-border flex items-center justify-between bg-rose-500/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-rose-600">Import Error Report</h3>
                  <p className="text-xs text-muted-foreground">Detailed logs for <span className="font-bold text-foreground">{selectedHistory.filename}</span></p>
                </div>
              </div>
              <button
                onClick={() => setIsErrorModalOpen(false)}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
              >
                <XCircle className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-0 scrollbar-thin scrollbar-thumb-border">
              <div className="p-6 bg-rose-500/5 border-b border-rose-500/10 mb-2">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-3 rounded-2xl bg-background border border-border">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Total Rows</p>
                    <p className="text-xl font-bold">{selectedHistory.total_rows}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-background border border-emerald-500/20">
                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Success</p>
                    <p className="text-xl font-bold text-emerald-600">{selectedHistory.success_count}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-background border border-rose-500/20">
                    <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest">Failed</p>
                    <p className="text-xl font-bold text-rose-600">{selectedHistory.error_count}</p>
                  </div>
                </div>
              </div>

              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-card border-b border-border z-10">
                  <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    <th className="p-4 pl-6 w-20">Row</th>
                    <th className="p-4 w-1/3">Error Message</th>
                    <th className="p-4 pr-6">Offending Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {Array.isArray(selectedHistory.error_log) && selectedHistory.error_log.map((err: ImportHistoryErrorLogEntry, idx: number) => (
                    <tr key={idx} className="hover:bg-muted/30 transition-colors align-top">
                      <td className="p-4 pl-6 font-mono font-bold text-rose-500">{err.row ?? '-'}</td>
                      <td className="p-4 text-sm font-medium text-foreground leading-relaxed">
                        {err.error ?? 'Unknown error'}
                      </td>
                      <td className="p-4 pr-6">
                        <div className="p-3 rounded-xl bg-muted/30 font-mono text-[10px] text-muted-foreground break-all max-h-32 overflow-y-auto">
                          {err.data ? JSON.stringify(err.data, null, 2) : 'N/A'}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(!selectedHistory.error_log || selectedHistory.error_log.length === 0) && (
                    <tr>
                      <td colSpan={3} className="p-20 text-center text-muted-foreground italic">
                        No detailed error logs found for this import.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-6 border-t border-border bg-muted/5 flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground italic">All changes from this import were rolled back to maintain data integrity.</p>
              <button
                onClick={() => setIsErrorModalOpen(false)}
                className="px-8 py-2.5 bg-rose-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-rose-500/20 hover:scale-105 active:scale-95 transition-all"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
