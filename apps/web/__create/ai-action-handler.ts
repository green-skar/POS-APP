// Note: sql function will be imported at runtime in the API route

interface ParsedAction {
  type: 'query' | 'action';
  category: 'product' | 'service' | 'sale' | 'expense' | 'analytics' | 'general';
  intent: string;
  parameters: Record<string, any>;
}

// Parse natural language to detect actions
export function parseUserIntent(message: string, conversationHistory: any[]): ParsedAction {
  const lowerMsg = message.toLowerCase();
  
  // Detect actions
  if (lowerMsg.includes('update') || lowerMsg.includes('change') || lowerMsg.includes('modify')) {
    if (lowerMsg.includes('product') || lowerMsg.includes('item')) {
      return {
        type: 'action',
        category: 'product',
        intent: 'update',
        parameters: extractParameters(message, ['name', 'price', 'stock', 'category'])
      };
    }
    if (lowerMsg.includes('service')) {
      return {
        type: 'action',
        category: 'service',
        intent: 'update',
        parameters: extractParameters(message, ['name', 'price', 'category'])
      };
    }
  }
  
  if (lowerMsg.includes('add') || lowerMsg.includes('create') || lowerMsg.includes('new')) {
    if (lowerMsg.includes('expense')) {
      return {
        type: 'action',
        category: 'expense',
        intent: 'create',
        parameters: extractParameters(message, ['title', 'amount', 'category'])
      };
    }
    if (lowerMsg.includes('product')) {
      return {
        type: 'action',
        category: 'product',
        intent: 'create',
        parameters: extractParameters(message, ['name', 'price', 'stock', 'category'])
      };
    }
  }
  
  if (lowerMsg.includes('delete') || lowerMsg.includes('remove')) {
    return {
      type: 'action',
      category: 'product',
      intent: 'delete',
      parameters: extractParameters(message, ['name'])
    };
  }
  
  // Detect queries
  if (lowerMsg.includes('top') || lowerMsg.includes('best')) {
    return {
      type: 'query',
      category: 'analytics',
      intent: 'top_products',
      parameters: {}
    };
  }
  
  if (lowerMsg.includes('profit') || lowerMsg.includes('revenue')) {
    return {
      type: 'query',
      category: 'analytics',
      intent: 'financial',
      parameters: {}
    };
  }
  
  if (lowerMsg.includes('stock') || lowerMsg.includes('inventory')) {
    return {
      type: 'query',
      category: 'product',
      intent: 'inventory',
      parameters: {}
    };
  }
  
  // Default to general query
  return {
    type: 'query',
    category: 'general',
    intent: 'general',
    parameters: {}
  };
}

// Extract parameters from natural language
function extractParameters(message: string, allowedKeys: string[]): Record<string, any> {
  const params: Record<string, any> = {};
  
  // Extract numbers
  const numbers = message.match(/\$?(\d+\.?\d*)/g);
  numbers?.forEach((num, idx) => {
    const value = parseFloat(num.replace('$', ''));
    if (!isNaN(value)) {
      allowedKeys.forEach(key => {
        if (key === 'price' || key === 'amount' || key === 'cost') {
          params[key] = value;
        }
      });
      if (idx === 0 && !params.price && !params.amount) {
        params.quantity = value;
      }
    }
  });
  
  // Extract text after keywords
  allowedKeys.forEach(key => {
    const pattern = new RegExp(`(?:${key}s?|${getSynonyms(key)}):?\\s*(?:is|are|at|of|$)?\\s*([a-z0-9.$\\s]+)`, 'i');
    const match = message.match(pattern);
    if (match && match[1]) {
      const value = match[1].trim();
      if (!params[key]) {
        params[key] = value;
      }
    }
  });
  
  return params;
}

function getSynonyms(key: string): string {
  const synonyms: Record<string, string[]> = {
    name: ['title'],
    price: ['cost', 'amount'],
    stock: ['quantity', 'qty', 'inventory'],
    category: ['type', 'kind']
  };
  return synonyms[key]?.join('|') || '';
}

// Execute actions based on parsed intent
export async function executeAction(intent: ParsedAction, data: any, sql: any): Promise<string> {
  try {
    switch (intent.intent) {
      case 'update':
        if (intent.category === 'product') {
          await updateProduct(intent.parameters, sql);
          return `✅ Successfully updated the product. The changes have been applied.`;
        }
        break;
        
      case 'create':
        if (intent.category === 'expense') {
          await createExpense(intent.parameters, sql);
          return `✅ Successfully added the expense. It's been recorded in your expenses.`;
        }
        if (intent.category === 'product') {
          await createProduct(intent.parameters, sql);
          return `✅ Successfully created the new product. You can now manage it from the products page.`;
        }
        break;
        
      case 'delete':
        return `⚠️ Delete operations require confirmation. Please use the admin interface for product deletion.`;
        
      default:
        return `I understand you want to perform an action, but I need more details. Can you be more specific about what you'd like to change?`;
    }
  } catch (error: any) {
    return `❌ Error: ${error.message || 'Failed to execute action. Please try again.'}`;
  }
  return '';
}

// Helper functions for database operations
export async function updateProduct(params: Record<string, any>, sql: any) {
  if (!params.name) {
    throw new Error('Product name is required');
  }
  
  const updates: string[] = [];
  const values: any[] = [];
  
  if (params.price) {
    updates.push('price = ?');
    values.push(params.price);
  }
  if (params.stock || params.quantity) {
    updates.push('stock_quantity = ?');
    values.push(params.stock || params.quantity);
  }
  if (params.category) {
    updates.push('category = ?');
    values.push(params.category);
  }
  
  if (updates.length === 0) {
    throw new Error('No valid parameters to update');
  }
  
  values.push(params.name);
  
  await sql(
    `UPDATE products SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE name = ?`,
    values
  );
}

export async function createExpense(params: Record<string, any>, sql: any) {
  if (!params.title) {
    params.title = 'Untitled Expense';
  }
  if (!params.amount) {
    throw new Error('Expense amount is required');
  }
  
  await sql(
    `INSERT INTO expenses (title, amount, category, date) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
    [params.title, params.amount, params.category || 'Other']
  );
}

export async function createProduct(params: Record<string, any>, sql: any) {
  if (!params.name) {
    throw new Error('Product name is required');
  }
  if (!params.price) {
    throw new Error('Product price is required');
  }
  
  await sql(
    `INSERT INTO products (name, price, stock_quantity, category, min_stock_level) VALUES (?, ?, ?, ?, 5)`,
    [params.name, params.price, params.stock || params.quantity || 0, params.category || 'Uncategorized']
  );
}

