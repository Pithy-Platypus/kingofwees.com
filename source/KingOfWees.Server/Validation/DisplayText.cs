using System.Globalization;
using System.Text;

namespace KingOfWees.Server.Validation;

// Text a person typed that everyone else sees (nicknames, place names, the admin's name and notes). Control and format
// characters are invisible: direction overrides (U+202E) make a name read backwards, and zero-width characters make
// "Porch" and "Porch\u200B" look the same. Removed, not refused: phones and copy-paste slip them in by accident.
// Why -> docs/patterns/validation.md.
public static class DisplayText
{
    // Format characters that are part of what people write: emoji sequences (ZWJ) and Persian or Indic words (ZWNJ).
    private static readonly Rune ZeroWidthNonJoiner = new(0x200C);
    private static readonly Rune ZeroWidthJoiner = new(0x200D);

    /// <summary>The text without control, format (but ZWJ/ZWNJ), line and paragraph separator characters, trimmed; null when nothing is left.</summary>
    public static string? Clean(string? text)
    {
        if (text is null) return null;
        var kept = new StringBuilder(text.Length);
        foreach (var rune in text.EnumerateRunes())
        {
            if (rune == ZeroWidthNonJoiner || rune == ZeroWidthJoiner || !IsInvisible(Rune.GetUnicodeCategory(rune)))
            {
                kept.Append(rune);
            }
        }
        var cleaned = kept.ToString().Trim();
        return cleaned.Length == 0 ? null : cleaned;
    }

    private static bool IsInvisible(UnicodeCategory category) => category is UnicodeCategory.Control
        or UnicodeCategory.Format or UnicodeCategory.LineSeparator or UnicodeCategory.ParagraphSeparator;
}
