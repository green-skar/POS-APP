import type { Config } from '@react-router/dev/config';

export default {
	appDirectory: './src/app',
	ssr: true,
	// Removed prerender config to fix build error with wildcard pattern
	// If you need prerendering, specify exact routes instead of wildcards
} satisfies Config;
