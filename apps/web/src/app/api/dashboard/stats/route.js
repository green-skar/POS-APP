import sql from "@/app/api/utils/sql";

// Get dashboard statistics
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'today'; // today, week, month, year

    let dateFilter = '';
    switch (period) {
      case 'today':
        dateFilter = "AND DATE(created_at) = CURRENT_DATE";
        break;
      case 'week':
        dateFilter = "AND created_at >= CURRENT_DATE - INTERVAL '7 days'";
        break;
      case 'month':
        dateFilter = "AND created_at >= CURRENT_DATE - INTERVAL '30 days'";
        break;
      case 'year':
        dateFilter = "AND created_at >= CURRENT_DATE - INTERVAL '365 days'";
        break;
    }

    // Get sales statistics
    const salesStats = await sql(`
      SELECT 
        COUNT(*) as total_sales,
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COALESCE(AVG(total_amount), 0) as average_sale
      FROM sales 
      WHERE payment_status = 'completed' ${dateFilter}
    `);

    // Get product statistics
    const productStats = await sql`
      SELECT 
        COUNT(*) as total_products,
        COUNT(CASE WHEN stock_quantity <= min_stock_level THEN 1 END) as low_stock_products,
        COUNT(CASE WHEN stock_quantity = 0 THEN 1 END) as out_of_stock_products,
        COALESCE(SUM(stock_quantity * price), 0) as total_inventory_value
      FROM products
    `;

    // Get top selling products
    const topProducts = await sql(`
      SELECT 
        p.name,
        p.price,
        SUM(si.quantity) as total_sold,
        SUM(si.total_price) as total_revenue
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      JOIN sales s ON si.sale_id = s.id
      WHERE s.payment_status = 'completed' ${dateFilter}
      GROUP BY p.id, p.name, p.price
      ORDER BY total_sold DESC
      LIMIT 5
    `);

    // Get recent sales
    const recentSales = await sql(`
      SELECT 
        s.id,
        s.total_amount,
        s.payment_method,
        s.created_at,
        COUNT(si.id) as item_count
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      WHERE s.payment_status = 'completed' ${dateFilter}
      GROUP BY s.id
      ORDER BY s.created_at DESC
      LIMIT 10
    `);

    // Get unread alerts count
    const alertsCount = await sql`
      SELECT COUNT(*) as unread_alerts
      FROM stock_alerts
      WHERE is_read = false
    `;

    return Response.json({
      sales: salesStats[0],
      products: productStats[0],
      top_products: topProducts,
      recent_sales: recentSales,
      alerts_count: alertsCount[0].unread_alerts,
      period
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return Response.json({ error: 'Failed to fetch dashboard statistics' }, { status: 500 });
  }
}