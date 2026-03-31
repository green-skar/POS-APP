import { apiFetch } from '@/utils/apiClient';
/**
 * Utility function to log user activities
 * @param {string} actionType - Type of action (e.g., 'button_click', 'navigation', 'theme_change')
 * @param {string} actionDescription - Human-readable description of the action
 * @param {string} entityType - Type of entity (e.g., 'button', 'route', 'theme')
 * @param {number|null} entityId - ID of the entity (if applicable)
 * @param {object|null} metadata - Additional metadata about the action
 */
export async function logActivity(actionType, actionDescription, entityType = null, entityId = null, metadata = null) {
  try {
    await apiFetch('/api/users/log-activity', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        action_type: actionType,
        action_description: actionDescription,
        entity_type: entityType,
        entity_id: entityId,
        metadata: metadata ? JSON.stringify(metadata) : null
      }),
    });
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
}

/**
 * Helper function to log button clicks
 * @param {string} buttonName - Name/identifier of the button
 * @param {string} action - What action the button performs
 * @param {object} additionalMetadata - Additional metadata about the button click
 */
export async function logButtonClick(buttonName, action, additionalMetadata = {}) {
  await logActivity(
    'button_click',
    `Clicked ${buttonName}: ${action}`,
    'button',
    null,
    {
      button_name: buttonName,
      action: action,
      ...additionalMetadata
    }
  );
}
















