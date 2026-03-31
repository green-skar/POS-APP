import { getSession } from '../../../../../utils/auth.js';
import { db } from '../../../../../../lib/database.ts';

// Get user analytics and activity logs
export async function GET(request, { params }) {
  try {
    // Get token from cookie header
    const cookieHeader = request.headers.get('cookie') || '';
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map(c => c.trim().split('='))
    );
    const token = cookies.session_token;

    if (!token) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const session = getSession(token);

    if (!session) {
      return Response.json({ error: 'Invalid session' }, { status: 401 });
    }

    // Only super_admin and admin can view user analytics
    if (session.role !== 'super_admin' && session.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const userId = parseInt(params.id);
    if (!userId) {
      return Response.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    // Check if user exists and has access
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    // Admin can only view analytics for users from their store
    if (session.role === 'admin') {
      const userStore = db.prepare(`
        SELECT COUNT(*) as count FROM user_stores WHERE user_id = ? AND store_id = ?
      `).get(userId, session.storeId);
      
      if (userStore.count === 0) {
        return Response.json({ error: 'Unauthorized' }, { status: 403 });
      }
    }

    // Get query parameters for period filtering
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Build date filter
    let dateFilter = '';
    const dateParams = [];
    if (startDate) {
      dateFilter += ' AND s.created_at >= ?';
      dateParams.push(startDate);
    }
    if (endDate) {
      dateFilter += ' AND s.created_at <= ?';
      dateParams.push(endDate + ' 23:59:59');
    }

    // Get sales statistics
    const salesStats = db.prepare(`
      SELECT 
        COUNT(*) as total_sales,
        COALESCE(SUM(s.total_amount), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN s.payment_status = 'completed' THEN s.total_amount ELSE 0 END), 0) as completed_revenue,
        COALESCE(SUM(CASE WHEN s.payment_status = 'pending' THEN s.total_amount ELSE 0 END), 0) as pending_revenue,
        COALESCE(SUM(CASE WHEN s.payment_status = 'failed' THEN s.total_amount ELSE 0 END), 0) as failed_revenue,
        COUNT(DISTINCT DATE(s.created_at)) as active_days
      FROM sales s
      WHERE s.user_id = ? ${dateFilter}
    `).get(userId, ...dateParams);

    // Get customer count (unique sale dates can be used as a proxy for customers served)
    const customerCount = db.prepare(`
      SELECT COUNT(DISTINCT DATE(s.created_at)) as customers_served
      FROM sales s
      WHERE s.user_id = ? ${dateFilter}
    `).get(userId, ...dateParams);

    // Get sales by period (daily, weekly, monthly)
    const dailySales = db.prepare(`
      SELECT 
        DATE(s.created_at) as date,
        COUNT(*) as sales_count,
        COALESCE(SUM(s.total_amount), 0) as revenue
      FROM sales s
      WHERE s.user_id = ? ${dateFilter}
      GROUP BY DATE(s.created_at)
      ORDER BY date DESC
      LIMIT 30
    `).all(userId, ...dateParams);

    const weeklySales = db.prepare(`
      SELECT 
        strftime('%Y-%W', s.created_at) as week,
        COUNT(*) as sales_count,
        COALESCE(SUM(s.total_amount), 0) as revenue
      FROM sales s
      WHERE s.user_id = ? ${dateFilter}
      GROUP BY strftime('%Y-%W', s.created_at)
      ORDER BY week DESC
      LIMIT 12
    `).all(userId, ...dateParams);

    const monthlySales = db.prepare(`
      SELECT 
        strftime('%Y-%m', s.created_at) as month,
        COUNT(*) as sales_count,
        COALESCE(SUM(s.total_amount), 0) as revenue
      FROM sales s
      WHERE s.user_id = ? ${dateFilter}
      GROUP BY strftime('%Y-%m', s.created_at)
      ORDER BY month DESC
      LIMIT 12
    `).all(userId, ...dateParams);

    // Get activity logs
    const activityLogs = db.prepare(`
      SELECT 
        action_type,
        action_description,
        entity_type,
        entity_id,
        metadata,
        created_at
      FROM user_activity_logs
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 100
    `).all(userId);

    // Get top selling items
    const topItems = db.prepare(`
      SELECT 
        COALESCE(p.name, srv.name, 'Service') as item_name,
        COALESCE(si.product_id, 0) as product_id,
        COALESCE(si.service_id, 0) as service_id,
        SUM(si.quantity) as total_quantity,
        SUM(si.total_price) as total_revenue
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      LEFT JOIN products p ON si.product_id = p.id
      LEFT JOIN services srv ON si.service_id = srv.id
      WHERE s.user_id = ? ${dateFilter}
      GROUP BY COALESCE(si.product_id, si.service_id)
      ORDER BY total_revenue DESC
      LIMIT 10
    `).all(userId, ...dateParams);

    // Get payment method breakdown
    const paymentMethods = db.prepare(`
      SELECT 
        payment_method,
        COUNT(*) as count,
        COALESCE(SUM(total_amount), 0) as total_amount
      FROM sales
      WHERE user_id = ? ${dateFilter}
      GROUP BY payment_method
    `).all(userId, ...dateParams);

    return Response.json({
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        email: user.email,
        created_at: user.created_at
      },
      statistics: {
        total_sales: salesStats.total_sales || 0,
        total_revenue: parseFloat(salesStats.total_revenue || 0),
        completed_revenue: parseFloat(salesStats.completed_revenue || 0),
        pending_revenue: parseFloat(salesStats.pending_revenue || 0),
        failed_revenue: parseFloat(salesStats.failed_revenue || 0),
        customers_served: customerCount.customers_served || 0,
        active_days: salesStats.active_days || 0,
        average_sale_amount: salesStats.total_sales > 0 
          ? parseFloat(salesStats.total_revenue || 0) / salesStats.total_sales 
          : 0
      },
      period_breakdown: {
        daily: dailySales,
        weekly: weeklySales,
        monthly: monthlySales
      },
      top_items: topItems,
      payment_methods: paymentMethods,
      activity_logs: activityLogs.map(log => ({
        ...log,
        metadata: log.metadata ? JSON.parse(log.metadata) : null
      }))
    });

  } catch (error) {
    console.error('Get user analytics error:', error);
    return Response.json({ error: 'Failed to get user analytics' }, { status: 500 });
  }
}

