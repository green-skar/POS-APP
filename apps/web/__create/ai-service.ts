import { sql } from './route-builder';

interface BusinessContext {
  analytics: any;
  sales: any[];
  products: any[];
  services: any[];
  expenses: any[];
  inventory: any[];
}

interface SystemPrompt {
  role: string;
  directives: string[];
  capabilities: string[];
  tone: string;
}

// Advanced AI Service with natural language understanding and database access
export class AIService {
  private openaiApiKey: string | null = null;
  
  constructor() {
    // Get API key from environment variables
    // On server-side: process.env.OPENAI_API_KEY
    // On client-side: will be passed from API route
    this.openaiApiKey = null;
  }
  
  setApiKey(key: string | null) {
    this.openaiApiKey = key;
  }
  
  hasApiKey(): boolean {
    return this.openaiApiKey !== null && this.openaiApiKey !== '';
  }
  
  // Generate AI response with business context and internet access
  async generateResponse(
    message: string,
    context: BusinessContext,
    conversationHistory: any[]
  ): Promise<string> {
    try {
      // If API key is available and valid, use OpenAI
      if (this.hasApiKey()) {
        console.log('Using OpenAI API with key:', this.openaiApiKey?.substring(0, 10) + '...');
        return await this.callOpenAI(message, context, conversationHistory);
      } else {
        console.log('No API key available, using enhanced local AI');
        return await this.enhancedLocalAI(message, context, conversationHistory);
      }
    } catch (error: any) {
      console.error('AI Service Error:', error);
      console.log('Falling back to enhanced local AI...');
      return this.enhancedLocalAI(message, context, conversationHistory);
    }
  }
  
  // Call OpenAI API with business context
  private async callOpenAI(message: string, context: BusinessContext, history: any[]): Promise<string> {
    try {
      console.log('Calling OpenAI API...');
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.openaiApiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo', // Using GPT-3.5 for now (cheaper and faster)
          messages: [
            {
              role: 'system',
              content: this.buildSystemPrompt(context)
            },
            ...history.slice(-10).map((msg: any) => ({
              role: msg.role,
              content: msg.content
            })),
            {
              role: 'user',
              content: message
            }
          ],
          temperature: 0.7,
          max_tokens: 1000
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('OpenAI API Error:', errorData);
        throw new Error(errorData.error?.message || 'OpenAI API request failed');
      }
      
      const data = await response.json();
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        console.error('Unexpected OpenAI response format:', data);
        throw new Error('Invalid response from OpenAI API');
      }
      
      return data.choices[0].message.content;
    } catch (error: any) {
      console.error('OpenAI API call failed:', error);
      throw error; // Re-throw to be caught by fallback
    }
  }
  
  // Build system prompt with business data
  private buildSystemPrompt(context: BusinessContext): string {
    // Check if this is filter details context (has meta and stats structure)
    const isFilterDetailsContext = context && (context as any).meta && (context as any).stats;
    const stats = isFilterDetailsContext ? (context as any).stats : null;
    const meta = isFilterDetailsContext ? (context as any).meta : null;
    
    // Build data section based on context type
    let dataSection = '';
    if (isFilterDetailsContext && stats) {
      // Filter details context - prioritize this data
      dataSection = `📊 CURRENT FILTER DETAILS DATA (USE THIS DATA - IT'S THE PRIMARY SOURCE):

Item/Category Information:
- Name: ${meta?.name || 'N/A'}
- Type: ${meta?.type || 'N/A'}
${meta?.category ? `- Category: ${meta.category}` : ''}
${meta?.sku ? `- SKU: ${meta.sku}` : ''}
${meta?.product_count ? `- Products in Category: ${meta.product_count}` : ''}
${meta?.service_count ? `- Services in Category: ${meta.service_count}` : ''}

Performance Metrics (ACTUAL DATA - USE THESE NUMBERS):
- Units Sold: ${stats.total_quantity || 0}
- Total Revenue: $${parseFloat(stats.total_revenue || 0).toFixed(2)}
- COGS (Cost of Goods Sold): $${parseFloat(stats.total_expenses || 0).toFixed(2)}
- Profit: $${parseFloat(stats.profit || 0).toFixed(2)}
- Profit Margin: ${parseFloat(stats.profit_margin || 0).toFixed(2)}%
- Total Sales Count: ${stats.total_sales || 0}
- Returns: ${stats.total_returns || 0} units

⚠️ CRITICAL: Analyze and provide insights based EXACTLY on the numbers above. DO NOT use general business data when filter details data is provided.
`;
    } else {
      // General business context
      dataSection = `📊 BUSINESS DATA ACCESS:

Sales & Revenue:
- Total Revenue: $${context.analytics?.revenue || 0}
- Total Profit: $${context.analytics?.profit || 0}
- Profit Margin: ${context.analytics?.profit_margin || 0}%
- Total Sales: ${context.analytics?.sales_count || 0}

Products & Inventory:
- Total Products: ${context.products?.length || 0}
- Categories: ${[...new Set(context.products?.map((p: any) => p.category))].join(', ') || 'Various'}
- Low Stock Items: ${context.products?.filter((p: any) => p.stock_quantity <= p.min_stock_level).length || 0}

Expenses:
- Total Expenses: $${context.expenses?.reduce((sum: number, e: any) => sum + parseFloat(e.amount || 0), 0).toFixed(2) || 0}
- Expense Count: ${context.expenses?.length || 0}
`;
    }
    
    return `You are an advanced AI assistant embedded in a Point of Sale (POS) application. You function like ChatGPT — capable of natural, context-aware conversation — but with additional access to internal application data and file generation tools.

🎯 PRIMARY DIRECTIVES:

1. Respond in a natural, helpful, and conversational way, similar to ChatGPT
2. Use the application's data to:
   - Retrieve relevant data when asked
   - Summarize, interpret, or analyze that data for insights
   - Generate visualizations, reports, or downloadable files (CSV, PDF, JSON, XLSX) when requested
3. Always confirm before performing large data operations, updates, or deletions
4. When data access is required, describe what you're retrieving
5. When generating files, ask what format the user wants
6. Always include reasoning or explanation in your answers — not just raw results
7. Be context-aware: reference past messages and conversation history
8. **CRITICAL**: When filter details data is provided, use ONLY that data for analysis. Do not reference general business metrics.

${dataSection}

🔧 YOUR CAPABILITIES:

1. Answer questions about business performance using actual data
2. Provide actionable insights and recommendations
3. Help with inventory management, pricing, and sales strategy
4. Generate downloadable reports (CSV, JSON, PDF, XLSX)
5. Execute actions: update products, add expenses, create items
6. Analyze trends and provide forecasting
7. Access real-time market insights and industry best practices

🔗 AVAILABLE API ENDPOINTS:
- GET /api/products → fetch all products
- GET /api/sales → fetch sales data
- GET /api/expenses → fetch expenses
- GET /api/analytics/summary → get business overview
- POST /api/products → create product
- PUT /api/products/:id → update product
- POST /api/expenses → create expense
- Generate exports (CSV, JSON, XLSX) for any data

📋 TONE & STYLE:
- Polite, confident, concise, and professional
- Always structured when giving data-related answers (tables, bullet points, charts)
- Never hallucinate data — only use what the app provides
- Be conversational and natural like ChatGPT
- Provide specific numbers and actionable recommendations

💡 EXAMPLE BEHAVIORS:
- When asked "Give me a weekly summary of sales" → query sales data → calculate totals → provide insights
- When asked "Generate a sales report as CSV" → query data → create downloadable file
- When asked general questions → respond like ChatGPT — clearly and informatively

⚠️ IMPORTANT:
- Always confirm before large operations or deletions
- Ask for format preferences when generating files
- Provide context and reasoning in all responses`;

  }
  
  // Enhanced local AI when API is not available
  private async enhancedLocalAI(message: string, context: BusinessContext, history: any[]): Promise<string> {
    // Check if this is filter details context (has meta and stats structure)
    const isFilterDetailsContext = context && (context as any).meta && (context as any).stats;
    
    // If it's filter details context, generate insights based on that data
    if (isFilterDetailsContext) {
      return this.generateFilterDetailsInsight(context, message, history);
    }
    
    // Check if this is a business-related query
    const businessKeywords = ['business', 'sale', 'product', 'revenue', 'profit', 'expense', 'inventory', 'stock', 'transaction', 'margin', 'revenue'];
    const lowerMsg = message.toLowerCase();
    const isBusinessQuery = businessKeywords.some(keyword => lowerMsg.includes(keyword));
    
    // Understand conversation context
    const lastMessages = history.slice(-4);
    const isFollowUp = this.detectFollowUp(message);
    const topic = this.detectTopic(message, lastMessages);
    
    // If it's a business-related query, use business-specific responses
    if (isBusinessQuery || topic !== 'general') {
      // Check what kind of business question
      if (lowerMsg.includes('how') && (lowerMsg.includes('business') || lowerMsg.includes('doing') || lowerMsg.includes('performing'))) {
        return this.generatePerformanceReport(context);
      }
      
      if (lowerMsg.includes('product') || lowerMsg.includes('inventory') || lowerMsg.includes('stock')) {
        return this.generateProductInsight(context, message);
      }
      
      if (lowerMsg.includes('sale') || lowerMsg.includes('transaction') || lowerMsg.includes('revenue')) {
        return this.generateSalesInsight(context);
      }
      
      if (lowerMsg.includes('profit') || lowerMsg.includes('margin') || lowerMsg.includes('earning')) {
        return this.generateProfitabilityInsight(context);
      }
      
      // Export requests
      if (lowerMsg.includes('export') || lowerMsg.includes('download') || lowerMsg.includes('generate') && lowerMsg.includes('report')) {
        const dataType = lowerMsg.includes('sale') ? 'sales' : lowerMsg.includes('product') ? 'products' : lowerMsg.includes('expense') ? 'expenses' : 'analytics';
        const format = lowerMsg.includes('csv') ? 'CSV' : lowerMsg.includes('json') ? 'JSON' : lowerMsg.includes('excel') || lowerMsg.includes('xlsx') ? 'XLSX' : 'CSV';
        return await this.generateFileExport(dataType, format, context);
      }
    }
    
    // For non-business or general queries, provide a conversational response
    return this.generateGeneralConversationalResponse(message, context, history);
  }
  
  // Handle general conversation beyond business data
  private generateGeneralConversationalResponse(message: string, context: BusinessContext, history: any[]): string {
    const lowerMsg = message.toLowerCase();
    
    // Greetings and casual conversation
    if (lowerMsg.includes('hello') || lowerMsg.includes('hi') || lowerMsg.includes('hey')) {
      return `Hello! 👋 I'm your AI assistant, and I'm here to help you with your business.
      
I have access to your business data, so I can answer questions about:
• Your sales and revenue performance
• Product inventory and stock levels
• Expenses and financial metrics
• Business insights and recommendations

What would you like to know or talk about today?`;
    }
    
    if (lowerMsg.includes('how are you') || lowerMsg.includes('how\'s it going')) {
      return `I'm doing great, thank you for asking! 😊

I'm ready to help you with your business. Based on your current data, things are looking good:
• You have ${context.products?.length || 0} products in inventory
• Revenue stands at $${(context.analytics?.revenue || 0).toFixed(2)}
• Profit margin is ${(context.analytics?.profit_margin || 0).toFixed(1)}%

Is there anything specific you'd like to discuss or improve?`;
    }
    
    if (lowerMsg.includes('what can you do') || lowerMsg.includes('help')) {
      return this.generateContextualResponse(context, message);
    }
    
    if (lowerMsg.includes('thanks') || lowerMsg.includes('thank you')) {
      return `You're very welcome! 😊

I'm here whenever you need me. Feel free to ask me about:
• Your business performance
• Specific products or inventory
• Sales trends and analytics
• Anything else you'd like to know

What else can I help you with?`;
    }
    
    // Questions about capabilities
    if (lowerMsg.includes('who are you') || lowerMsg.includes('what are you')) {
      return `I'm an AI assistant designed to help you manage and grow your business! 

I'm embedded in your POS system, which means I have real-time access to your business data - your sales, products, expenses, and analytics.

**My capabilities:**
• Answer questions about your business using real data
• Provide insights and recommendations
• Help you make data-driven decisions
• Generate reports and exports
• Execute actions like updating products or adding expenses

Think of me like ChatGPT, but specialized for your business with direct access to your data.

What would you like to explore?`;
    }
    
    // Fallback for general questions
    return `I'm here to help! 🤖

I can have a natural conversation with you and answer questions about:
• Your business data (sales, products, expenses, etc.)
• Business insights and recommendations
• General questions you might have

I have real-time access to your business information, so I can give you specific answers based on your actual data.

What would you like to talk about? Feel free to ask me anything - whether it's about your business metrics, general questions, or just conversation!`;
  }
  
  private detectFollowUp(message: string): boolean {
    const followUpPhrases = ['yes', 'yeah', 'sure', 'ok', 'okay', 'please', 'more', 'details', 'explain', 'tell me'];
    return followUpPhrases.some(phrase => message.toLowerCase().includes(phrase));
  }
  
  private detectTopic(message: string, history: any[]): string {
    const lowerMsg = message.toLowerCase();
    
    // Check recent context
    const recentContext = history.map(m => m.content).join(' ').toLowerCase();
    
    if (lowerMsg.includes('business') || lowerMsg.includes('performance') || lowerMsg.includes('how doing')) {
      return 'business_performance';
    }
    if (lowerMsg.includes('product') || lowerMsg.includes('inventory') || lowerMsg.includes('stock')) {
      return 'products';
    }
    if (lowerMsg.includes('sale') || lowerMsg.includes('revenue') || lowerMsg.includes('transaction')) {
      return 'sales';
    }
    if (lowerMsg.includes('profit') || lowerMsg.includes('margin') || lowerMsg.includes('earning')) {
      return 'profitability';
    }
    
    return 'general';
  }
  
  private generatePerformanceReport(context: BusinessContext): string {
    const analytics = context.analytics;
    const margin = analytics?.profit_margin || 0;
    const revenue = analytics?.revenue || 0;
    const profit = analytics?.profit || 0;
    
    const health = margin > 30 ? 'excellent' : margin > 20 ? 'good' : margin > 10 ? 'moderate' : 'needs attention';
    
    return `Based on your current data, here's your business performance overview:

📊 **Financial Health:** ${health.toUpperCase()}

**Key Metrics:**
• Total Revenue: $${revenue.toFixed(2)}
• Net Profit: $${profit.toFixed(2)}
• Profit Margin: ${margin.toFixed(1)}%
• Total Sales: ${analytics?.sales_count || 0} transactions

**Business Status:**
${margin > 30 ? '✅ Excellent! Your profit margins are strong and sustainable.' : 
  margin > 20 ? '✅ Good performance! Your business is generating healthy profits.' :
  margin > 10 ? '⚠️ Your profit margin is moderate. There are opportunities for optimization.' :
  '⚠️ Your profit margin needs improvement. I recommend reviewing your pricing strategy and cost structure.'}

**Quick Insights:**
• You have ${context.products?.length || 0} products in your inventory
• Expenses: $${context.expenses?.reduce((sum: number, e: any) => sum + parseFloat(e.amount || 0), 0).toFixed(2) || '0.00'}

Would you like me to dive deeper into any specific area or help you improve your performance?`;
  }
  
  private generateProductInsight(context: BusinessContext, message: string): string {
    const products = context.products || [];
    const lowStock = products.filter((p: any) => p.stock_quantity <= p.min_stock_level);
    
    if (message.toLowerCase().includes('low') || message.toLowerCase().includes('out')) {
      if (lowStock.length > 0) {
        return `⚠️ **Low Stock Alert:**

You have ${lowStock.length} products running low on stock:

${lowStock.slice(0, 5).map((p: any) => 
  `• ${p.name}: ${p.stock_quantity} units (minimum: ${p.min_stock_level})`
).join('\n')}

**Recommendations:**
1. Order more inventory for these items
2. Consider setting up automatic reorder alerts
3. Review sales patterns to optimize stock levels
4. Contact suppliers for bulk discounts

Would you like me to help you reorder any of these items?`;
      }
      return '✅ **Stock Status:** All your products are well stocked! No immediate action needed.';
    }
    
    return `📦 **Product Overview:**

You currently have ${products.length} products across ${[...new Set(products.map((p: any) => p.category))].length} categories.

**Inventory Summary:**
${lowStock.length > 0 ? `⚠️ ${lowStock.length} items need restocking` : '✅ All items adequately stocked'}

**Recommendations:**
• Focus marketing on your top-selling products
• Optimize inventory for items with high turnover
• Review slow-moving items for potential discounts
• Consider product bundles to increase sales

Want me to identify your specific top 5 products by profitability?`;
  }
  
  private generateSalesInsight(context: BusinessContext): string {
    const sales = context.sales || [];
    const analytics = context.analytics;
    
    const recentRevenue = sales.slice(0, 10).reduce((sum: number, s: any) => sum + (parseFloat(s.total_amount) || 0), 0);
    const avgSale = sales.length > 0 ? recentRevenue / sales.length : 0;
    
    return `📈 **Sales Performance:**

**Recent Activity:**
• Total Sales: ${sales.length} transactions
• Recent Revenue: $${recentRevenue.toFixed(2)}
• Average Sale Value: $${avgSale.toFixed(2)}
• Total Revenue: $${(analytics?.revenue || 0).toFixed(2)}

**Performance Analysis:**
${sales.length > 20 ? '✅ Strong sales volume - good momentum' : 
  sales.length > 10 ? '✅ Steady sales activity - room for growth' :
  sales.length > 0 ? '⚠️ Sales activity is low - consider promotional strategies' :
  '⚠️ No recent sales - review your marketing and inventory'}

**Optimization Suggestions:**
• Analyze sales patterns to identify peak times
• Implement upselling strategies to increase average transaction value
• Create bundle deals for complementary products
• Launch promotional campaigns for slow-moving inventory

Would you like me to analyze your sales trends or suggest specific promotional strategies?`;
  }
  
  private generateProfitabilityInsight(context: BusinessContext): string {
    const analytics = context.analytics;
    const margin = analytics?.profit_margin || 0;
    const profit = analytics?.profit || 0;
    const revenue = analytics?.revenue || 0;
    
    return `💰 **Profitability Analysis:**

**Current Status:**
• Profit Margin: ${margin.toFixed(1)}%
• Net Profit: $${profit.toFixed(2)}
• Total Revenue: $${revenue.toFixed(2)}
• Total Expenses: $${(analytics?.expenses || 0).toFixed(2)}

**Assessment:**
${margin > 40 ? 'Excellent! Outstanding profitability - consider reinvesting for growth.' :
  margin > 30 ? 'Great! Very healthy profit margins.' :
  margin > 20 ? 'Good profit margin - well managed business.' :
  margin > 10 ? 'Moderate profit margin - optimization opportunities exist.' :
  'Low profit margin - urgent review of pricing and costs needed.'}

**Profitability Improvement Strategies:**
• Increase prices strategically for high-demand, low-margin items
• Reduce unnecessary expenses without impacting quality
• Focus on products/services with highest profit margins
• Negotiate better rates with suppliers
• Implement dynamic pricing based on demand

Would you like me to identify your most profitable products or help with pricing optimization?`;
  }
  
  private generateContextualResponse(context: BusinessContext, message: string): string {
    return `Hi! I'm your AI business assistant, here to help you understand and optimize your business operations.

📊 **Current Business Overview:**
• Revenue: $${(context.analytics?.revenue || 0).toFixed(2)}
• Products: ${context.products?.length || 0} in inventory
• Sales: ${context.analytics?.sales_count || 0} transactions
• Profit Margin: ${(context.analytics?.profit_margin || 0).toFixed(1)}%

🔧 **What I Can Do For You:**

**📈 Analytics & Insights:**
- Business performance analysis and reporting
- Sales trend analysis and forecasting
- Product performance evaluation
- Profitability recommendations

**📦 Inventory Management:**
- Stock level monitoring and alerts
- Product optimization suggestions
- Inventory turnover analysis
- Reorder recommendations

**💰 Financial Management:**
- Expense tracking and analysis
- Profit optimization strategies
- Cost reduction suggestions
- Revenue growth planning

**📄 Reports & Exports:**
- Generate downloadable sales reports (CSV, JSON, XLSX)
- Create expense summaries
- Export product catalogs
- Financial analysis reports

**⚡ Actions:**
- Update product information through natural language
- Add expenses and transactions
- Manage inventory levels
- Create new products or services

**💡 Ask me anything like:**
- "How is my business performing?"
- "Show me my top selling products"
- "Generate a sales report as CSV"
- "Do I need to reorder any products?"
- "What's my current profit margin?"
- "Help me add a new product called XYZ"

What would you like to explore or get help with today?`;
  }
  
  // Generate file download response
  // Generate insights for filter details context
  private generateFilterDetailsInsight(context: BusinessContext, message: string, history: any[]): string {
    const stats = (context as any).stats || {};
    const meta = (context as any).meta || {};
    const trends = (context as any).trends || [];
    
    const revenue = parseFloat(stats.total_revenue || 0);
    const profit = parseFloat(stats.profit || 0);
    const margin = parseFloat(stats.profit_margin || 0);
    const quantity = parseFloat(stats.total_quantity || 0);
    const salesCount = stats.total_sales || 0;
    const returns = stats.total_returns || 0;
    const cogs = parseFloat(stats.total_expenses || 0);
    
    const insights: string[] = [];
    
    // Financial analysis
    if (revenue > 0) {
      if (margin >= 50) {
        insights.push(`**Financial Health:** EXCELLENT - Profit margin of ${margin.toFixed(1)}% is outstanding!`);
      } else if (margin >= 30) {
        insights.push(`**Financial Health:** GOOD - ${margin.toFixed(1)}% profit margin indicates healthy operations.`);
      } else if (margin >= 20) {
        insights.push(`**Financial Health:** MODERATE - ${margin.toFixed(1)}% profit margin could be improved through cost optimization.`);
      } else if (margin > 0) {
        insights.push(`**Financial Health:** NEEDS ATTENTION - Profit margin of ${margin.toFixed(1)}% is low. Review pricing and costs.`);
      } else {
        insights.push(`**Financial Health:** CRITICAL - Operating at a loss. Immediate action required.`);
      }
      
      insights.push(`**Key Metrics:** Revenue: $${revenue.toFixed(2)}, Profit: $${profit.toFixed(2)}, Margin: ${margin.toFixed(1)}%`);
      
      if (salesCount > 0) {
        const avgRevenue = revenue / salesCount;
        insights.push(`**Average Revenue per Sale:** $${avgRevenue.toFixed(2)}`);
      }
    } else {
      insights.push(`**Status:** No sales data available for the selected filters.`);
    }
    
    // Sales performance
    if (quantity > 0) {
      insights.push(`**Sales Performance:** ${quantity} units sold across ${salesCount} transaction${salesCount !== 1 ? 's' : ''}.`);
      
      if (salesCount > 0) {
        const avgUnitsPerSale = quantity / salesCount;
        insights.push(`**Average Units per Sale:** ${avgUnitsPerSale.toFixed(1)}`);
      }
    }
    
    // Returns analysis
    if (returns > 0) {
      const returnRate = quantity > 0 ? (returns / quantity * 100).toFixed(1) : '0';
      if (parseFloat(returnRate) > 10) {
        insights.push(`**⚠️ Returns Alert:** ${returns} units returned (${returnRate}% return rate) - This is high. Investigate product quality or customer satisfaction.`);
      } else if (parseFloat(returnRate) > 5) {
        insights.push(`**Returns Notice:** ${returns} units returned (${returnRate}% return rate) - Monitor closely.`);
      } else {
        insights.push(`**Returns:** ${returns} units returned (${returnRate}% return rate) - Within acceptable range.`);
      }
    }
    
    // Trends analysis
    if (trends && trends.length > 0) {
      const recentTrend = trends.slice(-3);
      if (recentTrend.length > 1) {
        const latest = recentTrend[recentTrend.length - 1];
        const previous = recentTrend[recentTrend.length - 2];
        const revenueChange = ((latest.revenue || 0) - (previous.revenue || 0));
        if (revenueChange > 0) {
          insights.push(`**📈 Trend:** Revenue is increasing. Latest: $${parseFloat(latest.revenue || 0).toFixed(2)}`);
        } else if (revenueChange < 0) {
          insights.push(`**📉 Trend:** Revenue is decreasing. Latest: $${parseFloat(latest.revenue || 0).toFixed(2)}`);
        }
      }
    }
    
    // Recommendations
    if (revenue > 0) {
      if (margin < 20) {
        insights.push(`**Recommendations:**
• Review pricing strategy to improve margins
• Analyze cost structure for optimization opportunities
• Consider volume discounts to increase sales`);
      } else if (margin >= 20 && margin < 30) {
        insights.push(`**Recommendations:**
• Current margins are acceptable but could be improved
• Focus on high-margin items
• Monitor expenses closely`);
      } else {
        insights.push(`**Recommendations:**
• Excellent financial performance - maintain current strategy
• Consider expanding successful product lines
• Continue monitoring for consistency`);
      }
      
      if (returns > 0 && (returns / quantity) > 0.05) {
        insights.push(`• Address return issues - investigate root causes
• Improve product quality or descriptions
• Enhance customer service to reduce returns`);
      }
    } else {
      insights.push(`**Recommendations:**
• No sales data for current filters - adjust date range or filters
• Check if products/services are available in this category
• Verify inventory levels if filtering by specific items`);
    }
    
    // Item-specific insights
    if (meta.type === 'product' || meta.type === 'service') {
      insights.push(`**${meta.type.toUpperCase()} Analysis:** Focusing on "${meta.name}". Use the metrics above to evaluate performance.`);
    } else if (meta.type === 'category') {
      insights.push(`**Category Analysis:** Analyzing entire "${meta.category || meta.name}" category. Performance includes all items in this category.`);
    }
    
    return insights.join('\n\n');
  }

  async generateFileExport(dataType: string, format: string, context: BusinessContext): Promise<string> {
    let data: any[] = [];
    
    switch (dataType) {
      case 'sales':
        data = context.sales || [];
        break;
      case 'products':
        data = context.products || [];
        break;
      case 'expenses':
        data = context.expenses || [];
        break;
      case 'analytics':
        data = {
          revenue: context.analytics?.revenue || 0,
          profit: context.analytics?.profit || 0,
          margin: context.analytics?.profit_margin || 0,
          sales_count: context.analytics?.sales_count || 0
        };
        break;
      default:
        return "I can generate exports for sales, products, expenses, or analytics. Which one would you like?";
    }
    
    return `I'm ready to generate a ${format.toUpperCase()} export for your ${dataType} data.

The file will include ${Array.isArray(data) ? data.length : 'comprehensive'} records and will be downloadable immediately.

**Available formats:** CSV, JSON, XLSX, PDF

Would you like me to proceed with generating the ${dataType} report?`;
  }
}

export const aiService = new AIService();

