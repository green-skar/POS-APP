/**
 * Saves a file to the user's device, showing a save dialog if supported
 * @param {Blob} blob - The file content as a Blob
 * @param {string} filename - The suggested filename
 * @returns {Promise<void>}
 */
export async function saveFile(blob, filename) {
  // Check if File System Access API is supported
  if ('showSaveFilePicker' in window) {
    try {
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: getFileDescription(filename),
            accept: {
              [getMimeType(filename)]: [getFileExtension(filename)]
            }
          }
        ]
      });

      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (error) {
      // User cancelled the dialog or an error occurred
      if (error.name === 'AbortError') {
        // User cancelled, don't throw - just return
        return;
      }
      // For other errors, log and rethrow
      console.error('Error saving file:', error);
      throw error;
    }
  }

  // Fallback for browsers that don't support File System Access API
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

/**
 * Gets the file extension from a filename
 * @param {string} filename - The filename
 * @returns {string} The file extension (e.g., '.csv', '.json')
 */
function getFileExtension(filename) {
  const lastDot = filename.lastIndexOf('.');
  return lastDot !== -1 ? filename.substring(lastDot) : '';
}

/**
 * Gets the MIME type based on file extension
 * @param {string} filename - The filename
 * @returns {string} The MIME type
 */
function getMimeType(filename) {
  const ext = getFileExtension(filename).toLowerCase();
  const mimeTypes = {
    '.csv': 'text/csv',
    '.json': 'application/json',
    '.txt': 'text/plain',
    '.pdf': 'application/pdf',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Gets a human-readable file description
 * @param {string} filename - The filename
 * @returns {string} The file description
 */
function getFileDescription(filename) {
  const ext = getFileExtension(filename).toLowerCase();
  const descriptions = {
    '.csv': 'CSV Files',
    '.json': 'JSON Files',
    '.txt': 'Text Files',
    '.pdf': 'PDF Files',
    '.xlsx': 'Excel Files',
    '.xls': 'Excel Files'
  };
  return descriptions[ext] || 'Files';
}

