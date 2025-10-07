import sql from "../utils/sql.js";

// Get stock alerts
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get('unreadOnly') === 'true';

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
    return Response.json(alerts);
  } catch (error) {
    console.error('Error fetching alerts:', error);
    return Response.json({ error: 'Failed to fetch alerts' }, { status: 500 });
  }
}

// Mark alert as read
export async function PUT(request) {
  try {
    const { alert_id } = await request.json();
    
    if (!alert_id) {
      return Response.json({ error: 'Alert ID is required' }, { status: 400 });
    }

    const result = await sql(`
      UPDATE alerts 
      SET is_read = true
      WHERE id = ?
    `, [alert_id]);

    if (result.length === 0) {
      return Response.json({ error: 'Alert not found' }, { status: 404 });
    }

    return Response.json(result[0]);
  } catch (error) {
    console.error('Error updating alert:', error);
    return Response.json({ error: 'Failed to update alert' }, { status: 500 });
  }
}