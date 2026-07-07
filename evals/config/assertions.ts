export const jsonShapeAssertions = [
  {
    type: "javascript",
    value: `try {
  JSON.parse(output);
  return true;
} catch {
  return false;
}`,
  },
  {
    type: "javascript",
    value: `const parsed = JSON.parse(output);
return Array.isArray(parsed.searchTerms);`,
  },
] as const;

export const plainTextAssertions = [
  {
    type: "javascript",
    value: `return typeof output === 'string' && output.trim().length > 0;`,
  },
] as const;
