const fs = require('fs');

// Read the CSV file
const data = fs.readFileSync('public/data/canada_power_plants_2025-09-10T06-37-39-198Z.csv', 'utf8');
const lines = data.split('\n');

// Get the header
const headers = lines[0].split(',');
const outputIndex = headers.indexOf('output');

console.log('Output index:', outputIndex);

// Arrays to store outputs
const outputs = [];

// Process each line
for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  
  // Simple CSV parsing (not perfect but should work for this data)
  const fields = [];
  let field = '';
  let inQuotes = false;
  
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      fields.push(field);
      field = '';
    } else {
      field += char;
    }
  }
  fields.push(field); // Push the last field
  
  // Get the output field
  if (fields[outputIndex]) {
    const outputStr = fields[outputIndex];
    // Extract numeric value (e.g., "6,232 MW" -> 6232)
    const match = outputStr.match(/[\d,]+/);
    if (match) {
      const output = parseFloat(match[0].replace(/,/g, ''));
      if (!isNaN(output)) {
        outputs.push(output);
      }
    }
  }
}

// Find min and max
if (outputs.length > 0) {
  const min = Math.min(...outputs);
  const max = Math.max(...outputs);
  console.log('Min output:', min);
  console.log('Max output:', max);
  console.log('Sample outputs:', outputs.slice(0, 10));
} else {
  console.log('No valid outputs found');
}