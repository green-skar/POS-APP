import sql from "@/app/api/utils/sql";

// Get single product by ID
export async function GET(request, { params }) {
  try {
    const { id } = params;
    const result = await sql`SELECT * FROM products WHERE id = ${id}`;
    
    if (result.length === 0) {
      return Response.json({ error: 'Product not found' }, { status: 404 });
    }
    
    return Response.json(result[0]);
  } catch (error) {
    console.error('Error fetching product:', error);
    return Response.json({ error: 'Failed to fetch product' }, { status: 500 });
  }
}

// Update product
export async function PUT(request, { params }) {
  try {
    const { id } = params;
    const updates = await request.json();
    
    const allowedFields = ['name', 'barcode', 'price', 'stock_quantity', 'min_stock_level', 'category', 'description'];
    const setClauses = [];
    const values = [];
    let paramCount = 0;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key) && value !== undefined) {
        paramCount++;
        setClauses.push(`${key} = $${paramCount}`);
        values.push(value);
      }
    }

    if (setClauses.length === 0) {
      return Response.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    paramCount++;
    values.push(id);

    const query = `
      UPDATE products 
      SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await sql(query, values);
    
    if (result.length === 0) {
      return Response.json({ error: 'Product not found' }, { status: 404 });
    }

    return Response.json(result[0]);
  } catch (error) {
    console.error('Error updating product:', error);
    if (error.code === '23505') {
      return Response.json({ error: 'Barcode already exists' }, { status: 400 });
    }
    return Response.json({ error: 'Failed to update product' }, { status: 500 });
  }
}

// Delete product
export async function DELETE(request, { params }) {
  try {
    const { id } = params;
    const result = await sql`DELETE FROM products WHERE id = ${id} RETURNING *`;
    
    if (result.length === 0) {
      return Response.json({ error: 'Product not found' }, { status: 404 });
    }
    
    return Response.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    return Response.json({ error: 'Failed to delete product' }, { status: 500 });
  }
}