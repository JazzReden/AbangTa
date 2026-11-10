export function optionalString(value: FormDataEntryValue | null) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : undefined;
}

export function requiredString(value: FormDataEntryValue | null) {
  return String(value ?? '').trim();
}

export function numericField(value: FormDataEntryValue | null) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? Number(text) : undefined;
}

export function checkboxField(value: FormDataEntryValue | null) {
  return value === 'on' || value === 'true' || value === '1';
}

export function actionError(error: unknown): { error: string } {
  if (error instanceof Error) {
    if (error instanceof TypeError || error instanceof SyntaxError || error.name.includes('Prisma') || error.message.includes('prisma.') || error.message.includes('DATABASE_URL')) {
      return { error: 'Unable to save right now. Please try again later.' };
    }
    return { error: error.message };
  }
  return { error: 'An unexpected error occurred' };
}
