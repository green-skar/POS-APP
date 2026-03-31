import sql from "@/app/api/utils/sql";
import { validateCallback, parseCallback } from "@/app/api/utils/daraja";

/**
 * M-Pesa STK Push Callback Handler
 * 
 * This endpoint receives callbacks from Safaricom's Daraja API
 * when a customer completes or cancels an STK Push payment.
 * 
 * The callback is sent automatically by Safaricom after the customer
 * enters their M-Pesa PIN on their phone.
 */
export async function POST(request) {
  try {
    const callbackData = await request.json();

    // Validate callback data
    if (!validateCallback(callbackData)) {
      console.error('Invalid callback data received:', callbackData);
      return Response.json({ 
        ResultCode: 1, 
        ResultDesc: 'Invalid callback data' 
      }, { status: 400 });
    }

    // Parse callback data
    const parsed = parseCallback(callbackData);

    console.log('M-Pesa callback received:', {
      checkoutRequestID: parsed.checkoutRequestID,
      resultCode: parsed.resultCode,
      success: parsed.success,
      transactionID: parsed.transactionID,
    });

    // Extract account reference from callback metadata to find the sale
    const accountReference = callbackData.Body?.stkCallback?.CallbackMetadata?.Item?.find(
      item => item.Name === 'AccountReference'
    )?.Value;

    const payerLabel =
      parsed.firstName ||
      (parsed.phoneNumber ? `Customer (${parsed.phoneNumber})` : null);

    // If payment was successful, update the sale
    if (parsed.success && parsed.transactionID) {
      // Try to find the sale by account reference (sale ID) or checkout request ID
      let saleId = null;

      if (accountReference) {
        // Account reference might be the sale ID
        const saleIdMatch = accountReference.match(/\d+/);
        if (saleIdMatch) {
          saleId = parseInt(saleIdMatch[0]);
        }
      }

      // If we don't have sale ID from account reference, try to find by checkout request ID
      if (!saleId) {
        // Store checkout request ID to sale ID mapping in a separate table
        // For now, we'll try to extract from account reference
        // In production, you should maintain a mapping table
        const mapping = await sql`
          SELECT sale_id FROM mpesa_checkout_mapping 
          WHERE checkout_request_id = ${parsed.checkoutRequestID}
          LIMIT 1
        `.catch(() => null);

        if (mapping && mapping.length > 0) {
          saleId = mapping[0].sale_id;
        }
      }

      // Update sale if found
      if (saleId) {
        await sql`
          UPDATE sales 
          SET 
            payment_status = 'completed',
            mpesa_transaction_id = ${parsed.transactionID},
            mpesa_payer_name = ${payerLabel}
          WHERE id = ${saleId}
        `;
        console.log(`Sale ${saleId} updated with transaction ID: ${parsed.transactionID}`);
      } else {
        console.warn(`Could not find sale for checkout request ID: ${parsed.checkoutRequestID}`);
      }
    } else {
      // Payment failed or was cancelled
      // Try to find the sale and update status to failed
      const mapping = await sql`
        SELECT sale_id FROM mpesa_checkout_mapping 
        WHERE checkout_request_id = ${parsed.checkoutRequestID}
        LIMIT 1
      `.catch(() => null);

      if (mapping && mapping.length > 0) {
        const saleId = mapping[0].sale_id;
        await sql`
          UPDATE sales 
          SET payment_status = 'failed'
          WHERE id = ${saleId}
        `;
        console.log(`Sale ${saleId} marked as failed`);
      }
    }

    // Return success response to Daraja API
    return Response.json({
      ResultCode: 0,
      ResultDesc: 'Callback received and processed successfully'
    });

  } catch (error) {
    console.error('Error processing M-Pesa callback:', error);
    
    // Still return success to Daraja to acknowledge receipt
    // Log the error for investigation
    return Response.json({
      ResultCode: 0,
      ResultDesc: 'Callback received but error occurred during processing'
    });
  }
}

















