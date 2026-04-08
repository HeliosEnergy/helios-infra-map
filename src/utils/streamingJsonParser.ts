/**
 * Streaming JSON parser for handling large JSON files
 * This utility can parse large JSON arrays incrementally to avoid memory issues
 */

/**
 * Parse a JSON array stream incrementally
 * @param response ReadableStream from fetch response
 * @param onItem Callback function for each item in the array
 * @param onComplete Callback when parsing is complete
 * @param onError Callback for handling errors
 */
export async function parseJsonArrayStream(
  response: Response,
  onItem: (item: any, index: number) => void,
  onComplete?: (totalItems: number) => void,
  onError?: (error: Error) => void
): Promise<void> {
  if (!response.body) {
    onError?.(new Error('Response body is null'));
    return;
  }

  try {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let itemIndex = 0;
    let inArray = false;
    let bracketCount = 0;
    let inString = false;
    let escapeNext = false;

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        onComplete?.(itemIndex);
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      
      // Process buffer for complete items
      while (buffer.length > 0) {
        let itemEnd = -1;
        
        // Look for complete items in the buffer
        for (let i = 0; i < buffer.length; i++) {
          const char = buffer[i];
          
          // Handle escape sequences
          if (escapeNext) {
            escapeNext = false;
            continue;
          }
          
          // Handle escape character
          if (char === '\\' && inString) {
            escapeNext = true;
            continue;
          }
          
          // Handle string boundaries
          if (char === '"' && !escapeNext) {
            inString = !inString;
            continue;
          }
          
          // Skip characters inside strings
          if (inString) {
            continue;
          }
          
          // Track array and object brackets
          if (char === '[' && !inString) {
            inArray = true;
            bracketCount++;
            continue;
          }
          
          if (char === ']' && !inString) {
            bracketCount--;
            if (bracketCount === 0 && inArray) {
              // End of array
              buffer = buffer.substring(i + 1);
              onComplete?.(itemIndex);
              return;
            }
            continue;
          }
          
          if (char === '{' && !inString) {
            bracketCount++;
            continue;
          }
          
          if (char === '}' && !inString) {
            bracketCount--;
            // If we've closed an object and we're at the root level of the array
            if (bracketCount === 1 && inArray) {
              itemEnd = i + 1;
              break;
            }
            continue;
          }
          
          // Handle array separators (comma)
          if (char === ',' && !inString && bracketCount === 1 && inArray) {
            itemEnd = i;
            break;
          }
        }
        
        // If we found a complete item, process it
        if (itemEnd > 0) {
          try {
            // Extract the item (excluding the trailing comma)
            const itemStr = buffer.substring(0, itemEnd);
            const item = JSON.parse(itemStr);
            onItem(item, itemIndex++);
            
            // Remove processed item from buffer (including comma)
            buffer = buffer.substring(itemEnd + 1);
          } catch (parseError) {
            console.warn('Error parsing JSON item:', parseError);
            // Skip this item and continue
            buffer = buffer.substring(itemEnd + 1);
          }
        } else {
          // No complete item found, wait for more data
          break;
        }
      }
    }
  } catch (error) {
    onError?.(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Load and process large JSON data with streaming
 * @param url URL to fetch JSON data from
 * @param processor Function to process each item
 * @returns Promise that resolves when all items are processed
 */
export async function loadLargeJsonData<T>(
  url: string,
  processor: (item: T, index: number) => void
): Promise<number> {
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to load data: ${response.statusText}`);
  }
  
  if (!response.body) {
    throw new Error('Response body is not readable');
  }
  
  return new Promise<number>((resolve, reject) => {
    let itemCount = 0;
    
    parseJsonArrayStream(
      response,
      (item, index) => {
        processor(item, index);
        itemCount = index + 1;
      },
      () => resolve(itemCount),
      reject
    );
  });
}