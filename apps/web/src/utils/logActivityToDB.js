import { apiFetch } from '@/utils/apiClient';
/**
 * Utility function to log activities to the activity_log table
 * This should be called from API routes, not from the frontend
 */

export async function logActivityToDB(activityData) {
  try {
    const response = await apiFetch('/api/activity-log/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(activityData)
    });

    if (!response.ok) {
      console.error('Failed to log activity:', await response.text());
    }
  } catch (error) {
    console.error('Error logging activity:', error);
  }
}















