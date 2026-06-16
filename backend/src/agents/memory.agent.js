function shouldSaveMemory(message) {
  const patterns = [
    "i know",
    "i use",
    "i work with",
    "i am learning",
    "my favorite",
    "i like",
  ];

  const lowerMessage = message.toLowerCase();

  return patterns.some((pattern) => lowerMessage.includes(pattern));
}

module.exports = shouldSaveMemory;
