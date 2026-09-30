# DukaFlow Modernization V6

Implemented against the existing codebase without rebuilding the application.

## Dashboard
- Real dashboard KPI data from PostgreSQL/API.
- Real 7/30/90-day sales overview.
- Interactive SVG chart with hover/focus tooltips.
- Real payment-method breakdown for today.
- Real top products for the last 7 days.
- Real low-stock list.
- Real recent transactions.
- Dynamic business insights based on actual data.
- Loading, empty and error states.
- Auto-refresh every 60 seconds.

## Navigation
- Reduced primary sidebar to core business sections.
- Secondary sections are grouped into collapsible Business, Management and System groups.
- Mobile bottom navigation remains focused on core sections.

## Account
- Modern profile hero with live account/business information.
- More attractive account dropdown in the top bar.
- Password change flow preserved and improved visually.
- No secrets moved to the frontend.

## Sales History
- Added real customer/staff fields.
- Added server-side search/payment/status filters and pagination contract.
- Removed undefined-style rendering risk.
- Kept existing sale/receipt actions.

## Backend
- Dashboard trend comparisons are calculated from yesterday's real data.
- Dashboard sales overview accepts 7, 30 and 90 days.
- Sales overview includes transaction counts.
- Sales list supports search/payment/status/page/limit.

## Validation
- Node syntax checks passed for modified JavaScript files.
- Existing tenant static test passed.
