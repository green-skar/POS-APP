'use client';

import { apiFetch } from '@/utils/apiClient';
import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { 
  Send, 
  Bot, 
  User,
  Sparkles,
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Save,
  Trash2,
  History
} from 'lucide-react';
// Sidebar is now in admin layout - no need to import here

export default function AIChat() {
  // Sidebar state is now managed by AdminLayout
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  const [savedChats, setSavedChats] = useState([]);

  // Load saved chats on mount
  useEffect(() => {
    const saved = localStorage.getItem('ai-chats');
    if (saved) {
      try {
        const parsedChats = JSON.parse(saved);
        setSavedChats(parsedChats);
      } catch (e) {
        console.error('Error loading saved chats:', e);
      }
    }
  }, []);

  // Save messages to localStorage
  const saveCurrentChat = () => {
    if (messages.length <= 1) {
      toast.info('No conversation to save yet', {
        description: 'Start a conversation with the AI assistant first.',
      });
      return;
    }
    
    const chatId = Date.now();
    const chatToSave = {
      id: chatId,
      title: `Chat ${new Date().toLocaleString()}`,
      messages: messages,
      timestamp: new Date().toISOString()
    };
    
    const updatedChats = [...savedChats, chatToSave];
    setSavedChats(updatedChats);
    localStorage.setItem('ai-chats', JSON.stringify(updatedChats));
    toast.success('Chat saved successfully!', {
      description: 'Your conversation has been saved and can be accessed later.',
    });
  };

  // Load a saved chat
  const loadChat = (chatId) => {
    const chat = savedChats.find(c => c.id === chatId);
    if (chat) {
      setMessages(chat.messages);
    }
  };

  // Clear current chat
  const clearChat = () => {
    if (messages.length <= 1) {
      toast.info('Nothing to clear', {
        description: 'The conversation is already empty.',
      });
      return;
    }
    
    toast.promise(
      new Promise((resolve) => {
        setTimeout(() => {
          setMessages([{
            role: 'assistant',
            content: "Hello! I'm your AI business assistant. I can help you understand your sales, products, expenses, and analytics. Ask me anything about your business performance!",
            timestamp: new Date().toISOString()
          }]);
          resolve(true);
        }, 100);
      }),
      {
        loading: 'Clearing conversation...',
        success: 'Conversation cleared!',
        error: 'Failed to clear conversation',
      }
    );
  };

  // Fetch business data for AI context
  const { data: analyticsData } = useQuery({
    queryKey: ['analytics-summary'],
    queryFn: async () => {
      const response = await apiFetch('/api/analytics/summary');
      return response.json();
    },
  });

  const { data: salesData } = useQuery({
    queryKey: ['recent-sales'],
    queryFn: async () => {
      const response = await apiFetch('/api/sales?limit=10');
      return response.json();
    },
  });

  const { data: productsData } = useQuery({
    queryKey: ['products-for-chat'],
    queryFn: async () => {
      const response = await apiFetch('/api/products');
      return response.json();
    },
  });

  const { data: expensesData } = useQuery({
    queryKey: ['expenses-for-chat'],
    queryFn: async () => {
      const response = await apiFetch('/api/expenses');
      return response.json();
    },
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Add welcome message
    setMessages([{
      role: 'assistant',
      content: "Hi! I'm your AI business assistant. I'm here to help you understand and optimize your business operations, from sales and products to finances and analytics.\n\nI can:\n• Answer questions about your business performance\n• Provide insights and recommendations\n• Help you manage products, services, and expenses\n• Analyze trends and identify opportunities\n\nWhat would you like to know or work on today?",
      timestamp: new Date().toISOString()
    }]);
  }, []);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = {
      role: 'user',
      content: inputMessage,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      // Detect if user wants to perform an action
      const lowerQuery = inputMessage.toLowerCase();
      const isAction = lowerQuery.includes('update') || lowerQuery.includes('change') || 
                      lowerQuery.includes('add') || lowerQuery.includes('create') ||
                      lowerQuery.includes('delete') || lowerQuery.includes('remove');
      
      if (isAction) {
        // Call AI action handler
        const actionResponse = await apiFetch('/api/ai-action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: inputMessage,
            context: {
              analytics: analyticsData,
              sales: salesData,
              products: productsData,
              expenses: expensesData
            },
            conversationHistory: messages
          })
        });
        
        const actionResult = await actionResponse.json();
        const response = actionResult.response || actionResult.message;
        
        const assistantMessage = {
          role: 'assistant',
          content: response,
          timestamp: new Date().toISOString()
        };
        
        setMessages(prev => [...prev, assistantMessage]);
        
        // Invalidate queries to refresh data
        if (actionResult.refresh) {
          window.location.reload();
        }
      } else {
        // Use enhanced AI service for natural conversation
        const aiResponse = await apiFetch('/api/ai-action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: inputMessage,
            context: {
              analytics: analyticsData,
              sales: salesData,
              products: productsData,
              expenses: expensesData
            },
            conversationHistory: messages
          })
        });
        
        const result = await aiResponse.json();
        const response = result.response || "I'm processing your request...";
        
        const assistantMessage = {
          role: 'assistant',
          content: response,
          timestamp: new Date().toISOString()
        };

        setMessages(prev => [...prev, assistantMessage]);
        
        if (result.refresh) {
          setTimeout(() => window.location.reload(), 2000);
        }
      }
    } catch (error) {
      const errorMessage = {
        role: 'assistant',
        content: "I'm sorry, I encountered an error processing your request. Please try again.",
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="min-h-screen font-sans">
      <div>
        {/* Header */}
        <div className="px-4 sm:px-6 lg:px-8 py-6">
          <div className="analytics-header text-2xl mb-4 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <span>AI Business Assistant</span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={saveCurrentChat}
                className="glass-button-primary text-white font-semibold flex items-center gap-1.5 py-1 px-3 text-sm"
                title="Save current chat"
              >
                <Save size={14} />
                <span>Save Chat</span>
              </button>
              <button
                onClick={clearChat}
                className="glass-button-secondary flex items-center gap-1.5 py-1 px-3 text-sm"
                title="Clear current chat"
              >
                <Trash2 size={14} />
                <span>Clear</span>
              </button>
            </div>
          </div>
        </div>

        {/* Chat Interface */}
        <div className="flex flex-col h-[calc(100vh-120px)]">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="max-w-4xl mx-auto space-y-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`flex space-x-3 max-w-[80%] ${message.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}
                  >
                    <div
                      className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                        message.role === 'user'
                          ? 'bg-blue-500'
                          : 'bg-gradient-to-br from-purple-500 to-pink-500'
                      }`}
                    >
                      {message.role === 'user' ? (
                        <User className="h-5 w-5 text-white" />
                      ) : (
                        <Bot className="h-5 w-5 text-white" />
                      )}
                    </div>
                    <div
                      className={`px-4 py-3 rounded-lg ${
                        message.role === 'user'
                          ? 'glass-button-primary text-white'
                          : 'glass-card-pro text-analytics-primary'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      <p className={`text-xs mt-1 ${
                        message.role === 'user' ? 'text-white/80' : 'text-analytics-secondary'
                      }`}>
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="flex space-x-3 max-w-[80%]">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                      <Bot className="h-5 w-5 text-white" />
                    </div>
                    <div className="bg-white px-4 py-3 rounded-lg shadow-sm border border-gray-200">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

        {/* Quick Suggestions */}
        {messages.length <= 1 && (
          <div className="px-4 sm:px-6 lg:px-8 pb-4">
            <div className="max-w-4xl mx-auto">
              <p className="text-sm font-medium text-analytics-secondary mb-3">Try asking:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { icon: DollarSign, text: 'How is my business doing?', query: 'How is my business performing overall?' },
                  { icon: TrendingUp, text: 'Show me my best products', query: 'What are my top selling products?' },
                  { icon: ShoppingCart, text: 'Recent sales activity', query: 'Tell me about my recent sales' },
                  { icon: DollarSign, text: 'Profit and revenue analysis', query: 'What is my current profit margin?' },
                ].map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setInputMessage(suggestion.query);
                      setTimeout(() => handleSendMessage(), 100);
                    }}
                    className="flex items-center space-x-2 p-3 glass-card-pro transition-all text-left group"
                  >
                    <suggestion.icon className="h-5 w-5 text-analytics-primary" />
                    <span className="text-sm text-analytics-primary">{suggestion.text}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

          {/* Input Area */}
          <div className="glass-panel px-4 sm:px-6 lg:px-8 py-4">
            <div className="max-w-4xl mx-auto">
              <div className="flex space-x-4">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask me anything about your business..."
                  className="glass-input flex-1 px-4 py-3"
                  disabled={isLoading}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!inputMessage.trim() || isLoading}
                  className="glass-button-primary px-3 py-1 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1.5 text-sm"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// AI Response Generator (simulated - in production, replace with actual AI API)
function generateAIResponse(query, analytics, sales, products, expenses, conversationHistory = []) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const lowerQuery = query.toLowerCase();
      
      // Get the last few messages for context
      const recentMessages = conversationHistory.slice(-6);
      
      // Detect follow-up questions
      const isFollowUp = lowerQuery.includes('yes') || lowerQuery.includes('okay') || lowerQuery.includes('please') || 
                        lowerQuery.includes('more') || lowerQuery.includes('details') || lowerQuery.includes('explain');
      
      // Try to understand what the previous conversation was about
      let previousContext = '';
      if (recentMessages.length >= 2) {
        const lastAssistantMsg = recentMessages.filter(m => m.role === 'assistant').pop();
        const lastUserMsg = recentMessages.filter(m => m.role === 'user').pop();
        
        if (lastAssistantMsg && lastUserMsg) {
          previousContext = lastAssistantMsg.content.toLowerCase();
          
          // If this is a follow-up, extract what was being discussed
          if (isFollowUp) {
            // Look for specific topics in the previous message
            if (previousContext.includes('improve') || previousContext.includes('recommendation')) {
              return resolve(getDetailedImprovementAnalysis(analytics, sales, products, expenses));
            }
            if (previousContext.includes('product') || previousContext.includes('selling')) {
              return resolve(getDetailedProductAnalysis(analytics, sales, products));
            }
            if (previousContext.includes('sales') || previousContext.includes('transaction')) {
              return resolve(getDetailedSalesAnalysis(analytics, sales));
            }
            if (previousContext.includes('expense') || previousContext.includes('cost')) {
              return resolve(getDetailedExpenseAnalysis(expenses));
            }
            // Generic follow-up
            return resolve(getDetailedBusinessAnalysis(analytics, sales, products, expenses));
          }
        }
      }
      
      // Handle improvement questions
      if (lowerQuery.includes('improve') || lowerQuery.includes('how to get better') || lowerQuery.includes('what should i do')) {
        const revenue = analytics?.revenue || 0;
        const profit = analytics?.profit || 0;
        const margin = analytics?.profit_margin || 0;
        const expenses_total = analytics?.expenses || 0;
        
        let suggestions = [];
        
        if (margin < 10) {
          suggestions.push('• Increase your profit margin by reducing expenses or increasing prices');
        }
        if (expenses_total > revenue * 0.5) {
          suggestions.push('• Your expenses are high relative to revenue - review and reduce unnecessary costs');
        }
        if (!suggestions.length && revenue > 0) {
          suggestions.push('• Continue tracking your sales trends to identify growth patterns');
          suggestions.push('• Focus on promoting your top-selling products');
        }
        
        const baseSuggestions = [
          '• Analyze your top-selling products and ensure adequate inventory',
          '• Review your pricing strategy - compare with market rates',
          '• Focus on marketing your most profitable items',
          '• Track customer buying patterns to optimize inventory',
          '• Implement cost-saving measures in operational expenses'
        ];
        
        resolve(`Here are actionable ways to improve your business: 🚀

**Current Performance:**
• Revenue: $${revenue.toFixed(2)}
• Profit: $${profit.toFixed(2)}
• Profit Margin: ${margin.toFixed(1)}%

**Specific Recommendations:**

${suggestions.length > 0 ? suggestions.join('\n') : baseSuggestions.join('\n')}

**General Best Practices:**
• Regularly review and update your product prices based on costs
• Maintain optimal inventory levels to avoid stockouts or overstocking
• Track seasonal trends in your sales data
• Build relationships with suppliers to reduce costs
• Consider diversifying your product offerings based on customer demand

Would you like me to analyze any specific aspect of your business in more detail?`);
      }
      
      // Analyze query and generate contextual response
      if (lowerQuery.includes('performance') || lowerQuery.includes('business') || lowerQuery.includes('revenue')) {
        const revenue = analytics?.revenue || 0;
        const profit = analytics?.profit || 0;
        const margin = analytics?.profit_margin || 0;
        
        resolve(`Your business is currently performing well! 📊

Key Metrics:
• Total Revenue: $${revenue.toFixed(2)}
• Net Profit: $${profit.toFixed(2)}
• Profit Margin: ${margin.toFixed(1)}%

${margin > 20 ? 'Great! Your profit margin is healthy. 💰' : margin > 10 ? 'Your profit margin is decent, but there\'s room for improvement.' : 'Consider reviewing your expenses and pricing strategy to improve profitability.'}`);
      } else if (lowerQuery.includes('top product') || lowerQuery.includes('best selling')) {
        const productCount = products?.length || 0;
        resolve(`You currently have ${productCount} products in your inventory. 

To see your top-selling products, I'd recommend checking the "Top Products by Profitability" section in the Analytics dashboard. This will show you which products are generating the most revenue and profit.

Would you like me to help you optimize your product mix based on your sales data?`);
      } else if (lowerQuery.includes('sales') || lowerQuery.includes('transaction')) {
        const salesCount = sales?.length || 0;
        const recentRevenue = sales?.slice(0, 5).reduce((sum, s) => sum + (parseFloat(s.total_amount) || 0), 0) || 0;
        
        resolve(`Recent Sales Summary: 💳

• Recent Transactions: ${salesCount} sales in the system
• Recent Revenue: $${recentRevenue.toFixed(2)}

Your sales data shows consistent activity. To dive deeper, I recommend:
1. Check the Sales page for detailed transaction history
2. Review the Analytics dashboard for trends
3. Analyze top-selling items to optimize inventory

Would you like to know more about any specific sales period?`);
      } else if (lowerQuery.includes('expense') || lowerQuery.includes('cost')) {
        const totalExpenses = expenses?.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0) || 0;
        const expenseCount = expenses?.length || 0;
        
        resolve(`Expense Overview: 💸

• Total Expenses: $${totalExpenses.toFixed(2)}
• Expense Records: ${expenseCount}

${expenses && expenses.length > 0 ? 'Your expense tracking is active. Review the Expenses page for detailed breakdowns by category.' : 'You don\'t have any expenses recorded yet. Start tracking expenses to get better insights into your cost structure.'}`);
      } else if (lowerQuery.includes('help') || lowerQuery.includes('what can you do')) {
        resolve(`I can help you with various aspects of your business! 🤖

📊 **Analytics & Performance**
- Business performance overview
- Revenue and profit analysis
- Sales trends and patterns

🛍️ **Sales & Products**
- Top-selling products
- Sales insights and recommendations
- Inventory management tips

💰 **Financial Management**
- Expense tracking and analysis
- Profit optimization strategies
- Cost reduction suggestions

💡 **Smart Insights**
- AI-powered business recommendations
- Trend identification
- Performance optimization tips

Just ask me any question about your business!`);
      } else if (lowerQuery.includes('profit') || lowerQuery.includes('margin')) {
        const profit = analytics?.profit || 0;
        const margin = analytics?.profit_margin || 0;
        
        resolve(`Your Profit Analysis: 📈

• Net Profit: $${profit.toFixed(2)}
• Profit Margin: ${margin.toFixed(1)}%

${margin > 30 ? 'Excellent! You have a very healthy profit margin. 🎉' : margin > 15 ? 'Good profit margin. Consider scaling successful products.' : margin > 0 ? 'Your profit margin needs improvement. Consider reducing costs or increasing prices.' : 'You\'re not profitable yet. Review your pricing and expenses.'}

I recommend:
1. Analyzing your highest-margin products
2. Reducing or eliminating unprofitable items
3. Optimizing your expense categories`);
      } else {
        resolve(`I'm here to help you with your business! 🤖

I can analyze:
• Your sales performance and revenue
• Top products and profitability
• Expense breakdowns and costs
• Business trends and patterns

${analytics ? `Based on your current data, I can see you have ${analytics.sales_count || 0} sales and $${(analytics.revenue || 0).toFixed(2)} in revenue.` : ''}

What specific aspect of your business would you like me to explain?`);
      }
    }, 800 + Math.random() * 500); // Simulate typing delay
  });
}

// Detailed analysis functions for follow-ups
function getDetailedBusinessAnalysis(analytics, sales, products, expenses) {
  const revenue = analytics?.revenue || 0;
  const profit = analytics?.profit || 0;
  const margin = analytics?.profit_margin || 0;
  
  return `Let me provide a comprehensive analysis of your business: 📊

**Financial Overview:**
• Total Revenue: $${revenue.toFixed(2)}
• Net Profit: $${profit.toFixed(2)}
• Profit Margin: ${margin.toFixed(1)}%
• Total Sales: ${analytics?.sales_count || 0}

**Key Insights:**

1. **Revenue Performance**
${revenue > 10000 ? '✅ Your revenue is strong. Consider reinvesting profits for growth.' : revenue > 5000 ? '⚠️ Revenue is decent. Focus on increasing sales volume.' : '⚠️ Revenue needs improvement. Review your pricing and marketing strategies.'}

2. **Profitability Analysis**
${margin > 30 ? '✅ Excellent profit margin! Your business is highly profitable.' : margin > 20 ? '✅ Good profit margin. Maintain your current strategy.' : margin > 10 ? '⚠️ Moderate profit margin. Look for cost optimization opportunities.' : '⚠️ Low profit margin. Review your pricing and expenses.'}

3. **Strategic Recommendations**
• Focus on your top 3 best-selling products
• Track customer buying patterns by analyzing sales data
• Optimize inventory to reduce holding costs
• Consider implementing loyalty programs to increase repeat purchases
• Review seasonal trends to plan inventory

Would you like me to dive deeper into any specific area like sales trends, product performance, or expense optimization?`;
}

function getDetailedImprovementAnalysis(analytics, sales, products, expenses) {
  const revenue = analytics?.revenue || 0;
  const profit = analytics?.profit || 0;
  const margin = analytics?.profit_margin || 0;
  const expenses_total = analytics?.expenses || 0;
  
  return `Here's a detailed improvement plan for your business: 🎯

**1. Revenue Optimization**
${revenue > 0 ? `Your current revenue is $${revenue.toFixed(2)}. To increase it:` : 'To start generating revenue:'}
• Identify your top 3 products and increase their promotion
• Create bundle deals to increase average transaction value
• Implement upselling strategies at checkout
• Launch limited-time promotions to drive sales
• Expand your product range in high-performing categories

**2. Cost Management**
${expenses_total > 0 ? `Current expenses: $${expenses_total.toFixed(2)}` : 'No expenses recorded yet'}
• Negotiate better rates with suppliers
• Reduce unnecessary operational expenses
• Optimize inventory levels to minimize carrying costs
• Review subscription services and eliminate unused ones
• Track expense categories to identify cost reduction opportunities

**3. Profitability Enhancement**
Your current profit margin: ${margin.toFixed(1)}%
• Focus on products with the highest profit margins
• Consider adjusting prices for low-margin items
• Eliminate or reduce unprofitable product lines
• Implement dynamic pricing based on demand
• Bulk purchasing to reduce cost per unit

**4. Sales & Marketing**
• Analyze sales trends to identify peak periods
• Run targeted marketing campaigns for your best products
• Leverage customer data to personalize offers
• Implement referral programs to acquire new customers
• Use social media to promote products and build brand

**Immediate Actions:**
1. Review last week's top 10 products
2. Check inventory levels for fast-moving items
3. Analyze which payment methods your customers prefer
4. Identify any products with declining sales

Want me to help you create an action plan for any of these areas?`;
}

function getDetailedProductAnalysis(analytics, sales, products) {
  const productCount = products?.length || 0;
  
  return `Let me analyze your product performance in detail: 📦

**Product Inventory Overview:**
• Total Products: ${productCount}
• Categories: ${[...new Set(products?.map(p => p.category) || [])].join(', ') || 'Not specified'}

**Key Product Insights:**

1. **Inventory Health**
• Review stock levels for items with high demand
• Identify slow-moving products that may need promotion
• Ensure you have adequate stock for top sellers

2. **Product Recommendations**
• Focus marketing on your top-performing products
• Consider discontinuing low-performing items
• Bundle complementary products to increase sales
• Add variations (sizes, flavors) to popular products

3. **Pricing Strategy**
• Analyze competitor pricing in your market
• Adjust prices based on demand and costs
• Implement promotional pricing for slow-moving items
• Use psychological pricing (e.g., $9.99 instead of $10)

4. **Product Placement**
• Display top products prominently
• Create product bundles and deals
• Cross-promote related items
• Use product recommendations at checkout

Would you like me to identify your specific top 5 products by sales or profitability?`;
}

function getDetailedSalesAnalysis(analytics, sales) {
  const salesCount = sales?.length || 0;
  const recentRevenue = sales?.slice(0, 10).reduce((sum, s) => sum + (parseFloat(s.total_amount) || 0), 0) || 0;
  const avgSale = salesCount > 0 ? recentRevenue / salesCount : 0;
  
  return `Here's a detailed analysis of your sales performance: 📈

**Sales Overview:**
• Total Sales: ${salesCount}
• Recent Revenue: $${recentRevenue.toFixed(2)}
• Average Sale Value: $${avgSale.toFixed(2)}

**Sales Insights:**

1. **Sales Trends**
• Analyze daily, weekly, and monthly patterns
• Identify peak sales hours and days
• Track sales growth over time
• Compare current period with previous periods

2. **Customer Behavior**
• Most popular payment methods: Cash, Card, M-Pesa
• Average items per transaction
• Best-selling time of day
• Seasonal buying patterns

3. **Sales Optimization Strategies**
• Increase average transaction value through upselling
• Implement quick checkout for faster service
• Create loyalty programs to encourage repeat purchases
• Use data to predict demand and stock accordingly

4. **Revenue Growth Tactics**
• Promote high-margin products more aggressively
• Create special offers during slow periods
• Expand product assortment in popular categories
• Implement referral programs

**Action Items:**
1. Review your sales dashboard for trends
2. Identify your top 5 customers by value
3. Check which days/hours have the most sales
4. Analyze which products are frequently bought together

Need help optimizing your sales strategy or analyzing specific sales data?`;
}

function getDetailedExpenseAnalysis(expenses) {
  const totalExpenses = expenses?.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0) || 0;
  const expenseCount = expenses?.length || 0;
  
  return `Let me analyze your expense structure in detail: 💸

**Expense Overview:**
• Total Expenses: $${totalExpenses.toFixed(2)}
• Number of Records: ${expenseCount}
${expenseCount > 0 ? `• Average Expense: $${(totalExpenses / expenseCount).toFixed(2)}` : ''}

**Expense Categories:**
${expenses && expenses.length > 0 ? expenses.reduce((acc, e) => {
  acc[e.category] = (acc[e.category] || 0) + parseFloat(e.amount);
  return acc;
}, {}) : 'No category data available'}

**Cost Management Strategies:**

1. **Expense Tracking**
   • Categorize all expenses for better analysis
   • Set budgets for each expense category
   • Review expenses monthly to identify trends
   • Track recurring vs. one-time expenses

2. **Cost Optimization**
   • Identify unnecessary or duplicate expenses
   • Negotiate better rates with suppliers and vendors
   • Consider bulk purchasing for discounts
   • Review subscriptions and cancel unused services

3. **Expense Reduction Tips**
   • Automate processes to reduce labor costs
   • Go paperless to save on supplies
   • Optimize inventory to reduce holding costs
   • Shop around for better insurance rates
   • Use energy-efficient equipment

4. **Budget Management**
   • Set monthly expense budgets
   • Track actual vs. budgeted expenses
   • Create contingency funds for unexpected costs
   • Regularly review and adjust budgets

Would you like me to help you create an expense reduction plan or set up expense budgets?`;
}
