import sql from "@/app/api/utils/sql";
import { initiateSTKPush, formatPhoneNumber, isMpesaConfiguredPublic } from "@/app/api/utils/daraja";

/**
 * M-Pesa STK Push Endpoint
 * 
 * Initiates an STK Push request to the customer's phone.
 * The customer will receive a prompt on their phone to enter their M-Pesa PIN.
 * 
 * After the customer completes the payment, Safaricom will send a callback
 * to the /api/mpesa/callback endpoint.
 */
export async function POST(request) {
  try {
    const { phone_number, amount, sale_id } = await request.json();

    if (!phone_number || !amount) {
      return Response.json({ error: 'Phone number and amount are required' }, { status: 400 });
    }

    // Validate amount
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return Response.json({ error: 'Amount must be a positive number' }, { status: 400 });
    }

    // Format phone number
    let formattedPhone;
    try {
      formattedPhone = formatPhoneNumber(phone_number);
    } catch (error) {
      return Response.json({ error: `Invalid phone number format: ${error.message}` }, { status: 400 });
    }

    if (!isMpesaConfiguredPublic()) {
      // Mock: STK is "initiated" immediately; sale stays pending until simulated callback (~4s)
      console.warn('Daraja credentials not configured. Using mock STK (async completion).');

      const checkoutRequestID = `MOCK_CO_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      if (sale_id) {
        try {
          await sql`
            CREATE TABLE IF NOT EXISTS mpesa_checkout_mapping (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              checkout_request_id TEXT UNIQUE NOT NULL,
              sale_id INTEGER NOT NULL,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (sale_id) REFERENCES sales(id)
            )
          `;
          await sql`
            INSERT OR REPLACE INTO mpesa_checkout_mapping (checkout_request_id, sale_id)
            VALUES (${checkoutRequestID}, ${sale_id})
          `;
        } catch (e) {
          console.error('mpesa_checkout_mapping (mock):', e);
        }

        // Simulate customer paying on phone after a few seconds (like real Daraja callback)
        const mockTxnId = `TXN${Date.now()}${Math.random().toString(36).slice(2, 9)}`;
        const isSuccess = Math.random() > 0.15;
        setTimeout(async () => {
          try {
            if (isSuccess) {
              await sql`
                UPDATE sales
                SET payment_status = 'completed',
                    mpesa_transaction_id = ${mockTxnId},
                    mpesa_payer_name = ${'Demo Customer (mock)'}
                WHERE id = ${sale_id}
              `;
            } else {
              await sql`
                UPDATE sales SET payment_status = 'failed' WHERE id = ${sale_id}
              `;
            }
          } catch (err) {
            console.error('Mock M-Pesa delayed update:', err);
          }
        }, 4200);
      }

      return Response.json({
        success: true,
        checkoutRequestID,
        message:
          'STK Push initiated (mock). Customer prompt simulated — payment status updates in a few seconds.',
        mock: true,
        initiated: true,
      });
    }

    // Use real Daraja API
    try {
      // Initiate STK Push
      const stkResponse = await initiateSTKPush({
        phoneNumber: formattedPhone,
        amount: numericAmount,
        accountReference: sale_id ? `SALE_${sale_id}` : 'POS_SALE',
        transactionDesc: `Payment for sale ${sale_id || 'unknown'}`,
      });

      // Store checkout request ID mapping for callback
      if (sale_id && stkResponse.checkoutRequestID) {
        try {
          // Create mapping table if it doesn't exist
          await sql`
            CREATE TABLE IF NOT EXISTS mpesa_checkout_mapping (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              checkout_request_id TEXT UNIQUE NOT NULL,
              sale_id INTEGER NOT NULL,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (sale_id) REFERENCES sales(id)
            )
          `.catch(() => {
            // Table might already exist, ignore error
          });

          // Store the mapping
          await sql`
            INSERT OR REPLACE INTO mpesa_checkout_mapping (checkout_request_id, sale_id)
            VALUES (${stkResponse.checkoutRequestID}, ${sale_id})
          `;
        } catch (error) {
          console.error('Error storing checkout mapping:', error);
          // Continue even if mapping fails
        }
      }

      // Return success response
      return Response.json({
        success: true,
        merchantRequestID: stkResponse.merchantRequestID,
        checkoutRequestID: stkResponse.checkoutRequestID,
        customerMessage: stkResponse.customerMessage,
        message: 'STK Push initiated successfully. Customer will receive a prompt on their phone.',
      });

    } catch (error) {
      console.error('Error initiating STK Push:', error);
      
      // Update sale status to failed if sale_id provided
      if (sale_id) {
        await sql`
          UPDATE sales 
          SET payment_status = 'failed'
          WHERE id = ${sale_id}
        `.catch(() => {
          // Ignore errors updating sale
        });
      }

      return Response.json({
        success: false,
        message: error.message || 'Failed to initiate STK Push. Please try again.',
      }, { status: 400 });
    }

  } catch (error) {
    console.error('Error processing STK push:', error);
    return Response.json({ 
      success: false,
      error: 'Failed to process payment',
      message: error.message || 'An unexpected error occurred'
    }, { status: 500 });
  }
}