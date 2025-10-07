import sql from "@/app/api/utils/sql";

// Get single sale with items
export async function GET(request, { params }) {
  try {
    const { id } = params;
    
    const saleResult = await sql`
      SELECT s.*, 
             JSON_AGG(
               JSON_BUILD_OBJECT(
                 'id', si.id,
                 'product_id', si.product_id,
                 'product_name', p.name,
                 'quantity', si.quantity,
                 'unit_price', si.unit_price,
                 'total_price', si.total_price
               )
             ) as items
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      LEFT JOIN products p ON si.product_id = p.id
      WHERE s.id = ${id}
      GROUP BY s.id
    `;
    
    if (saleResult.length === 0) {
      return Response.json({ error: 'Sale not found' }, { status: 404 });
    }
    
    return Response.json(saleResult[0]);
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