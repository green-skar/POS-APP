# How to Add Your OpenAI API Key

## Step 1: Get Your API Key

1. Go to https://platform.openai.com/api-keys
2. Sign up or log in to your OpenAI account
3. Click "Create new secret key"
4. Copy your API key (starts with `sk-`)

## Step 2: Add the Key to Your Project

### Option A: Create .env File (Recommended)

1. Navigate to the `apps/web/` folder
2. Create a file named `.env` (if it doesn't exist)
3. Add this line:
   ```
   OPENAI_API_KEY=sk-your-actual-api-key-here
   ```
4. Replace `sk-your-actual-api-key-here` with your actual key

### Option B: Use Environment Variables

On Windows (PowerShell):
```powershell
$env:OPENAI_API_KEY="sk-your-actual-api-key-here"
```

On Mac/Linux:
```bash
export OPENAI_API_KEY="sk-your-actual-api-key-here"
```

## Step 3: Restart Your Development Server

1. Stop your current dev server (Ctrl+C)
2. Restart it:
   ```bash
   npm run dev
   ```

## Step 4: Verify It Works

1. Open the AI Chat in your application
2. Ask it a general question: "What is quantum computing?"
3. If it answers naturally (not just from pre-programmed responses), it's working!

## Troubleshooting

### The AI still seems limited
- Make sure you saved the `.env` file in the correct location: `apps/web/.env`
- Make sure the API key format is correct: `OPENAI_API_KEY=sk-proj-abc123...`
- Restart your dev server after adding the key
- Check the console for any error messages about the API key

### Error: "Invalid API Key"
- Make sure there are no extra spaces in your `.env` file
- Verify your API key is valid at https://platform.openai.com/api-keys
- Make sure you have credits in your OpenAI account

### The .env file was created but not read
- On Windows, you might need to restart your terminal
- Make sure the file is in `apps/web/` directory
- Make sure there's no `.env.example` file that's being used instead

## Security Notes

⚠️ **Important:**
- Never commit your `.env` file to git (it's already in .gitignore)
- Never share your API key
- Your API key gives access to your OpenAI account
- Keep it secure

## Cost Information

OpenAI charges based on usage:
- GPT-4: ~$0.01-0.03 per 1K tokens
- GPT-3.5: ~$0.0005-0.002 per 1K tokens
- Typical conversation: 500-2000 tokens

Most users spend $5-20/month for light usage.

