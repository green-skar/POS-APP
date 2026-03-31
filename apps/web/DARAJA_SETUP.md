# Daraja (M-Pesa) API Integration Setup

This guide will help you set up the Daraja (M-Pesa) API integration for development and production.

## Overview

The Daraja API integration allows customers to pay via M-Pesa STK Push. When a customer selects M-Pesa as their payment method, they will receive a prompt on their phone to enter their M-Pesa PIN to complete the payment.

## Prerequisites

1. **Safaricom Developer Account**
   - Sign up at [Safaricom Developer Portal](https://developer.safaricom.co.ke/)
   - Create an app and get your credentials

2. **For Development (Sandbox)**
   - Use sandbox credentials provided by Safaricom
   - Test with sandbox test phone numbers

3. **For Production**
   - Complete the Daraja API onboarding process
   - Get production credentials from Safaricom
   - Set up a callback URL (must be publicly accessible)

## Environment Variables

Create a `.env` file in the `apps/web` directory with the following variables:

### Development (Sandbox)

```env
# Daraja API Credentials (Sandbox)
MPESA_CONSUMER_KEY=your_sandbox_consumer_key
MPESA_CONSUMER_SECRET=your_sandbox_consumer_secret
MPESA_SHORTCODE=your_sandbox_shortcode
MPESA_PASSKEY=your_sandbox_passkey

# Daraja API Base URL (Sandbox)
MPESA_BASE_URL=https://sandbox.safaricom.co.ke

# Callback URL (must be publicly accessible for production)
# For development, use ngrok or similar to expose your local server
MPESA_CALLBACK_URL=https://your-domain.com/api/mpesa/callback

# Base URL of your application
BASE_URL=http://localhost:3000
```

### Production

```env
# Daraja API Credentials (Production)
MPESA_CONSUMER_KEY=your_production_consumer_key
MPESA_CONSUMER_SECRET=your_production_consumer_secret
MPESA_SHORTCODE=your_production_shortcode
MPESA_PASSKEY=your_production_passkey

# Daraja API Base URL (Production)
MPESA_BASE_URL=https://api.safaricom.co.ke

# Callback URL (must be publicly accessible)
MPESA_CALLBACK_URL=https://your-domain.com/api/mpesa/callback

# Base URL of your application
BASE_URL=https://your-domain.com
```

## Getting Sandbox Credentials

1. **Visit the Safaricom Developer Portal**
   - Go to [https://developer.safaricom.co.ke/](https://developer.safaricom.co.ke/)
   - Sign up or log in

2. **Create an App**
   - Navigate to "My Apps"
   - Click "Create App"
   - Select "Daraja API" as the product
   - Fill in the app details

3. **Get Your Credentials**
   - After creating the app, you'll see:
     - **Consumer Key**
     - **Consumer Secret**
   - Copy these values

4. **Get Sandbox Test Credentials**
   - Go to "Test Credentials" section
   - Copy:
     - **Shortcode** (usually `174379`)
     - **Passkey** (for sandbox, this is provided by Safaricom)

## Setting Up Callback URL with ngrok (Recommended)

For local installs (including `.exe`), expose the host app to the internet so Safaricom can reach your callback endpoint.

### Install and authenticate ngrok

1. **Create ngrok account**
   - Sign up at [https://ngrok.com/](https://ngrok.com/)
   - Copy your auth token from dashboard

2. **Install ngrok**
   ```bash
   # Windows (winget)
   winget install ngrok.ngrok
   ```

3. **Set auth token once**
   ```bash
   ngrok config add-authtoken <YOUR_NGROK_AUTHTOKEN>
   ```

### Start app + tunnel (host machine)

1. **Run the app on the host machine**
   - Dev host: `http://localhost:4000`
   - Installed `.exe`: run the app and confirm local access in browser

2. **Start ngrok tunnel to the app port**
   ```bash
   ngrok http 4000
   ```

3. **Copy HTTPS forwarding URL** (example: `https://abc123.ngrok-free.app`)

4. **Set callback URL in Admin UI (preferred)**
   - Open **Admin -> Payment Settings**
   - Set callback URL to:
   ```text
   https://abc123.ngrok-free.app/api/mpesa/callback
   ```
   - Save settings

5. **If you use env fallback instead of Admin UI**
   ```env
   MPESA_CALLBACK_URL=https://abc123.ngrok-free.app/api/mpesa/callback
   ```

6. **(If required by your Safaricom app profile) update callback URL on Developer Portal**
   - Set to the same ngrok URL + `/api/mpesa/callback`

### Standalone vs distributed

- **Standalone:** run app and ngrok on the same machine, then use that callback URL.
- **Distributed (LAN clients):** run app and ngrok only on the **host/server** machine; all other client PCs point to host app over LAN.

### Daily startup checklist

1. Start host app (or `.exe`)
2. Start `ngrok http 4000`
3. Confirm callback URL in Admin Payment Settings matches current ngrok URL
4. Run a small STK test payment

### Option 2: Using Cloudflare Tunnel

Similar to ngrok, but using Cloudflare's free tunnel service.

## Testing

### Test Phone Numbers (Sandbox)

Safaricom provides test phone numbers for sandbox testing. Check the Safaricom Developer Portal for the current test numbers.

### Test Flow

1. **Start your application**
   ```bash
   cd apps/web
   npm run dev
   ```

2. **Add items to cart** in the POS system

3. **Select M-Pesa as payment method**

4. **Enter a test phone number** (from Safaricom sandbox)

5. **Click "Complete Sale"**
   - The customer should receive a prompt on their phone
   - Enter the test PIN provided by Safaricom
   - The payment should be processed

6. **Check the callback**
   - Safaricom will send a callback to `/api/mpesa/callback`
   - The sale status will be updated automatically

## Mock Mode

If Daraja credentials are not configured, the system will automatically fall back to mock mode. This allows you to test the payment flow without setting up Daraja credentials.

In mock mode:
- The payment will be simulated (90% success rate)
- No actual STK Push will be sent
- The sale will be marked as completed or failed randomly

## Production Setup

### 1. Complete Daraja API Onboarding

1. **Submit your application** to Safaricom for Daraja API access
2. **Complete KYC requirements**
3. **Get approved** for production credentials

### 2. Get Production Credentials

Once approved, Safaricom will provide:
- Production Consumer Key
- Production Consumer Secret
- Production Shortcode
- Production Passkey

### 3. Set Up Production Callback URL

- Your callback URL must be publicly accessible
- Must use HTTPS
- Safaricom will verify the URL during onboarding

### 4. Update Environment Variables

Update your production `.env` file with production credentials.

### 5. Test in Production

Before going live:
1. Test with small amounts first
2. Verify callbacks are working
3. Monitor logs for any issues

## Troubleshooting

### Common Issues

1. **"Daraja credentials not configured"**
   - Check that all environment variables are set
   - Verify variable names match exactly

2. **"Failed to authenticate with Daraja API"**
   - Verify Consumer Key and Consumer Secret are correct
   - Check that your app is active in the Safaricom Developer Portal

3. **"Invalid phone number format"**
   - Phone numbers must be in format: 254XXXXXXXXX
   - The system will automatically format numbers starting with 0 or without country code

4. **"Callback not received"**
   - Ensure your callback URL is publicly accessible
   - Check that the URL is correct in both .env and Safaricom Developer Portal
   - Verify your server is running and accessible

5. **"STK Push not received on phone"**
   - Verify you're using a valid test phone number (sandbox)
   - Check that the phone number format is correct
   - Ensure you have sufficient balance (for production)

## API Endpoints

### STK Push Request
- **Endpoint**: `POST /api/mpesa/stk-push`
- **Body**:
  ```json
  {
    "phone_number": "254712345678",
    "amount": 100.00,
    "sale_id": 123
  }
  ```

### Callback Handler
- **Endpoint**: `POST /api/mpesa/callback`
- **Description**: Receives callbacks from Safaricom when payment is completed
- **Note**: This endpoint is called automatically by Safaricom

## Security Notes

1. **Never commit credentials to version control**
   - Add `.env` to `.gitignore`
   - Use environment variables for all sensitive data

2. **Use HTTPS in production**
   - Callback URLs must use HTTPS
   - Safaricom requires HTTPS for callbacks

3. **Validate callbacks**
   - In production, verify callback signatures
   - Only accept callbacks from Safaricom IPs

4. **Rate limiting**
   - Implement rate limiting for STK Push requests
   - Prevent abuse of the payment system

## Support

- **Safaricom Developer Portal**: [https://developer.safaricom.co.ke/](https://developer.safaricom.co.ke/)
- **Daraja API Documentation**: Check the Safaricom Developer Portal for API documentation
- **Support**: Contact Safaricom support through the developer portal

## Additional Resources

- [Safaricom Developer Portal](https://developer.safaricom.co.ke/)
- [Daraja API Documentation](https://developer.safaricom.co.ke/documentation)
- [ngrok Documentation](https://ngrok.com/docs)

















