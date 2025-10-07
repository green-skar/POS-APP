import sql from "../utils/sql.js";

// Get all products with optional search and category filter
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const category = searchParams.get('category');
    const lowStock = searchParams.get('lowStock');

    let query = 'SELECT * FROM products WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      query += ` AND (LOWER(name) LIKE LOWER($${paramCount}) OR barcode LIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    if (category) {
      paramCount++;
      query += ` AND category = $${paramCount}`;
      params.push(category);
    }

    if (lowStock === 'true') {
      query += ' AND stock_quantity <= min_stock_level';
    }

    query += ' ORDER BY name ASC';

    const products = await sql(query, params);
    return Response.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    return Response.json({ error: 'Failed to fetch products' }, { status: 500 });
  }
}

// Create new product
export async function POST(request) {
  try {
    const { name, barcode, price, stock_quantity, min_stock_level, category, description } = await request.json();

    if (!name || !price) {
      return Response.json({ error: 'Name and price are required' }, { status: 400 });
    }

    const result = await sql(`
      INSERT INTO products (name, barcode, price, stock_quantity, min_stock_level, category, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [name, barcode || null, price, stock_quantity || 0, min_stock_level || 10, category || null, description || null]);
    
    // Get the inserted product
    const insertedProduct = await sql(`
      SELECT * FROM products WHERE id = ?
    `, [result.lastInsertRowid]);

    return Response.json(insertedProduct[0]);
  } catch (error) {
    console.error('Error creating product:', error);
    if (error.code === '23505') { // Unique constraint violation
      return Response.json({ error: 'Barcode already exists' }, { status: 400 });
    }
    return Response.json({ error: 'Failed to create product' }, { status: 500 });
  }
}