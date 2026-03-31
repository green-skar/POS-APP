import sql from "../utils/sql.js";
import { getSession } from "../../../utils/auth.js";
import { getCookie } from "../../../utils/cookies.js";

// Get all sales with optional date filtering
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const status = searchParams.get('status');

    let query = `
      SELECT s.*, 
             COUNT(si.id) as item_count,
             u.username as created_by_username,
             u.full_name as created_by_full_name
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      LEFT JOIN users u ON s.user_id = u.id
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

    // Validate all items BEFORE creating the sale
    for (const item of items) {
      if (!item.product_id && !item.service_id) {
        return Response.json({ error: 'Each item must have either product_id or service_id' }, { status: 400 });
      }
      
      if (!item.quantity || item.quantity <= 0) {
        return Response.json({ error: 'Each item must have a valid quantity greater than 0' }, { status: 400 });
      }
      
      if (!item.unit_price || item.unit_price <= 0) {
        return Response.json({ error: 'Each item must have a valid unit_price greater than 0' }, { status: 400 });
      }

      if (item.service_id) {
        // Validate service exists
        const service = await sql(`SELECT * FROM services WHERE id = ?`, [item.service_id]);
        if (service.length === 0) {
          return Response.json({ error: `Service with ID ${item.service_id} not found` }, { status: 400 });
        }
      } else if (item.product_id) {
        // Validate product exists and has enough stock
        const product = await sql(`SELECT * FROM products WHERE id = ?`, [item.product_id]);
        if (product.length === 0) {
          return Response.json({ error: `Product with ID ${item.product_id} not found` }, { status: 400 });
        }

        if (product[0].stock_quantity < item.quantity) {
          return Response.json({ 
            error: `Insufficient stock for ${product[0].name}. Available: ${product[0].stock_quantity}, Requested: ${item.quantity}` 
          }, { status: 400 });
        }
      }
    }

    // Calculate total amount after validation
    let total_amount = 0;
    for (const item of items) {
      total_amount += item.quantity * item.unit_price;
    }

    if (total_amount <= 0) {
      return Response.json({ error: 'Total amount must be greater than 0' }, { status: 400 });
    }

    // Set payment status based on payment method
    // M-Pesa starts as 'pending', others are 'completed'
    const payment_status = payment_method === 'mpesa' ? 'pending' : 'completed';

    // Get session for user_id
    const cookieHeader = request.headers.get('cookie') || '';
    const token = getCookie(cookieHeader, 'session_token');
    const session = token ? getSession(token) : null;

    // Use database transaction to ensure atomicity - if any part fails, rollback everything
    const { db: database } = await import('../../../../lib/database.js');
    
    // Check if sales table has user_id column (outside transaction)
    const salesColumns = database.prepare("PRAGMA table_info(sales)").all();
    const hasUserId = salesColumns.some(col => col.name === 'user_id');
    
    // Build INSERT statement based on available columns
    let insertFields = 'total_amount, payment_method, payment_status';
    let insertValues = [total_amount, payment_method, payment_status];
    
    if (hasUserId && session?.userId) {
      insertFields += ', user_id';
      insertValues.push(session.userId);
    }
    
    if (mpesa_transaction_id) {
      insertFields += ', mpesa_transaction_id';
      insertValues.push(mpesa_transaction_id);
    }
    
    let saleId;
    try {
      const transaction = database.transaction(() => {
        // Create sale record with appropriate payment status
        const saleResult = sql(`
          INSERT INTO sales (${insertFields}) 
          VALUES (${insertValues.map(() => '?').join(', ')})
        `, insertValues);
        
        const sid = saleResult.lastInsertRowid;

        // Create sale items and update stock (all validations passed)
        let itemsInserted = 0;
        for (const item of items) {
          // Check if item is a service or product
          const isService = item.is_service || (item.service_id && !item.product_id);
          
          if (isService && item.service_id) {
            // Create sale item for service (service_id field, product_id = NULL)
            sql(`
              INSERT INTO sale_items (sale_id, product_id, service_id, quantity, unit_price, total_price)
              VALUES (?, NULL, ?, ?, ?, ?)
            `, [sid, item.service_id, item.quantity, item.unit_price, item.quantity * item.unit_price]);
            itemsInserted++;
          } else if (item.product_id) {
            // Create sale item for product (product_id field, service_id = NULL)
            sql(`
              INSERT INTO sale_items (sale_id, product_id, service_id, quantity, unit_price, total_price)
              VALUES (?, ?, NULL, ?, ?, ?)
            `, [sid, item.product_id, item.quantity, item.unit_price, item.quantity * item.unit_price]);

            // Update product stock
            sql(`
              UPDATE products 
              SET stock_quantity = stock_quantity - ?
              WHERE id = ?
            `, [item.quantity, item.product_id]);
            itemsInserted++;
          } else {
            throw new Error('Item must have either product_id or service_id');
          }
        }
        
        // Verify that all items were inserted successfully
        if (itemsInserted === 0) {
          throw new Error('No sale items were created');
        }
        
        if (itemsInserted !== items.length) {
          throw new Error(`Only ${itemsInserted} of ${items.length} items were created`);
        }
        
        return sid;
      });

      // Execute transaction - will rollback automatically if any error occurs
      saleId = transaction();
      
      // Get the created sale
      const sale = await sql(`SELECT * FROM sales WHERE id = ?`, [saleId]);
      const result = sale[0];

      return Response.json(result);
    } catch (transactionError) {
      // If transaction fails, the sale should be rolled back automatically
      // But if sale was created outside transaction, delete it manually
      if (saleId) {
        try {
          sql(`DELETE FROM sales WHERE id = ?`, [saleId]);
        } catch (deleteError) {
          console.error('Failed to clean up sale after transaction error:', deleteError);
        }
      }
      throw transactionError;
    }
  } catch (error) {
    console.error('Error creating sale:', error);
    return Response.json({ error: error.message || 'Failed to create sale' }, { status: 500 });
  }
}