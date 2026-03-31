import sql from "@/app/api/utils/sql";

// Get single sale with items
export async function GET(request, { params }) {
  try {
    const { id } = params;
    
    // Get sale details with user info
    const saleResult = await sql(`
      SELECT s.*, 
             u.username as created_by_username,
             u.full_name as created_by_full_name
      FROM sales s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE s.id = ?
    `, [id]);
    
    if (saleResult.length === 0) {
      return Response.json({ error: 'Sale not found' }, { status: 404 });
    }
    
    // Get sale items with product or service names
    const saleItems = await sql(`
      SELECT 
        si.*,
        COALESCE(p.name, s.name) as item_name,
        CASE WHEN si.product_id IS NOT NULL THEN 'product' ELSE 'service' END as item_type,
        p.name as product_name,
        s.name as service_name
      FROM sale_items si
      LEFT JOIN products p ON si.product_id = p.id
      LEFT JOIN services s ON si.service_id = s.id
      WHERE si.sale_id = ?
      ORDER BY si.id
    `, [id]);
    
    return Response.json({ 
      ...saleResult[0], 
      items: saleItems,
      item_count: saleItems.length 
    });
  } catch (error) {
    console.error('Error fetching sale:', error);
    return Response.json({ error: 'Failed to fetch sale' }, { status: 500 });
  }
}

// Update sale payment status
export async function PUT(request, { params }) {
  try {
    const { id } = params;
    const { payment_status, mpesa_transaction_id } = await request.json();
    
    if (!payment_status) {
      return Response.json({ error: 'Payment status is required' }, { status: 400 });
    }

    const result = await sql`
      UPDATE sales 
      SET payment_status = ${payment_status}, 
          mpesa_transaction_id = ${mpesa_transaction_id || null}
      WHERE id = ${id}
      RETURNING *
    `;
    
    if (result.length === 0) {
      return Response.json({ error: 'Sale not found' }, { status: 404 });
    }

    return Response.json(result[0]);
  } catch (error) {
    console.error('Error updating sale:', error);
    return Response.json({ error: 'Failed to update sale' }, { status: 500 });
  }
}