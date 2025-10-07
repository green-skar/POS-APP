import { Hono } from 'hono';
import sql from '../src/app/api/utils/sql.js';

const API_BASENAME = '/api';
const api = new Hono();

// Products routes
api.get('/products', async (c) => {
  try {
    const search = c.req.query('search');
    const category = c.req.query('category');
    const lowStock = c.req.query('lowStock');

    let query = 'SELECT * FROM products WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      query += ` AND (LOWER(name) LIKE LOWER(?) OR barcode LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    if (category) {
      paramCount++;
      query += ` AND category = ?`;
      params.push(category);
    }

    if (lowStock === 'true') {
      query += ' AND stock_quantity <= min_stock_level';
    }

    query += ' ORDER BY name ASC';

    const products = await sql(query, params);
    return c.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    return c.json({ error: 'Failed to fetch products' }, 500);
  }
});

api.post('/products', async (c) => {
  try {
    const { name, barcode, price, stock_quantity, min_stock_level, category, description } = await c.req.json();

    if (!name || !price) {
      return c.json({ error: 'Name and price are required' }, 400);
    }

    const result = await sql(`
      INSERT INTO products (name, barcode, price, stock_quantity, min_stock_level, category, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [name, barcode || null, price, stock_quantity || 0, min_stock_level || 10, category || null, description || null]);

    const insertedProduct = await sql(`
      SELECT * FROM products WHERE id = ?
    `, [result.lastInsertRowid]);

    return c.json(insertedProduct[0]);
  } catch (error) {
    console.error('Error creating product:', error);
    return c.json({ error: 'Failed to create product' }, 500);
  }
});

// Barcode route
api.get('/products/barcode/:barcode', async (c) => {
  try {
    const { barcode } = c.req.param();
    const product = await sql(`
      SELECT * FROM products WHERE barcode = ?
    `, [barcode]);

    if (product.length === 0) {
      return c.json({ error: 'Product not found' }, 404);
    }

    return c.json(product[0]);
  } catch (error) {
    console.error('Error fetching product by barcode:', error);
    return c.json({ error: 'Failed to fetch product' }, 500);
  }
});

// Sales routes
api.get('/sales', async (c) => {
  try {
    const sales = await sql(`
      SELECT s.*, 
             GROUP_CONCAT(si.product_id || ':' || si.quantity || ':' || si.unit_price, '|') as items
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `);
    
    return c.json(sales);
  } catch (error) {
    console.error('Error fetching sales:', error);
    return c.json({ error: 'Failed to fetch sales' }, 500);
  }
});

// Get single sale by ID
api.get('/sales/:id', async (c) => {
  try {
    const { id } = c.req.param();
    
    const sale = await sql(`
      SELECT s.*, 
             GROUP_CONCAT(si.product_id || ':' || si.quantity || ':' || si.unit_price, '|') as items
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      WHERE s.id = ?
      GROUP BY s.id
    `, [id]);
    
    if (sale.length === 0) {
      return c.json({ error: 'Sale not found' }, 404);
    }
    
    return c.json(sale[0]);
  } catch (error) {
    console.error('Error fetching sale:', error);
    return c.json({ error: 'Failed to fetch sale' }, 500);
  }
});

api.post('/sales', async (c) => {
  try {
    const { items, payment_method, mpesa_transaction_id } = await c.req.json();

    if (!items || items.length === 0) {
      return c.json({ error: 'Items are required' }, 400);
    }

    if (!payment_method) {
      return c.json({ error: 'Payment method is required' }, 400);
    }

    // Calculate total amount
    let total_amount = 0;
    for (const item of items) {
      total_amount += item.quantity * item.unit_price;
    }

    // Create sale record
    const saleResult = await sql(`
      INSERT INTO sales (total_amount, payment_method, mpesa_transaction_id)
      VALUES (?, ?, ?)
    `, [total_amount, payment_method, mpesa_transaction_id || null]);

    const saleId = saleResult.lastInsertRowid;

    // Create sale items and update stock
    for (const item of items) {
      // Check if product exists and has enough stock
      const product = await sql(`SELECT * FROM products WHERE id = ?`, [item.product_id]);
      if (product.length === 0) {
        throw new Error(`Product with ID ${item.product_id} not found`);
      }

      if (product[0].stock_quantity < item.quantity) {
        throw new Error(`Insufficient stock for ${product[0].name}. Available: ${product[0].stock_quantity}, Requested: ${item.quantity}`);
      }

      // Create sale item
      await sql(`
        INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total_price)
        VALUES (?, ?, ?, ?, ?)
      `, [saleId, item.product_id, item.quantity, item.unit_price, item.quantity * item.unit_price]);

      // Update product stock
      await sql(`
        UPDATE products
        SET stock_quantity = stock_quantity - ?
        WHERE id = ?
      `, [item.quantity, item.product_id]);
    }

    // Get the created sale
    const sale = await sql(`SELECT * FROM sales WHERE id = ?`, [saleId]);
    return c.json(sale[0]);
  } catch (error) {
    console.error('Error creating sale:', error);
    return c.json({ error: error.message || 'Failed to create sale' }, 500);
  }
});

// Alerts routes
api.get('/alerts', async (c) => {
  try {
    const unreadOnly = c.req.query('unreadOnly') === 'true';
    
    let query = `
      SELECT a.*, p.name as product_name, p.stock_quantity, p.min_stock_level
      FROM alerts a
      LEFT JOIN products p ON a.product_id = p.id
      WHERE 1=1
    `;

    if (unreadOnly) {
      query += ' AND a.is_read = false';
    }

    query += ' ORDER BY a.created_at DESC';

    const alerts = await sql(query);
    return c.json(alerts);
  } catch (error) {
    console.error('Error fetching alerts:', error);
    return c.json({ error: 'Failed to fetch alerts' }, 500);
  }
});

api.put('/alerts', async (c) => {
  try {
    const { alert_id } = await c.req.json();
    
    if (!alert_id) {
      return c.json({ error: 'Alert ID is required' }, 400);
    }

    await sql(`
      UPDATE alerts 
      SET is_read = true
      WHERE id = ?
    `, [alert_id]);

    return c.json({ success: true });
  } catch (error) {
    console.error('Error updating alert:', error);
    return c.json({ error: 'Failed to update alert' }, 500);
  }
});

// M-Pesa STK Push endpoint (mock implementation)
api.post('/mpesa/stk-push', async (c) => {
  try {
    const { phone_number, amount, account_reference } = await c.req.json();
    
    // Mock M-Pesa response - in a real implementation, this would call M-Pesa API
    const mockResponse = {
      MerchantRequestID: `ws_CO_${Date.now()}`,
      CheckoutRequestID: `ws_CO_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ResponseCode: '0',
      ResponseDescription: 'Success. Request accepted for processing',
      CustomerMessage: 'Success. Request accepted for processing'
    };
    
    return c.json(mockResponse);
  } catch (error) {
    console.error('Error processing M-Pesa STK Push:', error);
    return c.json({ 
      ResponseCode: '1', 
      ResponseDescription: 'Failed to process request' 
    }, 500);
  }
});

// M-Pesa callback endpoint (mock implementation)
api.post('/mpesa/callback', async (c) => {
  try {
    const callbackData = await c.req.json();
    console.log('M-Pesa Callback received:', callbackData);
    
    // In a real implementation, you would process the payment callback here
    return c.json({ ResultCode: 0, ResultDesc: 'Success' });
  } catch (error) {
    console.error('Error processing M-Pesa callback:', error);
    return c.json({ ResultCode: 1, ResultDesc: 'Failed' }, 500);
  }
});

// Dashboard stats endpoint
api.get('/dashboard/stats', async (c) => {
  try {
    const period = c.req.query('period') || 'today';
    
    // Calculate date range based on period
    let dateFilter = '';
    if (period === 'today') {
      dateFilter = "AND DATE(created_at) = DATE('now')";
    } else if (period === 'week') {
      dateFilter = "AND created_at >= datetime('now', '-7 days')";
    } else if (period === 'month') {
      dateFilter = "AND created_at >= datetime('now', '-30 days')";
    }
    
    // Get sales statistics
    const salesStats = await sql(`
      SELECT 
        COUNT(*) as total_sales,
        COALESCE(SUM(total_amount), 0) as total_revenue
      FROM sales 
      WHERE 1=1 ${dateFilter}
    `);
    
    // Get product statistics
    const productStats = await sql(`
      SELECT 
        COUNT(*) as total_products,
        COUNT(CASE WHEN stock_quantity <= min_stock_level THEN 1 END) as low_stock_count,
        COUNT(CASE WHEN stock_quantity = 0 THEN 1 END) as out_of_stock_count
      FROM products
    `);
    
    // Get recent sales for trend analysis
    const recentSales = await sql(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as sales_count,
        SUM(total_amount) as daily_revenue
      FROM sales 
      WHERE created_at >= datetime('now', '-7 days')
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);
    
    const stats = {
      sales: salesStats[0] || { total_sales: 0, total_revenue: 0 },
      products: productStats[0] || { total_products: 0, low_stock_count: 0, out_of_stock_count: 0 },
      trends: {
        daily_sales: recentSales
      }
    };
    
    return c.json(stats);
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return c.json({ error: 'Failed to fetch dashboard stats' }, 500);
  }
});

// Health check endpoint
api.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export { api, API_BASENAME };

