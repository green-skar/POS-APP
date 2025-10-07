import { Hono } from 'hono';
import sql from "../utils/sql.js";

const app = new Hono();

// Get all alerts
app.get('/', async (c) => {
  try {
    const alerts = await sql(`
      SELECT a.*, p.name as product_name
      FROM stock_alerts a
      LEFT JOIN products p ON a.product_id = p.id
      WHERE a.is_read = 0
      ORDER BY a.created_at DESC
    `);
    
    return c.json(alerts);
  } catch (error) {
    console.error('Error fetching alerts:', error);
    return c.json({ error: 'Failed to fetch alerts' }, 500);
  }
});

// Mark alert as read
app.patch('/', async (c) => {
  try {
    const { id } = await c.req.json();

    if (!id) {
      return c.json({ error: 'Alert ID is required' }, 400);
    }

    await sql(`
      UPDATE stock_alerts 
      SET is_read = 1 
      WHERE id = ?
    `, [id]);

    return c.json({ success: true });
  } catch (error) {
    console.error('Error updating alert:', error);
    return c.json({ error: 'Failed to update alert' }, 500);
  }
});

export default app;
