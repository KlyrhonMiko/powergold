'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Package, Settings, Activity,
  Users, ScrollText, ClipboardList, Box, X, History, UserCircle
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { usePublicBranding } from '@/lib/publicBranding';

const systemMeta: Record<string, string> = {
  admin: 'Administration',
  inventory: 'Inventory',
  borrower: 'Borrower',
  borrow_portal: 'Borrow Portal',
  borrowers: 'Borrowers',
};

const navigation: Record<string, { section: string; items: { name: string; href: string; icon: LucideIcon }[] }[]> = {
  admin: [
    {
      section: 'Overview',
      items: [
        { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
        { name: 'User Management', href: '/admin/users', icon: Users },
        { name: 'Entrusted Items', href: '/admin/entrusted-items', icon: Package },
      ]
    },
    {
      section: 'Monitoring',
      items: [
        { name: 'System Logs', href: '/admin/audit_logs', icon: ScrollText },
      ]
    },
    {
      section: 'Configuration',
      items: [
        { name: 'Settings', href: '/admin/settings', icon: Settings },
      ]
    }
  ],
  inventory: [
    {
      section: 'Overview',
      items: [
        { name: 'Dashboard', href: '/inventory/dashboard', icon: LayoutDashboard },
      ]
    },
    {
      section: 'Resources',
      items: [
        { name: 'Equipment', href: '/inventory/items', icon: Package },
        { name: 'Requests', href: '/inventory/requests', icon: ClipboardList },
        { name: 'Request Consumables', href: '/inventory/requests/new', icon: ClipboardList },
      ]
    },
    {
      section: 'Records',
      items: [
        { name: 'Audit Logs', href: '/inventory/audit_logs', icon: ScrollText },
        { name: 'Ledger', href: '/inventory/ledger', icon: Activity },
      ]
    },
    {
      section: 'Account',
      items: [
        { name: 'Profile', href: '/inventory/profile', icon: Users },
        { name: 'Settings', href: '/inventory/settings', icon: Settings },
      ]
    }
  ],
  borrower: [
    {
      section: 'Account',
      items: [
        { name: 'Request History', href: '/borrower/history', icon: ClipboardList },
        { name: 'Profile', href: '/borrower/profile', icon: Users },
      ]
    }
  ],
  borrow_portal: [
    {
      section: 'Borrowing',
      items: [
        { name: 'Request Form', href: '/borrow', icon: Box },
      ]
    }
  ],
  borrowers: [
    {
      section: 'Account',
      items: [
        { name: 'History', href: '/borrowers/history', icon: History },
        { name: 'Account', href: '/borrowers/account', icon: UserCircle },
      ]
    }
  ],
};

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { brandName, logoUrl } = usePublicBranding();

  const getSystem = () => {
    if (pathname.startsWith('/inventory')) return 'inventory';
    if (pathname.startsWith('/admin')) return 'admin';
    if (pathname.startsWith('/borrowers')) return 'borrowers';
    if (pathname.startsWith('/borrower')) return 'borrower';
    if (pathname.startsWith('/borrow')) return 'borrow_portal';
    return null;
  };

  const system = getSystem();
  const navSections = system ? navigation[system] : [];
  const label = system ? systemMeta[system] : null;

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={`
          fixed inset-0 bg-black/25 backdrop-blur-sm z-40 lg:hidden
          transition-opacity duration-300
          ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar panel */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-sidebar flex flex-col
          border-r border-sidebar-border shadow-2xl shadow-black/10
          transition-transform duration-300 ease-in-out
          lg:translate-x-0
          ${open ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Brand */}
        <div className="flex items-center justify-between min-h-[72px] h-auto px-4 shrink-0 border-b border-sidebar-border/30 mb-2 py-3">
          <div className="flex items-center gap-2.5">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt={`${brandName} logo`}
                width={32}
                height={32}
                className="object-contain"
                unoptimized
              />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold font-heading shadow-inner">
                {brandName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex flex-col min-w-0">
              <span className="text-[13px] font-bold font-heading tracking-tight text-sidebar-foreground uppercase leading-[1.15] break-words">
                {brandName.replace(/\s+enterprise$/i, '')}
              </span>
              {/enterprise/i.test(brandName) && (
                <span className="text-[10px] font-medium font-heading text-sidebar-foreground/60 uppercase tracking-wider">
                  Enterprises
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-2 -mr-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* System Indicator */}
        {label && (
          <div className="px-6 pt-4 pb-1 shrink-0">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-primary/80 drop-shadow-sm">
              {label}
            </span>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-3 pb-4 space-y-6 overflow-y-auto mt-2">
          {navSections.map((section) => (
            <div key={section.section} className="space-y-1">
              <h3 className="px-4 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50 mb-2">
                {section.section}
              </h3>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isConsumablesRequestRoute = pathname === '/inventory/requests/new';
                  const isActive = pathname === item.href || (
                    pathname.startsWith(`${item.href}/`) &&
                    !(item.href === '/inventory/requests' && isConsumablesRequestRoute)
                  );
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={onClose}
                      className={`
                        flex items-center gap-3 px-3.5 py-2 rounded-xl
                        text-[13px] font-bold tracking-tight min-h-[40px]
                        transition-all duration-200 group
                        ${isActive
                          ? 'bg-primary/10 text-primary shadow-sm shadow-primary/5 scale-[1.02]'
                          : 'text-muted-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent hover:translate-x-1'
                        }
                      `}
                    >
                      <item.icon className={`w-[18px] h-[18px] shrink-0 transition-transform group-hover:scale-110 ${isActive ? 'text-primary' : 'text-muted-foreground/50 group-hover:text-primary'}`} />
                      <span className="flex-1">{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-6 pb-6 pt-4 shrink-0 border-t border-sidebar-border/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/40" />
              <span className="text-[10px] font-semibold text-muted-foreground/40">v1.2.4-STABLE</span>
            </div>
            <div className="w-2 h-2 rounded-full bg-primary/20 animate-pulse" />
          </div>
        </div>
      </aside>
    </>
  );
}
