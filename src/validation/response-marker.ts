export function hasTerminalValidationMarker(responseText: string, marker: string): boolean {
  if (marker.length === 0) {
    return false;
  }

  const withoutTrailingLineBreaks = responseText.replace(/(?:\r?\n)+$/u, '');
  const lines = withoutTrailingLineBreaks.split(/\r?\n/u);
  if (lines.at(-1) !== marker) {
    return false;
  }

  return countOccurrences(withoutTrailingLineBreaks, marker) === 1;
}

function countOccurrences(text: string, value: string): number {
  let count = 0;
  let offset = 0;

  while (true) {
    const index = text.indexOf(value, offset);
    if (index < 0) {
      return count;
    }
    count += 1;
    offset = index + value.length;
  }
}
