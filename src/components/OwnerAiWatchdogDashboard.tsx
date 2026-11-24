import React, { useMemo, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  EyeOff,
  FileWarning,
  Globe,
  History,
  IndianRupee,
  Info,
  Package,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tag,
  ThumbsDown,
} from 'lucide-react';
import {
  type PendingAiRejectionDraft,
  type WatchdogActivityLog,
  type WatchdogAlert,
  type WatchdogAlertCategory,
  type WatchdogAlertStatus,
  formatInIST,
} from '../defaultData';
import type { WatchdogMetrics } from '../utils/aiWatchdog';

interface OwnerAiWatchdogDashboardProps {
  alerts: WatchdogAlert[];
  logs: WatchdogActivityLog[];
  metrics: WatchdogMetrics;
  scanning: boolean;
  lastScanAt: string | null;
  aiHealthSummary: string;
  geminiStatus: {
    checked: boolean;
    geminiConfigured: boolean;
    model?: string;
    backendError?: string;
  };
  onRunScan: (useGemini?: boolean) => Promise<void>;
  onUpdateAlertStatus: (
    alert: WatchdogAlert,
    nextStatus: WatchdogAlertStatus,
    ownerNote?: string
  ) => Promise<void>;
  onInspectTarget: (alert: WatchdogAlert) => void;
  onRejectAiAlert?: (draft: PendingAiRejectionDraft) => void;
}

const CATEGORY_META: Record<
  WatchdogAlertCategory,
  { label: string; badgeBg: string; badgeText: string; borderColor: string }
> = {
  orders: {
    label: 'Orders',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-800',
    borderColor: 'border-amber-200',
  },
  products: {
    label: 'Products',
    badgeBg: 'bg-indigo-50',
    badgeText: 'text-indigo-800',
    borderColor: 'border-indigo-200',
  },
  pricing: {
    label: 'Pricing',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-800',
    borderColor: 'border-emerald-200',
  },
  website: {
    label: 'Website',
    badgeBg: 'bg-rose-50',
    badgeText: 'text-rose-800',
    borderColor: 'border-rose-200',
  },
};

export const OwnerAiWatchdogDashboard: React.FC<OwnerAiWatchdogDashboardProps> = ({
  alerts,
  logs,
  metrics,
  scanning,
  lastScanAt,
  aiHealthSummary,
  geminiStatus,
  onRunScan,
  onUpdateAlertStatus,
  onInspectTarget,
  onRejectAiAlert,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<'all' | WatchdogAlertCategory>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | WatchdogAlertStatus>('Pending');
  const [onlyCritical, setOnlyCritical] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingAlertId, setSavingAlertId] = useState<string | null>(null);
  const [logCategoryFilter, setLogCategoryFilter] = useState<'all' | WatchdogAlertCategory | 'system'>('all');

  const countsByStatus = useMemo(() => {
    let pending = 0;
    let resolved = 0;
    let ignored = 0;
    for (const a of alerts) {
      if (a.status === 'Pending') pending++;
      else if (a.status === 'Resolved') resolved++;
      else if (a.status === 'Ignored') ignored++;
    }
    return { pending, resolved, ignored, all: alerts.length };
  }, [alerts]);

  const countsByCategory = useMemo(() => {
    const map: Record<'all' | WatchdogAlertCategory, number> = {
      all: 0,
      orders: 0,
      products: 0,
      pricing: 0,
      website: 0,
    };
    for (const a of alerts) {
      if (statusFilter !== 'all' && a.status !== statusFilter) continue;
      map.all++;
      map[a.category] = (map[a.category] || 0) + 1;
    }
    return map;
  }, [alerts, statusFilter]);

  const filteredAlerts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const severityWeight: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    const statusWeight: Record<string, number> = { Pending: 0, Ignored: 1, Resolved: 2 };

    return alerts
      .filter((a) => {
        if (categoryFilter !== 'all' && a.category !== categoryFilter) return false;
        if (statusFilter !== 'all' && a.status !== statusFilter) return false;
        if (onlyCritical && a.severity !== 'critical') return false;
        if (q) {
          const haystack = `${a.title} ${a.explanation} ${a.targetLabel || ''} ${a.recommendedAction}`.toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const sDiff = (statusWeight[a.status] ?? 9) - (statusWeight[b.status] ?? 9);
        if (sDiff !== 0) return sDiff;
        const sevDiff = (severityWeight[a.severity] ?? 9) - (severityWeight[b.severity] ?? 9);
        if (sevDiff !== 0) return sevDiff;
        return (
          new Date(b.updatedAt || b.detectedAt || 0).getTime() -
          new Date(a.updatedAt || a.detectedAt || 0).getTime()
        );
      });
  }, [alerts, categoryFilter, statusFilter, onlyCritical, searchQuery]);

  const filteredLogs = useMemo(() => {
    return logs
      .filter((l) => (logCategoryFilter === 'all' ? true : l.category === logCategoryFilter))
      .slice(0, 60);
  }, [logs, logCategoryFilter]);

  const applyDecisionStatus = async (
    alert: WatchdogAlert,
    nextStatus: WatchdogAlertStatus
  ) => {
    setSavingAlertId(alert.id);
    try {
      const customNote = noteDrafts[alert.id]?.trim();
      await onUpdateAlertStatus(alert, nextStatus, customNote || undefined);
      setNoteDrafts((prev) => {
        const copy = { ...prev };
        delete copy[alert.id];
        return copy;
      });
    } finally {
      setSavingAlertId(null);
    }
  };

  const openAiAlertRejectionFeedback = (
    alert: WatchdogAlert,
    markIgnoredAfter: boolean
  ) => {
    if (!onRejectAiAlert) {
      if (markIgnoredAfter) void applyDecisionStatus(alert, 'Ignored');
      return;
    }
    onRejectAiAlert({
      featureKey: 'ai_watchdog',
      originalRequest: `Watchdog scan (${alert.category}) target: ${alert.targetLabel || alert.targetId || alert.targetType || 'Store'}`,
      rejectedResponse: `[${alert.severity.toUpperCase()}] ${alert.title} — ${alert.explanation} (Suggested: ${alert.recommendedAction})`,
      productId: alert.targetType === 'product' ? alert.targetId : undefined,
      productName: alert.targetType === 'product' ? alert.targetLabel : undefined,
      dismissLabel: markIgnoredAfter ? 'Ignore Without Feedback' : 'Cancel',
      onComplete: markIgnoredAfter
        ? async () => {
            await applyDecisionStatus(alert, 'Ignored');
          }
        : undefined,
    });
  };

  const handleDecision = async (
    alert: WatchdogAlert,
    nextStatus: WatchdogAlertStatus
  ) => {
    if (nextStatus === 'Ignored' && alert.detectedBy === 'gemini_ai' && onRejectAiAlert) {
      openAiAlertRejectionFeedback(alert, true);
      return;
    }
    await applyDecisionStatus(alert, nextStatus);
  };

  const renderSeverityIcon = (severity: WatchdogAlert['severity']) => {
    if (severity === 'critical') return <AlertOctagon size={16} className="text-red-600 shrink-0" />;
    if (severity === 'warning') return <AlertTriangle size={16} className="text-amber-600 shrink-0" />;
    return <Info size={16} className="text-sky-600 shrink-0" />;
  };

  const renderCategoryIcon = (cat: WatchdogAlertCategory) => {
    if (cat === 'orders') return <Package size={14} />;
    if (cat === 'products') return <Tag size={14} />;
    if (cat === 'pricing') return <IndianRupee size={14} />;
    return <Globe size={14} />;
  };

  const getInspectButtonLabel = (alert: WatchdogAlert) => {
    if (alert.targetType === 'order') return 'Inspect Order';
    if (alert.targetType === 'product') {
      return alert.targetId === 'products' ? 'Open Products' : 'Edit Product';
    }
    if (alert.targetType === 'deal') return 'Open Rescue Deals';
    if (alert.targetType === 'offer') return 'Open Scheduled Offers';
    if (alert.targetType === 'campaign') return 'Open Campaigns';
    if (alert.targetId === 'sections') return 'Open Shop Sections';
    if (alert.targetId === 'questions') return 'Open Product Q&A';
    if (alert.targetId === 'aiAssistant') return 'Open AI Assistant';
    return 'Inspect Area';
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-[#d6dec9] bg-gradient-to-br from-[#f6f9f1] via-white to-[#eef4e6] p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#344625] text-white shadow-sm">
              {metrics.criticalAlerts > 0 ? <ShieldAlert size={24} /> : <ShieldCheck size={24} />}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#4f6439]">
                  Playnix Store Protection
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    metrics.criticalAlerts > 0
                      ? 'bg-red-100 text-red-800'
                      : metrics.totalPendingAlerts > 0
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {metrics.criticalAlerts > 0
                    ? `${metrics.criticalAlerts} Critical`
                    : metrics.totalPendingAlerts > 0
                    ? `${metrics.totalPendingAlerts} Pending`
                    : 'All Clear'}
                </span>
              </div>
              <h2 className="mt-0.5 text-xl sm:text-2xl font-bold text-[#222c1a]">
                AI Watchdog Monitoring
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-[#57644b]">
                Real-time inspection across customer orders, product listings, store pricing, and website errors using live database records and Gemini AI.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 shrink-0">
            {lastScanAt && (
              <div className="flex items-center gap-1.5 text-xs text-[#5d6952] bg-white/80 px-3 py-1.5 rounded-lg border border-[#dce3d2]">
                <Clock size={13} />
                <span>Checked {formatInIST(lastScanAt)}</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => void onRunScan(true)}
              disabled={scanning}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#344625] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#26341b] disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw size={15} className={scanning ? 'animate-spin' : ''} />
              {scanning ? 'Scanning Store...' : 'Run Watchdog Scan'}
            </button>
          </div>
        </div>

        {/* Gemini AI Health Brief (shown only when real backend analysis is available) */}
        {(aiHealthSummary || geminiStatus.checked) && (
          <div className="mt-4 rounded-xl border border-[#dce4d0] bg-white/90 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-start gap-2.5 text-xs sm:text-sm text-[#2d3824]">
              <Sparkles size={16} className="text-[#4f6439] mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold text-[#344625]">
                  {geminiStatus.geminiConfigured ? 'Gemini AI Watchdog: ' : 'Rule Watchdog: '}
                </span>
                <span>
                  {aiHealthSummary ||
                    (geminiStatus.geminiConfigured
                      ? `Monitored ${metrics.ordersChecked} orders with ${metrics.totalPendingAlerts} active alert${
                          metrics.totalPendingAlerts === 1 ? '' : 's'
                        }.`
                      : 'Running automated deterministic database checks (configure GEMINI_API_KEY in Secrets to enable deep Gemini reasoning).')}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 6 Real-Data Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <button
          type="button"
          onClick={() => {
            setCategoryFilter('orders');
            setOnlyCritical(false);
          }}
          className="text-left rounded-xl border border-[#dce3d3] bg-white p-3.5 shadow-sm transition hover:border-[#8fa377] cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-[#5b6650]">
            <span>Orders checked</span>
            <Package size={15} className="text-[#4f6439]" />
          </div>
          <div className="mt-2 text-2xl font-bold text-[#1f2917]">{metrics.ordersChecked}</div>
          <div className="mt-0.5 text-[11px] text-[#6d7962]">Total database orders</div>
        </button>

        <button
          type="button"
          onClick={() => {
            setCategoryFilter('orders');
            setStatusFilter('Pending');
            setOnlyCritical(false);
          }}
          className={`text-left rounded-xl border p-3.5 shadow-sm transition cursor-pointer ${
            metrics.suspiciousOrders > 0
              ? 'border-amber-300 bg-amber-50/70 hover:border-amber-400'
              : 'border-[#dce3d3] bg-white hover:border-[#8fa377]'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-[#6b5421]">
            <span>Suspicious orders</span>
            <AlertTriangle
              size={15}
              className={metrics.suspiciousOrders > 0 ? 'text-amber-600' : 'text-[#6e7b63]'}
            />
          </div>
          <div className="mt-2 text-2xl font-bold text-[#1f2917]">{metrics.suspiciousOrders}</div>
          <div className="mt-0.5 text-[11px] text-[#6d7962]">Unreviewed / flagged</div>
        </button>

        <button
          type="button"
          onClick={() => {
            setCategoryFilter('products');
            setStatusFilter('Pending');
            setOnlyCritical(false);
          }}
          className={`text-left rounded-xl border p-3.5 shadow-sm transition cursor-pointer ${
            metrics.productListingIssues > 0
              ? 'border-indigo-300 bg-indigo-50/60 hover:border-indigo-400'
              : 'border-[#dce3d3] bg-white hover:border-[#8fa377]'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-indigo-900">
            <span>Product listing issues</span>
            <FileWarning
              size={15}
              className={metrics.productListingIssues > 0 ? 'text-indigo-600' : 'text-[#6e7b63]'}
            />
          </div>
          <div className="mt-2 text-2xl font-bold text-[#1f2917]">
            {metrics.productListingIssues}
          </div>
          <div className="mt-0.5 text-[11px] text-[#6d7962]">Catalog &amp; metadata gaps</div>
        </button>

        <button
          type="button"
          onClick={() => {
            setCategoryFilter('pricing');
            setStatusFilter('Pending');
            setOnlyCritical(false);
          }}
          className={`text-left rounded-xl border p-3.5 shadow-sm transition cursor-pointer ${
            metrics.priceAnomalies > 0
              ? 'border-emerald-300 bg-emerald-50/70 hover:border-emerald-400'
              : 'border-[#dce3d3] bg-white hover:border-[#8fa377]'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-900">
            <span>Price anomalies</span>
            <IndianRupee
              size={15}
              className={metrics.priceAnomalies > 0 ? 'text-emerald-700' : 'text-[#6e7b63]'}
            />
          </div>
          <div className="mt-2 text-2xl font-bold text-[#1f2917]">{metrics.priceAnomalies}</div>
          <div className="mt-0.5 text-[11px] text-[#6d7962]">Outliers &amp; offer checks</div>
        </button>

        <button
          type="button"
          onClick={() => {
            setCategoryFilter('website');
            setStatusFilter('Pending');
            setOnlyCritical(false);
          }}
          className={`text-left rounded-xl border p-3.5 shadow-sm transition cursor-pointer ${
            metrics.websiteErrors > 0
              ? 'border-rose-300 bg-rose-50/70 hover:border-rose-400'
              : 'border-[#dce3d3] bg-white hover:border-[#8fa377]'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-rose-900">
            <span>Website errors</span>
            <Globe
              size={15}
              className={metrics.websiteErrors > 0 ? 'text-rose-600' : 'text-[#6e7b63]'}
            />
          </div>
          <div className="mt-2 text-2xl font-bold text-[#1f2917]">{metrics.websiteErrors}</div>
          <div className="mt-0.5 text-[11px] text-[#6d7962]">Runtime, API &amp; visibility</div>
        </button>

        <button
          type="button"
          onClick={() => {
            setCategoryFilter('all');
            setStatusFilter('Pending');
            setOnlyCritical((prev) => !prev);
          }}
          className={`text-left rounded-xl border p-3.5 shadow-sm transition cursor-pointer ${
            metrics.criticalAlerts > 0
              ? 'border-red-300 bg-red-50 hover:border-red-400'
              : 'border-[#dce3d3] bg-white hover:border-[#8fa377]'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-red-900">
            <span>Critical alerts</span>
            <AlertOctagon
              size={15}
              className={metrics.criticalAlerts > 0 ? 'text-red-600' : 'text-[#6e7b63]'}
            />
          </div>
          <div className="mt-2 text-2xl font-bold text-red-700">{metrics.criticalAlerts}</div>
          <div className="mt-0.5 text-[11px] text-[#6d7962]">
            {onlyCritical ? 'Filter active (tap to clear)' : 'High-priority pending'}
          </div>
        </button>
      </div>

      {/* Filters Toolbar */}
      <div className="rounded-2xl border border-[#dce3d3] bg-white p-4 shadow-sm space-y-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* Category Filter Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: 'All Issues' },
                { id: 'orders', label: 'Orders' },
                { id: 'products', label: 'Products' },
                { id: 'pricing', label: 'Pricing' },
                { id: 'website', label: 'Website' },
              ] as const
            ).map((tab) => {
              const active = categoryFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCategoryFilter(tab.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-semibold transition cursor-pointer ${
                    active
                      ? 'bg-[#344625] text-white shadow-sm'
                      : 'bg-[#f4f7ef] text-[#3a472e] hover:bg-[#e7eedd]'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[11px] ${
                      active ? 'bg-white/20 text-white' : 'bg-white text-[#4f5d42]'
                    }`}
                  >
                    {countsByCategory[tab.id]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search & Critical Toggle */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:flex-initial min-w-[200px]">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6e7b63]"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search alerts, order IDs, toys..."
                className="w-full rounded-lg border border-[#d6decb] bg-[#fafcf8] pl-8 pr-3 py-1.5 text-xs sm:text-sm text-[#222c1a] placeholder:text-[#7a866f] focus:border-[#4f6439] focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => setOnlyCritical((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                onlyCritical
                  ? 'border-red-400 bg-red-50 text-red-800'
                  : 'border-[#d6decb] bg-white text-[#455338] hover:bg-[#f4f7ef]'
              }`}
            >
              <AlertOctagon size={13} />
              Critical Only
            </button>
          </div>
        </div>

        {/* Status Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-t border-[#edf1e7] pt-3">
          <span className="text-xs font-semibold text-[#647059] mr-1">Status:</span>
          {(
            [
              { id: 'Pending', label: 'Pending', count: countsByStatus.pending },
              { id: 'Resolved', label: 'Resolved', count: countsByStatus.resolved },
              { id: 'Ignored', label: 'Ignored', count: countsByStatus.ignored },
              { id: 'all', label: 'All Statuses', count: countsByStatus.all },
            ] as const
          ).map((st) => {
            const active = statusFilter === st.id;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => setStatusFilter(st.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                  active
                    ? 'bg-[#e6eedb] text-[#28381b] border border-[#b7c89f]'
                    : 'bg-transparent text-[#5a664f] hover:bg-[#f5f8f1] border border-transparent'
                }`}
              >
                <span>{st.label}</span>
                <span className="text-[11px] opacity-80">({st.count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Latest Alerts Section */}
      <div className="rounded-2xl border border-[#dce3d3] bg-white p-4 sm:p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#edf1e7]">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-[#222c1a]">Latest Alerts</h3>
            <p className="text-xs text-[#616e56]">
              Showing {filteredAlerts.length} alert{filteredAlerts.length === 1 ? '' : 's'}
              {statusFilter !== 'all' ? ` (${statusFilter})` : ''}
              {categoryFilter !== 'all' ? ` in ${CATEGORY_META[categoryFilter].label}` : ''}
            </p>
          </div>
        </div>

        {filteredAlerts.length === 0 ? (
          <div className="py-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <ShieldCheck size={24} />
            </div>
            <h4 className="mt-3 text-sm font-bold text-[#222c1a]">
              {statusFilter === 'Pending'
                ? 'No pending alerts in this view'
                : 'No matching alerts found'}
            </h4>
            <p className="mt-1 text-xs text-[#647059] max-w-md mx-auto">
              {statusFilter === 'Pending'
                ? 'Everything monitored in this category looks healthy based on current store data.'
                : 'Try switching category or status filters to inspect past resolved or ignored alerts.'}
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {filteredAlerts.map((alert) => {
              const catStyle = CATEGORY_META[alert.category];
              const isExpanded = expandedAlertId === alert.id;
              const isBusy = savingAlertId === alert.id;

              return (
                <div
                  key={alert.id}
                  className={`rounded-xl border p-3.5 sm:p-4 transition ${
                    alert.status === 'Pending' && alert.severity === 'critical'
                      ? 'border-red-200 bg-red-50/40'
                      : alert.status === 'Pending' && alert.severity === 'warning'
                      ? 'border-amber-200 bg-amber-50/30'
                      : 'border-[#e2e8d8] bg-[#fcfdf9]'
                  }`}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      {/* Badges row */}
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 ${catStyle.badgeBg} ${catStyle.badgeText} ${catStyle.borderColor}`}
                        >
                          {renderCategoryIcon(alert.category)}
                          {catStyle.label}
                        </span>

                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 uppercase tracking-wide ${
                            alert.severity === 'critical'
                              ? 'bg-red-100 text-red-800'
                              : alert.severity === 'warning'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-sky-100 text-sky-800'
                          }`}
                        >
                          {renderSeverityIcon(alert.severity)}
                          {alert.severity}
                        </span>

                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 ${
                            alert.status === 'Pending'
                              ? 'bg-slate-800 text-white'
                              : alert.status === 'Resolved'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-stone-200 text-stone-700'
                          }`}
                        >
                          {alert.status}
                        </span>

                        {alert.detectedBy === 'gemini_ai' && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-2 py-0.5 text-violet-800">
                            <Sparkles size={11} />
                            Gemini AI
                          </span>
                        )}

                        <span className="inline-flex items-center gap-1 text-[#66735a] font-normal ml-auto md:ml-1">
                          <Clock size={11} />
                          {formatInIST(alert.detectedAt)}
                        </span>
                      </div>

                      {/* Title & Explanation */}
                      <h4 className="text-sm sm:text-base font-bold text-[#1f2917] break-words">
                        {alert.title}
                      </h4>
                      <p className="text-xs sm:text-sm text-[#434f38] leading-relaxed">
                        {alert.explanation}
                      </p>

                      {alert.targetLabel && (
                        <div className="text-xs text-[#5d6a52]">
                          <strong className="font-semibold">Affected item:</strong>{' '}
                          <span>{alert.targetLabel}</span>
                        </div>
                      )}

                      {alert.ownerNote && (
                        <div className="rounded-lg bg-white/80 border border-[#dfe6d5] px-3 py-1.5 text-xs text-[#4a573f]">
                          <strong>Note:</strong> {alert.ownerNote}
                        </div>
                      )}
                    </div>

                    {/* Action Controls */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0 md:flex-col md:items-end">
                      <button
                        type="button"
                        onClick={() => onInspectTarget(alert)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#344625] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#26341b] transition cursor-pointer"
                      >
                        <span>{getInspectButtonLabel(alert)}</span>
                        <ArrowUpRight size={13} />
                      </button>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {alert.status !== 'Resolved' && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleDecision(alert, 'Resolved')}
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 cursor-pointer"
                          >
                            <CheckCircle2 size={13} />
                            Resolve
                          </button>
                        )}
                        {alert.status !== 'Ignored' && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleDecision(alert, 'Ignored')}
                            className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-stone-100 px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-200 disabled:opacity-50 cursor-pointer"
                          >
                            {alert.detectedBy === 'gemini_ai' ? <ThumbsDown size={13} /> : <EyeOff size={13} />}
                            {alert.detectedBy === 'gemini_ai' ? 'Reject / Ignore AI' : 'Ignore'}
                          </button>
                        )}
                        {alert.status === 'Ignored' && alert.detectedBy === 'gemini_ai' && onRejectAiAlert && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => openAiAlertRejectionFeedback(alert, false)}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 cursor-pointer"
                          >
                            <ThumbsDown size={13} />
                            Teach AI Why Wrong
                          </button>
                        )}
                        {alert.status !== 'Pending' && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleDecision(alert, 'Pending')}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50 cursor-pointer"
                          >
                            <RotateCcw size={13} />
                            Reopen
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedAlertId((prev) => (prev === alert.id ? null : alert.id))
                          }
                          className="rounded-lg border border-[#d6decb] bg-white px-2.5 py-1.5 text-xs font-medium text-[#4a573f] hover:bg-[#f4f7ef] cursor-pointer"
                        >
                          {isExpanded ? 'Hide Details' : 'Details'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expandable Inspection Panel */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-[#e5ebdc] space-y-2.5 text-xs text-[#434f38]">
                      <div className="rounded-lg bg-[#f4f8ee] border border-[#dce4cf] p-3">
                        <strong className="text-[#28381b]">Recommended Action: </strong>
                        <span>{alert.recommendedAction}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[#66735a]">
                        <span>Detected: {formatInIST(alert.detectedAt)}</span>
                        <span>Last Updated: {formatInIST(alert.updatedAt)}</span>
                        {alert.resolvedAt && <span>Closed: {formatInIST(alert.resolvedAt)}</span>}
                        <span>Source: {alert.detectedBy === 'gemini_ai' ? 'Gemini AI' : 'Automated Rule Audit'}</span>
                      </div>

                      {alert.status === 'Pending' && (
                        <div className="flex flex-col sm:flex-row gap-2 pt-1">
                          <input
                            type="text"
                            value={noteDrafts[alert.id] || ''}
                            onChange={(e) =>
                              setNoteDrafts((prev) => ({ ...prev, [alert.id]: e.target.value }))
                            }
                            placeholder="Optional decision note (e.g., Price verified with vendor)..."
                            className="flex-1 rounded-lg border border-[#d6decb] bg-white px-3 py-1.5 text-xs text-[#222c1a] focus:border-[#4f6439] focus:outline-none"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Activity Log Section */}
      <div className="rounded-2xl border border-[#dce3d3] bg-white p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-[#edf1e7]">
          <div className="flex items-center gap-2">
            <History size={18} className="text-[#4f6439]" />
            <div>
              <h3 className="text-base sm:text-lg font-bold text-[#222c1a]">
                Watchdog Activity Log
              </h3>
              <p className="text-xs text-[#616e56]">
                Audit trail of detected issues, automated scans, and owner decisions
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'orders', label: 'Orders' },
                { id: 'products', label: 'Products' },
                { id: 'pricing', label: 'Pricing' },
                { id: 'website', label: 'Website' },
                { id: 'system', label: 'Scans' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setLogCategoryFilter(f.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                  logCategoryFilter === f.id
                    ? 'bg-[#344625] text-white'
                    : 'bg-[#f4f7ef] text-[#455338] hover:bg-[#e7eedd]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <p className="py-6 text-center text-xs text-[#6b7860]">
            No Watchdog activity recorded yet. Run a scan or inspect alerts to build the audit trail.
          </p>
        ) : (
          <div className="mt-3 max-h-[340px] overflow-y-auto divide-y divide-[#edf1e7] pr-1">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className="py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 text-xs"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <span
                    className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase shrink-0 ${
                      log.action === 'detected'
                        ? 'bg-amber-100 text-amber-800'
                        : log.action === 'resolved' || log.action === 'auto_resolved'
                        ? 'bg-emerald-100 text-emerald-800'
                        : log.action === 'ignored'
                        ? 'bg-stone-200 text-stone-700'
                        : log.action === 'ai_analyzed'
                        ? 'bg-violet-100 text-violet-800'
                        : 'bg-[#eef3e6] text-[#344625]'
                    }`}
                  >
                    {log.action.replace('_', ' ')}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[#222c1a] font-medium break-words">{log.details}</div>
                    <div className="text-[11px] text-[#6d7962]">
                      By {log.actor} · Category: {log.category}
                    </div>
                  </div>
                </div>
                <span className="text-[11px] text-[#6d7962] shrink-0 sm:text-right">
                  {formatInIST(log.at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
