import sql from "@/app/api/utils/sql";

// STK Push simulation (replace with actual M-Pesa integration)
export async function POST(request) {
  try {
    const { phone_number, amount, sale_id } = await request.json();

    if (!phone_number || !amount) {
      return Response.json({ error: 'Phone number and amount are required' }, { status: 400 });
    }

    // Simulate STK push request
    // In a real implementation, you would integrate with Safaricom's M-Pesa API
    const transaction_id = `TXN${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
    
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Simulate success/failure (90% success rate for demo)
    const isSuccess = Math.random() > 0.1;
    
    if (isSuccess) {
      // Update sale status if sale_id provided
      if (sale_id) {
        await sql`
          UPDATE sales 
          SET payment_status = 'completed', mpesa_transaction_id = ${transaction_id}
          WHERE id = ${sale_id}
        `;
      }

      return Response.json({
        success: true,
        transaction_id,
        message: 'Payment completed successfully'
      });
    } else {
      // Update sale status to failed if sale_id provided
      if (sale_id) {
        await sql`
          UPDATE sales 
          SET payment_status = 'failed'
          WHERE id = ${sale_id}
        `;
      }

      return Response.json({
        success: false,
        message: 'Payment failed. Please try again.'
      }, { status: 400 });
    }
  } catch (error) {
    console.error('Error processing STK push:', error);
    return Response.json({ error: 'Failed to process payment' }, { status: 500 });
  }
}