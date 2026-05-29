# PowerGold Deployment Changelog

- `1.0.0` - release
- `1.1.0` - version testing
- `1.2.0` - added detailed imports
- `1.3.0` - deployment bundle updates, branding updates, image layout split, and stricter versioned app-stack image resolution
- `1.4.0` - optional user emails, admin user management validation updates, and frontend test alignment
- `1.5.0` - added user import
- `1.5.1` - streamlined the borrower equipment flow, enforced borrow quantity stock limits, and prevented request-table overflow from long item and borrower names
- `1.6.0`
  - Exports and reporting: overhauled inventory/admin XLSX exports with styled title rows, colored headers, alternating rows, frozen filters, material batch detail sheets, scope-aware catalog exports, improved borrow/equipment history titles and timeline filters, searchable export selectors, cleaner report filenames, and production-readiness validation plus user-import fixes
  - Performance hardening: added faster admin and inventory dashboards via overview endpoints, snapshot-based inventory list and borrower catalog reads, paginated borrower catalog loading instead of full preloads, bulk borrow-request assignment option loading and grouped assignment submission, borrow-request bulk serialization improvements, inventory/borrowing index additions, and an inventory snapshot backfill plus `ANALYZE` utility for client deployments
  - Borrowing and receipts: updated the IVM material flow so IVM can directly request materials, changed inventory-health status handling so items at or above the 25% threshold show as low stock, and updated receipts for requested materials
  - UI refinements: refined the user management and IV manager dashboards with better visual hierarchy and inventory-health color management
  - Inventory lifecycle controls: added approved-request voiding with a visible `voided` status and history event, material batch closing for empty batches, equipment unit removal from inventory screens for eligible terminal statuses, edit locks for borrowed or entrusted units until returned, and proper confirmation modals for batch closing, unit removal, and entrusted-item revocation
