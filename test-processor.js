const { loadAndProcessPowerPlants } = require('./dist/utils/powerPlantProcessor.js');

async function test() {
  try {
    const plants = await loadAndProcessPowerPlants();
    console.log('Total plants:', plants.length);
    console.log('First 5 plants:', plants.slice(0, 5));
    
    // Count by source
    const sourceCounts = {};
    plants.forEach(plant => {
      sourceCounts[plant.source] = (sourceCounts[plant.source] || 0) + 1;
    });
    
    console.log('Source counts:', sourceCounts);
  } catch (error) {
    console.error('Error:', error);
  }
}

test();