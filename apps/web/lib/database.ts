import Database from 'better-sqlite3';
import { resolvePosDatabasePath } from './paths.ts';
import { applyDatabaseSchema } from './sqlite-schema.ts';

const dbPath = resolvePosDatabasePath();

export const db = new Database(dbPath);

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

applyDatabaseSchema(db);

export { applyDatabaseSchema };

/** @deprecated Use applyDatabaseSchema(db) for new code; kept for callers that re-init the shared db. */
export function initializeDatabase() {
  applyDatabaseSchema(db);
}

// Sample data for development
export function seedDatabase() {
  // Check if products already exist
  const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number };
  
  if (productCount.count === 0) {
    console.log('🌱 Seeding database with sample data...');
    
    // Insert sample products
    const insertProduct = db.prepare(`
      INSERT INTO products (name, barcode, price, stock_quantity, min_stock_level, category, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const sampleProducts = [
      ['Coca Cola 500ml', '1234567890123', 50.00, 100, 10, 'Beverages', 'Refreshing soft drink'],
      ['Bread Loaf', '1234567890124', 30.00, 50, 5, 'Food', 'Fresh white bread'],
      ['Milk 1L', '1234567890125', 80.00, 25, 5, 'Dairy', 'Fresh whole milk'],
      ['Chocolate Bar', '1234567890126', 25.00, 200, 20, 'Snacks', 'Milk chocolate bar'],
      ['Mineral Water 500ml', '1234567890127', 20.00, 150, 15, 'Beverages', 'Pure mineral water'],
      ['Rice 1kg', '1234567890128', 120.00, 30, 5, 'Food', 'Basmati rice'],
      ['Cooking Oil 1L', '1234567890129', 200.00, 15, 3, 'Cooking', 'Vegetable cooking oil'],
      ['Sugar 1kg', '1234567890130', 80.00, 40, 5, 'Food', 'White granulated sugar'],
      ['Tea Bags 50pcs', '1234567890131', 150.00, 20, 5, 'Beverages', 'Black tea bags'],
      ['Soap Bar', '1234567890132', 35.00, 60, 10, 'Personal Care', 'Antibacterial soap']
    ];

    for (const product of sampleProducts) {
      insertProduct.run(...product);
    }

    console.log('✅ Sample data added successfully');
  } else {
    console.log('📊 Database already has data, skipping seed');
  }

  // Check if services already exist
  const serviceCount = db.prepare('SELECT COUNT(*) as count FROM services').get() as { count: number };
  
  if (serviceCount.count === 0) {
    console.log('🌱 Seeding database with sample cyber services...');
    
    // Insert sample services
    const insertService = db.prepare(`
      INSERT INTO services (name, category, price, price_type, price_config, description, duration, features)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const sampleServices = [
      ['Network Penetration Testing', 'Penetration Testing', 1500.00, 'fixed', null, 'Comprehensive external and internal network security assessment', 40, 'External network scan, Internal network testing, Report delivery, Remediation guidance'],
      ['Web Application Security Audit', 'Security Auditing', 2500.00, 'fixed', null, 'Complete security assessment of web applications including OWASP Top 10', 60, 'Vulnerability scanning, Manual testing, Source code review, Detailed report'],
      ['Vulnerability Assessment', 'Vulnerability Assessment', 800.00, 'adjustable', null, 'Automated vulnerability scanning and assessment of IT infrastructure', 24, 'Automated scanning, Vulnerability prioritization, Risk scoring, Remediation roadmap'],
      ['Security Consulting', 'Security Consulting', 2000.00, 'adjustable', null, 'Strategic security consulting and security architecture review', 80, 'Security strategy, Architecture review, Compliance assessment, Best practices guidance'],
      ['Incident Response Services', 'Incident Response', 3500.00, 'fixed', null, '24/7 incident response and security breach investigation', 40, 'Emergency response, Forensics analysis, Containment strategies, Lessons learned report'],
      ['Security Training', 'Security Training', 1200.00, 'adjustable', null, 'Employee security awareness and training programs', 16, 'Interactive training, Phishing simulation, Best practices, Knowledge assessment'],
      ['Malware Analysis', 'Malware Analysis', 1800.00, 'fixed', null, 'Deep dive malware analysis and reverse engineering', 48, 'Static analysis, Dynamic analysis, Behavioral analysis, Removal recommendations'],
      ['Network Security Hardening', 'Network Security', 2200.00, 'adjustable', null, 'Network security configuration review and hardening', 40, 'Configuration audit, Hardening checklist, Implementation support, Verification testing'],
      ['Data Protection Assessment', 'Data Protection', 1500.00, 'fixed', null, 'Assessment of data security and privacy compliance', 32, 'Data classification, Privacy audit, Encryption review, GDPR compliance'],
      ['Compliance Assessment', 'Compliance', 2800.00, 'fixed', null, 'Security compliance assessment for various standards', 80, 'PCI DSS, HIPAA, ISO 27001, Gap analysis, Remediation plan'],
      ['Printing Services', 'Printing', 0.50, 'calculated', 'Base price: $0.50 per page for black/white, $2.00 per page for color', 'Professional printing services including black/white and color printing', null, 'High quality printing, Multiple paper sizes, Binding options'],
      ['Document Scanning', 'Document Management', 0.25, 'calculated', 'Base price: $0.25 per page scanned', 'Professional document scanning and digitization services', null, 'High resolution scanning, PDF conversion, OCR capabilities'],
      ['Document Printing', 'Printing', 0.30, 'calculated', 'Base price: $0.30 per page for black/white, $0.50 per page for color', 'Quick document printing service', null, 'Black/white and color printing, Multiple paper sizes'],
      ['Photo Printing', 'Printing', 1.00, 'calculated', 'Base price: $1.00 per photo (4x6, 5x7, or 8x10)', 'High-quality photo printing services', null, 'Photo paper quality, Various sizes, Matte or glossy finish'],
      ['Lamination', 'Document Services', 0.75, 'calculated', 'Base price: $0.75 per page laminated', 'Document lamination and protection service', null, 'Various thickness options, ID card lamination, Different sizes'],
      ['Photocopying', 'Document Services', 0.10, 'calculated', 'Base price: $0.10 per page for black/white, $0.30 per page for color', 'Professional photocopying services', null, 'Black/white and color options, Single and double-sided, Various paper sizes'],
      ['Binding Services', 'Document Services', 3.00, 'calculated', 'Base price: $3.00 base + $0.50 per page bound', 'Document binding services', null, 'Spiral binding, Comb binding, Hardcover binding, Wire binding'],
      ['Computer/Internet Access', 'Computer Services', 2.00, 'calculated', 'Base price: $2.00 per hour', 'Computer and internet access rental', null, 'High-speed internet, Office software, Per-hour billing'],
      ['Scan to Email', 'Document Services', 0.50, 'fixed', null, 'Scan documents and send directly to email', null, 'Email delivery, Multiple formats (PDF, JPEG, PNG), Batch scanning'],
      ['Fax Services', 'Document Services', 2.00, 'fixed', null, 'Send and receive fax documents', null, 'Local and international fax, Receive fax service'],
      ['Lamination - ID Card Size', 'Document Services', 2.00, 'fixed', null, 'Lamination service specifically for ID cards', null, 'ID card size, Double-sided protection, Durable finish'],
      ['USB Printing', 'Printing', 0.40, 'calculated', 'Base price: $0.40 per page for black/white, $0.60 per page for color', 'Print directly from USB device', null, 'USB support, Various file formats, Fast printing'],
      ['Resume Printing', 'Document Services', 1.50, 'fixed', null, 'Professional resume printing on high-quality paper', null, 'Premium paper, Professional formatting, Multiple copies']
    ];

    for (const service of sampleServices) {
      insertService.run(...service);
    }

    console.log('✅ Sample cyber services added successfully');
  } else {
    console.log('📊 Services data already exists, skipping seed');
  }
}

// Seed database on import
seedDatabase();

export default db;
