interface ManagedTextInput {
  disabled: boolean;
  focus: () => void;
  select: () => void;
}

export function restoreManagedFormInputFocus({
  input,
  activeElement,
  body,
  isWithinForm,
  selectText = false,
}: {
  input: ManagedTextInput | null;
  activeElement: unknown;
  body: unknown;
  isWithinForm: (element: unknown) => boolean;
  selectText?: boolean;
}): boolean {
  if (!input || input.disabled) return false;

  const focusIsAvailable =
    activeElement === null ||
    activeElement === body ||
    activeElement === input ||
    isWithinForm(activeElement);
  if (!focusIsAvailable) return false;

  input.focus();
  if (selectText) input.select();
  return true;
}
