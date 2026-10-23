function getDemoRecommendations(specs) {
  const recommendations = [];
  const totalMemory = Number(specs?.ram?.totalGB);
  const logicalCores = Number(specs?.cpu?.cores);
  const gpuModel = String(specs?.gpu?.model || 'Unknown');
  const storage = Array.isArray(specs?.storage) ? specs.storage : [];

  if (totalMemory > 0 && totalMemory <= 8) {
    recommendations.push('Memory is limited for modern games and heavy multitasking. Consider closing unused apps or planning a RAM upgrade.');
  } else if (totalMemory > 8 && totalMemory <= 16) {
    recommendations.push('For demanding games, check memory use before launch and close apps you do not need.');
  } else if (totalMemory > 16) {
    recommendations.push('Memory capacity looks suitable for gaming and multitasking; review actual usage if a game stutters.');
  }

  if (logicalCores > 0 && logicalCores <= 4) {
    recommendations.push('This processor has four or fewer logical cores. Use balanced settings and limit unnecessary background workloads.');
  }

  if (!gpuModel || gpuModel === 'Unknown') {
    recommendations.push('The graphics adapter could not be identified. Check Device Manager and use the GPU manufacturer’s official driver source.');
  } else {
    recommendations.push(`Graphics adapter detected: ${gpuModel}. Keep its driver current using the manufacturer’s official support tool.`);
  }

  if (storage.length === 0) {
    recommendations.push('Storage details were unavailable. Check that your Windows drive has adequate free space before installing large games or updates.');
  } else {
    recommendations.push('Storage devices were detected. Check free space and drive health in Windows; this preview does not change or benchmark them.');
  }

  recommendations.push('Preview scan only: no settings, startup items, files, or registry values have been changed.');
  return recommendations;
}

module.exports = { getDemoRecommendations };
