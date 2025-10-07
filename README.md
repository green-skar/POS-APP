# POS System - Point of Sale Application

A modern, full-featured Point of Sale (POS) system built with React, Tauri, and SQLite. This application provides a complete solution for retail businesses with both desktop and mobile app support.

## 🚀 Features

### Core POS Functionality
- **Product Management**: Add, edit, and manage inventory
- **Sales Processing**: Complete checkout with multiple payment methods
- **Barcode Scanning**: Support for barcode-based product lookup
- **Real-time Inventory**: Live stock level tracking
- **Multi-payment Support**: Cash, Card, and M-Pesa payments

### Admin Dashboard
- **Analytics Dashboard**: Real-time sales statistics and trends
- **Inventory Management**: Stock level monitoring and alerts
- **Sales Reports**: Detailed sales history and reporting
- **Low Stock Alerts**: Automated notifications for restocking

### Technical Features
- **Desktop App**: Built with Tauri for native performance
- **Mobile App**: React Native for iOS and Android
- **Local Database**: SQLite for offline-first operation
- **Real-time Updates**: Live data synchronization
- **Responsive Design**: Works on all screen sizes

## 🛠️ Tech Stack

### Frontend
- **React 18** with React Router v7
- **Vite** for fast development and building
- **Tailwind CSS** for styling
- **React Query** for data fetching and caching
- **Lucide React** for icons

### Backend
- **Hono** for API server
- **SQLite** for local database
- **Better SQLite3** for database operations

### Desktop App
- **Tauri** for native desktop application
- **Rust** backend for system integration

### Mobile App
- **React Native** with Expo
- **Expo Router** for navigation

## 📦 Installation

### Prerequisites
- Node.js 18+ 
- Rust (for desktop app)
- Expo CLI (for mobile app)

### Desktop App Setup
```bash
# Install dependencies
cd apps/web
npm install

# Install Tauri CLI
npm install -g @tauri-apps/cli

# Run development server
npm run dev:tauri

# Build desktop app
npm run build:tauri
```

### Mobile App Setup
```bash
# Install dependencies
cd apps/mobile
npm install

# Start Expo development server
npm start

# Run on iOS simulator
npm run ios

# Run on Android emulator
npm run android
```

### Web App Setup
```bash
# Install dependencies
cd apps/web
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## 🗄️ Database Setup

The application uses SQLite for local data storage. The database is automatically initialized with the following tables:

- **products**: Product inventory and details
- **sales**: Sales transactions
- **sale_items**: Individual items in each sale
- **alerts**: Stock alerts and notifications

### Seeding Demo Data
```bash
cd apps/web
npm run seed
```

This will populate the database with sample products, sales, and alerts for development and testing.

## 🚀 API Endpoints

### Products
- `GET /api/products` - List all products (with search, category, lowStock filters)
- `POST /api/products` - Create new product
- `GET /api/products/barcode/:barcode` - Get product by barcode

### Sales
- `GET /api/sales` - List all sales (with date/status filters)
- `POST /api/sales` - Create new sale
- `GET /api/sales/:id` - Get individual sale details

### Alerts
- `GET /api/alerts` - List alerts (with unreadOnly filter)
- `PUT /api/alerts` - Mark alert as read

### Dashboard
- `GET /api/dashboard/stats` - Get dashboard statistics (with period filtering)

### Payments
- `POST /api/mpesa/stk-push` - Initiate M-Pesa payment
- `POST /api/mpesa/callback` - Handle M-Pesa payment callback

## 📱 Usage

### POS System
1. **Add Products**: Use the admin interface to add products to inventory
2. **Process Sales**: Add items to cart and complete checkout
3. **Handle Payments**: Accept cash, card, or M-Pesa payments
4. **Track Inventory**: Monitor stock levels and receive alerts

### Admin Dashboard
1. **View Analytics**: Check sales statistics and trends
2. **Manage Inventory**: Add, edit, or remove products
3. **Monitor Alerts**: Review low stock and system alerts
4. **Generate Reports**: Export sales and inventory reports

## 🔧 Development

### Project Structure
```
create-anything/
├── apps/
│   ├── web/                 # Desktop app (Tauri + React)
│   │   ├── src/
│   │   │   ├── app/         # React Router pages
│   │   │   └── components/  # Reusable components
│   │   ├── src-tauri/       # Tauri configuration
│   │   └── lib/             # Database and utilities
│   └── mobile/              # Mobile app (React Native)
│       ├── src/
│       └── app/
├── packages/                # Shared packages
└── README.md
```

### Database Schema
The SQLite database includes:
- Product management with categories and barcodes
- Sales tracking with multiple payment methods
- Stock level monitoring and alerts
- Foreign key constraints for data integrity

## 🚀 Deployment

### Desktop App
The Tauri app can be built for Windows, macOS, and Linux:
```bash
npm run build:tauri
```

### Mobile App
Build for app stores using Expo:
```bash
expo build:android
expo build:ios
```

### Web App
Deploy to any static hosting service:
```bash
npm run build
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue on GitHub
- Check the documentation
- Review the API endpoints

## 🎯 Roadmap

- [ ] Real M-Pesa integration
- [ ] Multi-location support
- [ ] Advanced reporting
- [ ] User management
- [ ] Cloud synchronization
- [ ] Offline mode improvements

---

Built with ❤️ using React, Tauri, and SQLite
