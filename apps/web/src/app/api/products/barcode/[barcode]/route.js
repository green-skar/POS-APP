import sql from "../../../utils/sql.js";

// Get product by barcode
export async function GET(request, { params }) {
  try {
    const { barcode } = params;
    const result = await sql`SELECT * FROM products WHERE barcode = ${barcode}`;
    
    if (result.length === 0) {
      return Response.json({ error: 'Product not found' }, { status: 404 });
    }
    
    return Response.json(result[0]);
  } catch (error) {
    console.error('Error fetching product by barcode:', error);
    return Response.json({ error: 'Failed to fetch product' }, { status: 500 });
  }
}