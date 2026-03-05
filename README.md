# Komando

**A modern shop management system for automotive repair businesses**

![Komando](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![React](https://img.shields.io/badge/React-18.2-61dafb.svg)
![Vite](https://img.shields.io/badge/Vite-5.0-646cff.svg)

Komando is a full-featured shop management application designed for automotive repair shops, with a focus on ADAS calibrations, diagnostics, programming, and automotive services. Built with React and featuring a sleek dark theme.

## ✨ Features

### 📋 Estimates & Invoices
- Create and manage estimates with line items (labor, parts, fees)
- **Seamless conversion** - Estimates convert directly to invoices (EST-0001 → INV-0001)
- Paired document numbering system
- Print-ready PDF generation
- Revert invoices back to estimates when needed

### 👥 Customer Management
- Public and Fleet customer types
- Multiple phone numbers and emails per customer
- Fleet discount support
- Inline customer editing

### 🚗 Vehicle Management
- **FREE VIN Decoder** - Automatically decodes year, make, model, engine, and transmission
- License plate tracking with state
- Engine and transmission details
- Quick links to NHTSA, RepairLink, and ALLDATA

### 📦 Canned Items
- Pre-save common services with pricing
- Organize by categories (e.g., "ADAS Calibrations", "Diagnostics")
- Search and quickly add to estimates
- Include detailed notes for each item

### 💰 Invoicing & Payments
- Record payments (card, cash, check)
- Track payment history and balance
- Automatic status updates (unpaid → partial → paid)
- Due date tracking

### 👤 User Management
- PIN-based login system
- Admin and Technician roles
- Assign technicians to line items
- Automatic note authorship

### ⚙️ Settings
- Configurable labor rate (default $220.50/hr)
- Tax rate settings
- Shop information (name, phone, email)

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- npm (comes with Node.js)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/komando.git
   cd komando
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm start
   ```

4. **Open in browser**
   ```
   http://localhost:5173
   ```

### Windows Users
Simply double-click `START.bat` - it will install dependencies and launch the app automatically.

## 🔐 Default Login

| User | PIN | Role |
|------|-----|------|
| Admin | 1234 | Admin |
| Tech One | 5678 | Technician |

## 📁 Project Structure

```
komando/
├── src/
│   ├── App.jsx        # Main application component
│   ├── main.jsx       # React entry point
│   └── styles.css     # All styles
├── index.html         # HTML template
├── package.json       # Dependencies and scripts
├── vite.config.js     # Vite configuration
├── START.bat          # Windows launcher
└── README.md          # This file
```

## 🛠️ Built With

- **[React 18](https://reactjs.org/)** - UI framework
- **[Vite](https://vitejs.dev/)** - Build tool and dev server
- **[Lucide React](https://lucide.dev/)** - Beautiful icons
- **[NHTSA API](https://vpic.nhtsa.dot.gov/api/)** - Free VIN decoding

## 💾 Data Storage

All data is stored in the browser's localStorage. This means:
- ✅ No server required
- ✅ Data persists between sessions
- ✅ Works offline
- ⚠️ Data is browser-specific
- ⚠️ Clearing browser data will reset the app

## 📱 Screenshots

### Dashboard
The main dashboard shows quick stats, recent estimates, and unpaid invoices.

### Estimate Editor
Full-page editor with customer/vehicle selection, line items, comments, and internal notes.

### Canned Items
Organize pre-saved services by category for quick addition to estimates.

## 🔧 Configuration

### Labor Rate
Default: $220.50/hr - Change in Settings → Rates

### Tax Rate
Default: 9% - Change in Settings → Rates

### Shop Information
Update your shop name, phone, and email in Settings → Business

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📞 Support

For support, please open an issue on GitHub.

## 🙏 Acknowledgments

- [NHTSA](https://www.nhtsa.gov/) for the free VIN decoder API
- [Lucide](https://lucide.dev/) for the beautiful icon set
- Built for [Kaizen Automotive](https://kaizenautomotive.com/)

---

**Made with ❤️ for the automotive repair industry**
