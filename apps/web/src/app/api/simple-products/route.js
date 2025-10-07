import { Hono } from 'hono';
import sql from "../utils/sql.js";

const app = new Hono();

// Get all products
app.get('/', async (c) => {
  try {
    const products = await sql(`
      SELECT * FROM products 
      ORDER BY name ASC
    `);
    
    return c.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    return c.json({ error: 'Failed to fetch products' }, 500);
  }
});

// Create new product
app.post('/', async (c) => {
  try {
    const { name, barcode, price, stock_quantity, min_stock_level, category, description } = await c.req.json();

    if (!name || !price) {
      return c.json({ error: 'Name and price are required' }, 400);
    }

    const result = await sql(`
      INSERT INTO products (name, barcode, price, stock_quantity, min_stock_level, category, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [name, barcode || null, price, stock_quantity || 0, min_stock_level || 10, category || null, description || null]);

    // Get the inserted product
    const insertedProduct = await sql(`
      SELECT * FROM products WHERE id = ?
    `, [result.lastInsertRowid]);

    return c.json(insertedProduct[0]);
  } catch (error) {
    console.error('Error creating product:', error);
    return c.json({ error: 'Failed to create product' }, 500);
  }
});

export default app;
