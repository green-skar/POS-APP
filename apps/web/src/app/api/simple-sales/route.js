import { Hono } from 'hono';
import sql from "../utils/sql.js";

const app = new Hono();

// Get all sales
app.get('/', async (c) => {
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

// Create new sale
app.post('/', async (c) => {
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
    const result = sale[0];

    return c.json(result);
  } catch (error) {
    console.error('Error creating sale:', error);
    return c.json({ error: error.message || 'Failed to create sale' }, 500);
  }
});

export default app;
