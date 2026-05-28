import Link from 'next/link';
import {
  Package,
  ClipboardList,
  FileText,
  ScrollText,
  ArrowRight,
} from 'lucide-react';

const actions = [
  {
    label: 'Equipment',
    description: 'Manage stock',
    href: '/inventory/items',
    icon: Package,
    accent: 'text-yellow-600 dark:text-yellow-400',
    bg: 'bg-yellow-100/50 dark:bg-yellow-500/10',
  },
  {
    label: 'Requests',
    description: 'Borrow queue',
    href: '/inventory/requests',
    icon: ClipboardList,
    accent: 'text-yellow-600 dark:text-yellow-400',
    bg: 'bg-yellow-100/50 dark:bg-yellow-500/10',
  },
  {
    label: 'Request Consumables',
    description: 'Submit stock request',
    href: '/inventory/requests/new',
    icon: ClipboardList,
    accent: 'text-yellow-600 dark:text-yellow-400',
    bg: 'bg-yellow-100/50 dark:bg-yellow-500/10',
  },
  {
    label: 'Audit Logs',
    description: 'Activity trail',
    href: '/inventory/audit_logs',
    icon: ScrollText,
    accent: 'text-yellow-600 dark:text-yellow-400',
    bg: 'bg-yellow-100/50 dark:bg-yellow-500/10',
  },
  {
    label: 'Ledger',
    description: 'Movement log',
    href: '/inventory/ledger',
    icon: FileText,
    accent: 'text-yellow-600 dark:text-yellow-400',
    bg: 'bg-yellow-100/50 dark:bg-yellow-500/10',
  },
];

export function QuickActionsPanel() {
  return (
    <div className="rounded-xl bg-card border border-border flex flex-col flex-1">
      <div className="px-5 pt-5 pb-4">
        <h2 className="text-base font-semibold font-heading">Quick Actions</h2>
      </div>
      <div className="px-2 pb-2 flex flex-col gap-1">
        {actions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="group flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <div className={`shrink-0 flex items-center justify-center w-9 h-9 rounded-lg ${action.bg}`}>
              <action.icon className={`w-4 h-4 ${action.accent}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{action.label}</p>
              <p className="text-xs text-muted-foreground">{action.description}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground/0 group-hover:text-muted-foreground transition-all group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </div>
  );
}
