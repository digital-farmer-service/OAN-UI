/**
 * Avatar initials, as the old ChatMessage computed them (80adef9 src/components/ChatMessage.tsx:74-92):
 * a URL-encoded name is decoded first ("Ravi%20Pratap" -> "Ravi Pratap"); one word gives its first
 * two characters, two or more words give the first letters of the first two; nothing gives "U".
 */
export function getInitials(name?: string): string {
	if (!name) return "U";

	let decoded = name;
	try {
		decoded = decodeURIComponent(name);
	} catch {
		// Not valid URI encoding (e.g. "100% kisan"): use the raw name.
	}

	const words = decoded
		.trim()
		.split(/\s+/)
		.filter((word) => word.length > 0);

	if (words.length === 0) return "U";
	if (words.length === 1) return words[0]!.substring(0, 2).toUpperCase();
	return (words[0]!.charAt(0) + words[1]!.charAt(0)).toUpperCase();
}
