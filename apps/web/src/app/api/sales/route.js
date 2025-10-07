import sql from "../utils/sql.js";

// Get all sales with optional date filtering
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const status = searchParams.get('status');

    let query = `
      SELECT s.*, 
             COUNT(si.id) as item_count
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (startDate) {
      paramCount++;
      query += ` AND s.created_at >= $${paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      query += ` AND s.created_at <= $${paramCount}`;
      params.push(endDate);
    }

    if (status) {
      paramCount++;
      query += ` AND s.payment_status = $${paramCount}`;
      params.push(status);
    }

    query += ` GROUP BY s.id ORDER BY s.created_at DESC`;

    const sales = await sql(query, params);
    return Response.json(sales);
  } catch (error) {
    console.error('Error fetching sales:', error);
    return Response.json({ error: 'Failed to fetch sales' }, { status: 500 });
  }
}

// Create new sale
export async function POST(request) {
  try {
    const { items, payment_method, mpesa_transaction_id } = await request.json();

    if (!items || items.length === 0) {
      return Response.json({ error: 'Items are required' }, { status: 400 });
    }

    if (!payment_method) {
      return Response.json({ error: 'Payment method is required' }, { status: 400 });
    }

    // Calculate total amount
    let total_amount = 0;
    for (const item of items) {
      total_amount += item.quantity * item.unit_price;
    }

      // Create sale record
    const saleResult = await sql(`
      INSERT INTO sales (total_amount, payment_method) 
      VALUES (?, ?)
    `, [total_amount, payment_method]);
    
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

    return Response.json(result);
  } catch (error) {
    console.error('Error creating sale:', error);
    return Response.json({ error: error.message || 'Failed to create sale' }, { status: 500 });
  }
}