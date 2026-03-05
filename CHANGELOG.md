# Changelog

All notable changes to Komando will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-02-16

### Added
- **Estimates & Invoices**
  - Full-page estimate editor with line items (labor, parts, fees)
  - Seamless estimate to invoice conversion (EST-0001 → INV-0001)
  - Paired document numbering system
  - Print-ready PDF generation for estimates and invoices
  - Revert invoices back to estimates

- **Customer Management**
  - Public and Fleet customer types
  - Multiple phone numbers and emails per customer
  - Fleet discount support with automatic calculation
  - Inline customer editing from estimate page

- **Vehicle Management**
  - FREE VIN Decoder using NHTSA API
  - Automatic year, make, model, engine, transmission decoding
  - License plate tracking with state
  - Quick links to NHTSA, RepairLink, and ALLDATA

- **Canned Items**
  - Pre-save common services with pricing
  - Organize by categories
  - Search and quick-add to estimates
  - Detailed notes support

- **Invoicing & Payments**
  - Record payments (card, cash, check)
  - Track payment history and running balance
  - Automatic status updates (unpaid → partial → paid)
  - Due date tracking (30 days default)

- **User Management**
  - PIN-based login system
  - Admin and Technician roles
  - Assign technicians to line items
  - Automatic note authorship tracking

- **Settings**
  - Configurable labor rate ($220.50/hr default)
  - Tax rate settings (9% default)
  - Shop information (name, phone, email)
  - Data management (clear all data)

- **UI/UX**
  - Modern dark theme
  - Responsive design
  - Toast notifications
  - Print-optimized views

### Technical
- Built with React 18 and Vite 5
- localStorage for data persistence
- No backend required
- Single-page application
