import { describe, expect, expectTypeOf, it } from 'vitest';
import { buildApiRequestUrl } from '@/lib/apiPath';
import { buildBackupArtifactDownloadPath } from '@/app/admin/backup/api';
import {
  buildExportDownloadPath,
  buildImportTemplateDownloadPath,
  composeBorrowHistoryExportParams,
  composeMovementExportParams,
  isRolling7DayTimelineMode,
} from '@/app/inventory/settings/lib/useImportExport';

describe('same-origin download and import paths', () => {
  it('keeps export endpoint type constrained to known keys', () => {
    expectTypeOf<Parameters<typeof buildExportDownloadPath>[0]>().toEqualTypeOf<'catalog' | 'audit' | 'requests' | 'movements'>();
  });

  it('builds backup artifact download path as same-origin /api route', () => {
    const requestPath = buildBackupArtifactDownloadPath('ART-123');

    expect(requestPath).toBe('/admin/backups/artifacts/ART-123/download');
    expect(buildApiRequestUrl(requestPath)).toBe('/api/admin/backups/artifacts/ART-123/download');
  });

  it('builds export download path as same-origin /api route with query string', () => {
    const requestPath = buildExportDownloadPath('catalog', {
      format: 'xlsx',
      search: 'laptop',
      include_archived: false,
      empty: '',
      ignored: null,
      skipped: undefined,
    });

    expect(requestPath).toBe('/inventory/data/export/catalog?format=xlsx&search=laptop&include_archived=false');
    expect(buildApiRequestUrl(requestPath)).toBe('/api/inventory/data/export/catalog?format=xlsx&search=laptop&include_archived=false');
  });

  it('serializes Date fields as YYYY-MM-DD without request-only filters for movement exports', () => {
    const requestPath = buildExportDownloadPath('movements', {
      format: 'csv',
      timeline_mode: 'rolling_7_day',
      anchor_date: new Date(2026, 3, 13),
      date_from: new Date(2026, 3, 1),
      date_to: new Date(2026, 3, 30),
      serial_number: 'SN-1001',
      include_deleted: true,
      include_archived: false,
      include_receipt_rendered: true,
    });

    expect(requestPath).toBe('/inventory/data/export/ledger/movements?format=csv&timeline_mode=rolling_7_day&anchor_date=2026-04-13&date_from=2026-04-01&date_to=2026-04-30&serial_number=SN-1001&include_deleted=true&include_archived=false&include_receipt_rendered=true');
    expect(buildApiRequestUrl(requestPath)).toBe('/api/inventory/data/export/ledger/movements?format=csv&timeline_mode=rolling_7_day&anchor_date=2026-04-13&date_from=2026-04-01&date_to=2026-04-30&serial_number=SN-1001&include_deleted=true&include_archived=false&include_receipt_rendered=true');
  });

  it('composes borrower export params with backend names and omits all sentinel values', () => {
    const composed = composeBorrowHistoryExportParams({
      format: 'xlsx',
      status: 'all',
      timeline_mode: 'monthly',
      anchor_date: new Date(2026, 2, 10),
      borrower_id: ' BOR-1002 ',
      include_deleted: false,
      include_archived: true,
    });

    const requestPath = buildExportDownloadPath('requests', composed);

    expect(requestPath).toBe('/inventory/data/export/ledger/requests?format=xlsx&timeline_mode=monthly&borrower_id=BOR-1002&include_deleted=false&include_archived=true');
  });

  it('allows legacy borrower export params by sending report_version v1 directly', () => {
    const requestPath = buildExportDownloadPath('requests', {
      format: 'xlsx',
      report_version: 'v1',
      include_receipt_rendered: false,
      include_deleted: false,
      include_archived: false,
    });

    expect(requestPath).toBe('/inventory/data/export/ledger/requests?format=xlsx&report_version=v1&include_receipt_rendered=false&include_deleted=false&include_archived=false');
  });

  it('keeps borrower export unbounded when no timeline mode is selected', () => {
    const requestPath = buildExportDownloadPath('requests', composeBorrowHistoryExportParams({
      format: 'xlsx',
      status: 'all',
      timeline_mode: '',
      borrower_id: '',
      include_deleted: false,
      include_archived: false,
    }));

    expect(requestPath).toBe('/inventory/data/export/ledger/requests?format=xlsx&include_deleted=false&include_archived=false');
  });

  it('does not forward serial_number when composing borrower export params', () => {
    const requestPath = buildExportDownloadPath('requests', composeBorrowHistoryExportParams({
      format: 'xlsx',
      timeline_mode: '',
      include_deleted: false,
      include_archived: false,
      serial_number: 'SN-UI-SHOULD-NOT-SEND',
    }));

    expect(requestPath).toBe('/inventory/data/export/ledger/requests?format=xlsx&include_deleted=false&include_archived=false');
    expect(requestPath).not.toContain('serial_number=');
  });

  it('includes timeline mode when explicitly set to daily', () => {
    const requestPath = buildExportDownloadPath('requests', composeBorrowHistoryExportParams({
      format: 'xlsx',
      timeline_mode: 'daily',
      include_deleted: false,
      include_archived: false,
    }));

    expect(requestPath).toBe('/inventory/data/export/ledger/requests?format=xlsx&timeline_mode=daily&include_deleted=false&include_archived=false');
  });

  it('composes movement export params and keeps anchor_date only for rolling_7_day', () => {
    const monthlyRequestPath = buildExportDownloadPath('movements', composeMovementExportParams({
      format: 'csv',
      item_id: ' ITEM-001 ',
      timeline_mode: 'yearly',
      anchor_date: new Date(2026, 3, 13),
      serial_number: ' SN-001 ',
      include_deleted: true,
      include_archived: false,
    }));

    const rollingRequestPath = buildExportDownloadPath('movements', composeMovementExportParams({
      format: 'csv',
      item_id: 'ITEM-002',
      timeline_mode: 'rolling_7_day',
      anchor_date: new Date(2026, 3, 13),
      serial_number: 'SN-909',
      include_deleted: false,
      include_archived: true,
    }));

    expect(monthlyRequestPath).toBe('/inventory/data/export/ledger/movements?format=csv&item_id=ITEM-001&timeline_mode=yearly&serial_number=SN-001&include_deleted=true&include_archived=false');
    expect(rollingRequestPath).toBe('/inventory/data/export/ledger/movements?format=csv&item_id=ITEM-002&timeline_mode=rolling_7_day&anchor_date=2026-04-13&serial_number=SN-909&include_deleted=false&include_archived=true');
  });

  it('flags rolling timeline mode as anchor-date required', () => {
    expect(isRolling7DayTimelineMode('rolling_7_day')).toBe(true);
    expect(isRolling7DayTimelineMode('daily')).toBe(false);
    expect(isRolling7DayTimelineMode('monthly')).toBe(false);
    expect(isRolling7DayTimelineMode('yearly')).toBe(false);
  });

  it('builds import template download path as same-origin /api route', () => {
    const requestPath = buildImportTemplateDownloadPath();

    expect(requestPath).toBe('/inventory/data/import/template');
    expect(buildApiRequestUrl(requestPath)).toBe('/api/inventory/data/import/template');
  });
});
